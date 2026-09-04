/**
 * Estado das gerações de horário em segundo plano (tabela `geracao_jobs`).
 *
 * Vai direto no `pg` em vez de passar pelo shim de query-builder: aqui há
 * `uuid[]`, índice parcial único e `interval`, que são justamente as coisas que
 * o shim não cobre. Mesmo caminho já usado em `src/lib/auth/password-reset.ts`.
 */

import { randomUUID } from 'crypto';
import { getPool } from '@/lib/db/pool';
import type { ConfiguracaoGerminacao, PendenciaDetalhada } from '@/lib/types';

export type StatusJob = 'executando' | 'concluido' | 'falhou' | 'cancelado' | 'interrompido';

export type ConfigJob = {
    nome: string;
    configGerminacao: ConfiguracaoGerminacao[];
    permitirMesmoProfDisciplinasMesmoDia: boolean;
    /**
     * Opcional porque o `config` é jsonb e os jobs gravados antes desta opção
     * existir não têm o campo. Quem lê trata a ausência como `true` — o motor
     * sempre permitiu, e uma geração retomada não pode mudar de regra no meio.
     */
    permitirMaisDeDuasAulasProfNaTurma?: boolean;
    /**
     * `turno_id` → `horario_id` que serve de ponto de partida daquele turno.
     *
     * É o "regerar a partir de": a grade escolhida entra como ponto de partida
     * da busca, e o resultado sai o mais parecido com ela que o cadastro de hoje
     * permitir. Turno sem entrada aqui gera do zero (ou da memória, como sempre).
     *
     * Por turno, e não um id só, porque um `horario` pertence a um turno e a
     * geração pode abranger vários. Opcional: os jobs gravados antes disso não
     * têm o campo, e ausência significa o comportamento de sempre.
     */
    basePorTurno?: Record<string, string>;
};

export type GeracaoJob = {
    id: string;
    escola_id: string;
    criado_por: string | null;
    turno_ids: string[];
    config: ConfigJob;
    status: StatusJob;
    turno_atual_id: string | null;
    turno_atual_nome: string | null;
    turnos_concluidos: number;
    tentativas: number;
    orcamento: number;
    melhor_pendentes: number | null;
    cancelamento_solicitado: boolean;
    horarios_gerados: string[];
    erro: string | null;
    diagnostico: any | null;
    /** Só indica que existe grade parcial guardada — o conteúdo vem por `lerGradeParcial`. */
    tem_grade_parcial: boolean;
    turno_parcial_nome: string | null;
    heartbeat: string;
    created_at: string;
    concluido_em: string | null;
};

/**
 * `aulas_parciais` fica de fora de propósito: são centenas de aulas e a tela
 * consulta este conjunto a cada 3 segundos enquanto a geração corre. O conteúdo
 * só é lido quando o usuário decide salvar a grade incompleta.
 */
const COLUNAS = `
    id, escola_id::text as escola_id, criado_por, turno_ids, config, status,
    turno_atual_id, turno_atual_nome, turnos_concluidos, tentativas, orcamento,
    melhor_pendentes, cancelamento_solicitado, horarios_gerados, erro, diagnostico,
    (aulas_parciais is not null) as tem_grade_parcial, turno_parcial_nome,
    heartbeat, created_at, concluido_em
`;

/**
 * Um job "executando" cujo processo dono morreu (restart do pm2, reboot, queda)
 * ficaria assim para sempre — e o índice parcial único impediria qualquer nova
 * geração naquela unidade, travando a tela de vez.
 *
 * O heartbeat é renovado a cada rodada (~11s). Passados 90s sem sinal, o dono
 * não existe mais: o job vira 'interrompido', a tela informa e o botão reabilita.
 * Chamado na leitura, que é barata e idempotente — não precisa de hook de boot.
 */
const LIMITE_HEARTBEAT_S = Number(process.env.SHETO_JOB_HEARTBEAT_LIMITE_S) || 90;

export async function marcarOrfaos(): Promise<number> {
    const pool = getPool();
    const { rowCount } = await pool.query(
        `update public.geracao_jobs
            set status = 'interrompido',
                concluido_em = now(),
                erro = coalesce(erro, 'O servidor foi reiniciado durante o processamento.')
          where status = 'executando'
            and heartbeat < now() - make_interval(secs => $1::int)`,
        [LIMITE_HEARTBEAT_S]
    );
    return rowCount ?? 0;
}

export class GeracaoEmAndamentoError extends Error {
    constructor() {
        super('Já existe uma geração em andamento nesta unidade. Aguarde ou interrompa a atual.');
        this.name = 'GeracaoEmAndamentoError';
    }
}

export async function criarJob(params: {
    escolaId: string;
    criadoPor: string | null;
    turnoIds: string[];
    config: ConfigJob;
    orcamento: number;
}): Promise<GeracaoJob> {
    // Sem isto, um job órfão de um restart anterior bloquearia a criação pelo
    // índice parcial, e o usuário veria "já existe uma geração" sem ter nenhuma.
    await marcarOrfaos();

    const pool = getPool();
    try {
        const { rows } = await pool.query(
            `insert into public.geracao_jobs
                 (id, escola_id, criado_por, turno_ids, config, orcamento, turnos_concluidos)
             values ($1, $2, $3, $4, $5, $6, 0)
             returning ${COLUNAS}`,
            [randomUUID(), params.escolaId, params.criadoPor, params.turnoIds,
             JSON.stringify(params.config), params.orcamento]
        );
        return rows[0] as GeracaoJob;
    } catch (err: any) {
        // 23505 aqui só pode ter vindo do índice parcial de um job ativo por escola.
        if (err?.code === '23505') throw new GeracaoEmAndamentoError();
        throw err;
    }
}

export async function lerJob(jobId: string): Promise<GeracaoJob | null> {
    const { rows } = await getPool().query(
        `select ${COLUNAS} from public.geracao_jobs where id = $1`,
        [jobId]
    );
    return (rows[0] as GeracaoJob) ?? null;
}

/**
 * O job que a tela deve mostrar: o ativo, ou — não havendo — o último desfecho,
 * para que quem volta à página depois do fim ainda veja o que aconteceu.
 */
export async function lerJobRelevante(escolaId: string): Promise<GeracaoJob | null> {
    await marcarOrfaos();
    const { rows } = await getPool().query(
        `select ${COLUNAS}
           from public.geracao_jobs
          where escola_id = $1
          order by (status = 'executando') desc, created_at desc
          limit 1`,
        [escolaId]
    );
    return (rows[0] as GeracaoJob) ?? null;
}

/** Renova o heartbeat e grava o progresso. Chamado na virada de cada rodada. */
export async function atualizarProgresso(jobId: string, p: {
    tentativas: number;
    turnoAtualId?: string | null;
    turnoAtualNome?: string | null;
    turnosConcluidos?: number;
    melhorPendentes?: number | null;
}): Promise<{ cancelamentoSolicitado: boolean }> {
    const { rows } = await getPool().query(
        `update public.geracao_jobs
            set heartbeat = now(),
                tentativas = $2::int,
                turno_atual_id = coalesce($3::uuid, turno_atual_id),
                turno_atual_nome = coalesce($4::text, turno_atual_nome),
                turnos_concluidos = coalesce($5::int, turnos_concluidos),
                -- least() ignora NULL: o primeiro valor entra e os seguintes só
                -- descem. É esse mínimo que a parada por estagnação observa.
                melhor_pendentes = least(melhor_pendentes, $6::int)
          where id = $1
          returning cancelamento_solicitado`,
        [jobId, p.tentativas, p.turnoAtualId ?? null, p.turnoAtualNome ?? null,
         p.turnosConcluidos ?? null, p.melhorPendentes ?? null]
    );
    return { cancelamentoSolicitado: rows[0]?.cancelamento_solicitado === true };
}

export async function registrarHorarioGerado(jobId: string, horarioId: string): Promise<void> {
    await getPool().query(
        `update public.geracao_jobs
            set horarios_gerados = array_append(horarios_gerados, $2::uuid),
                heartbeat = now()
          where id = $1`,
        [jobId, horarioId]
    );
}

/**
 * Guarda a melhor grade incompleta de um turno que não fechou.
 *
 * Só a última sobrevive: numa geração multi-turno, oferecer ao usuário a grade
 * parcial de um turno intermediário que ele já esqueceu confundiria mais do que
 * ajudaria — a que interessa é a do turno que acabou de falhar.
 */
export async function registrarParcial(
    jobId: string,
    turnoId: string,
    turnoNome: string,
    aulas: any[]
): Promise<void> {
    if (aulas.length === 0) return;
    await getPool().query(
        `update public.geracao_jobs
            set aulas_parciais = $2::jsonb,
                turno_parcial_id = $3::uuid,
                turno_parcial_nome = $4::text
          where id = $1`,
        [jobId, JSON.stringify(aulas), turnoId, turnoNome]
    );
}

export async function lerGradeParcial(
    jobId: string
): Promise<{
    escolaId: string;
    turnoId: string;
    turnoNome: string;
    aulas: any[];
    pendencias: PendenciaDetalhada[];
} | null> {
    const { rows } = await getPool().query(
        `select escola_id::text as escola_id, turno_parcial_id, turno_parcial_nome, aulas_parciais, diagnostico
           from public.geracao_jobs
          where id = $1 and aulas_parciais is not null`,
        [jobId]
    );
    const linha = rows[0];
    if (!linha || !linha.turno_parcial_id) return null;
    return {
        escolaId: linha.escola_id,
        turnoId: linha.turno_parcial_id,
        turnoNome: linha.turno_parcial_nome ?? '',
        aulas: linha.aulas_parciais ?? [],
        // Viaja junto da grade: é o que explica cada buraco depois de salva.
        pendencias: linha.diagnostico?.pendenciasDetalhadas ?? [],
    };
}

/** Depois de salva, a grade parcial não deve mais ser oferecida. */
export async function limparGradeParcial(jobId: string): Promise<void> {
    await getPool().query(
        `update public.geracao_jobs
            set aulas_parciais = null, turno_parcial_id = null, turno_parcial_nome = null
          where id = $1`,
        [jobId]
    );
}

export async function solicitarCancelamento(jobId: string): Promise<boolean> {
    const { rowCount } = await getPool().query(
        `update public.geracao_jobs
            set cancelamento_solicitado = true
          where id = $1 and status = 'executando'`,
        [jobId]
    );
    return (rowCount ?? 0) > 0;
}

export async function finalizarJob(jobId: string, status: Exclude<StatusJob, 'executando'>, p: {
    erro?: string | null;
    diagnostico?: any | null;
    tentativas?: number;
} = {}): Promise<void> {
    await getPool().query(
        `update public.geracao_jobs
            set status = $2,
                concluido_em = now(),
                heartbeat = now(),
                erro = coalesce($3::text, erro),
                diagnostico = coalesce($4::jsonb, diagnostico),
                tentativas = coalesce($5::int, tentativas),
                turno_atual_id = null,
                turno_atual_nome = null
          where id = $1`,
        [jobId, status, p.erro ?? null,
         p.diagnostico ? JSON.stringify(p.diagnostico) : null,
         p.tentativas ?? null]
    );
}
