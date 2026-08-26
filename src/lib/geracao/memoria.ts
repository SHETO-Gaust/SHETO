/**
 * Memória do gerador: o que a busca aprendeu numa geração e reaproveita na
 * seguinte (tabelas `geracao_memoria` e `geracao_padroes`).
 *
 * Nada aqui é fonte de verdade. É tudo dica: o motor revalida cada aula herdada
 * contra as restrições atuais antes de aceitá-la, e o que não passa é descartado
 * em silêncio. Apagar as tabelas não quebra a geração — só a faz recomeçar do
 * zero, como antes.
 *
 * Vai direto no `pg`, como `job-store.ts`: são jsonb grandes e um upsert com
 * condição, coisas que o shim de query-builder não cobre.
 */

import { createHash } from 'crypto';
import { getPool } from '@/lib/db/pool';

export type MemoriaTurno = {
    /** Hash dos dados de entrada quando esta grade foi produzida. */
    impressao: string;
    grade: any[];
    pendentes: number;
    pesos: Record<string, number>;
    geracoes: number;
    /** true = o cadastro não mudou desde então; a grade vale inteira. */
    atual: boolean;
};

/**
 * Impressão digital dos dados que determinam a grade.
 *
 * Serve para saber se a memória envelheceu. Precisa cobrir tudo que muda o
 * resultado — turno, turmas, cargas, vínculos de professor, restrições,
 * travamentos e a geminação pedida — e precisa ser estável: a ordem em que o
 * banco devolve as linhas varia, então tudo é ordenado antes de entrar no hash.
 * Sem isso a impressão mudaria sozinha entre duas leituras idênticas e a memória
 * nunca seria usada.
 *
 * A geminação entrou depois, e a falta dela custou caro: como a configuração não
 * pesava no hash, mudar "geminar 2x" na tela deixava a memória respondendo
 * "cadastro inalterado". A grade lembrada, montada sob outro contrato, voltava
 * inteira — e o motor gastava a geração toda em cima de uma grade que já nascia
 * fora do pedido.
 */
export function calcularImpressao(dados: {
    turnoData: any;
    turmasDoTurno: any[];
    allProfessores: any[];
    aulasFixas: any[];
    configGerminacao?: { componente_id: string; geminar?: boolean; tamanho_bloco?: number }[];
}): string {
    const partes: string[] = [];

    const t = dados.turnoData;
    partes.push(`turno:${t.id}:${t.aulas_por_dia}:${[...(t.dias_semana || [])].sort().join(',')}`);
    partes.push(`horarios:${(t.horarios || []).map((h: any) => `${h.inicio}-${h.fim}`).join(',')}`);

    for (const turma of [...dados.turmasDoTurno].sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
        const comps = [...(turma.serie?.componentes || [])]
            .sort((a: any, b: any) => String(a.componente_id).localeCompare(String(b.componente_id)))
            .map((c: any) => `${c.componente_id}:${c.aulas_presenciais}:${c.aulas_nao_presenciais}`)
            .join(',');
        const profs = [...(turma.professores || [])]
            .sort((a: any, b: any) => String(a.componente_id).localeCompare(String(b.componente_id)))
            .map((p: any) => `${p.componente_id}:${p.professor_id}`)
            .join(',');
        partes.push(`turma:${turma.id}:${turma.serie?.id}:[${comps}]:[${profs}]`);
        partes.push(`serieRestr:${turma.id}:${JSON.stringify(turma.serie?.restricoes ?? null)}`);
    }

    for (const p of [...dados.allProfessores].sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
        const ld = [...(p.livre_docencia || [])]
            .map((x: any) => `${x.dia}/${x.periodo}`)
            .sort()
            .join(',');
        partes.push(
            `prof:${p.id}:${p.sem_preferencia_livre_docencia}:[${ld}]:` +
            `${estavel(p.restricoes)}:[${[...(p.dias_preferidos || [])].sort().join(',')}]`
        );
    }

    for (const f of [...dados.aulasFixas].sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
        partes.push(`fixa:${f.turma_id}:${f.componente_id}:${f.tipo_aula}:${f.dia_semana}:${f.aula_index}`);
    }

    // Só o que o motor de fato lê: quem não gemina, ou gemina em bloco de 1, não
    // gera requisito nenhum e não pode mudar a impressão ao ser marcado.
    const gem = (dados.configGerminacao ?? [])
        .filter(c => c.geminar && (c.tamanho_bloco ?? 0) > 1)
        .map(c => `${c.componente_id}:${c.tamanho_bloco}`)
        .sort();
    partes.push(`geminacao:[${gem.join(',')}]`);

    return createHash('sha256').update(partes.join('\n')).digest('hex').slice(0, 32);
}

/** JSON com chaves ordenadas — `JSON.stringify` normal não garante ordem estável. */
function estavel(valor: unknown): string {
    if (valor === null || valor === undefined) return 'null';
    if (typeof valor !== 'object') return JSON.stringify(valor);
    if (Array.isArray(valor)) return `[${valor.map(estavel).join(',')}]`;
    const chaves = Object.keys(valor as Record<string, unknown>).sort();
    return `{${chaves.map(k => `${JSON.stringify(k)}:${estavel((valor as any)[k])}`).join(',')}}`;
}

export async function lerMemoria(
    escolaId: string,
    turnoId: string,
    impressaoAtual: string,
): Promise<MemoriaTurno | null> {
    const { rows } = await getPool().query(
        `select impressao, melhor_grade, pendentes, pesos, geracoes
           from public.geracao_memoria
          where escola_id = $1 and turno_id = $2`,
        [escolaId, turnoId]
    );
    const linha = rows[0];
    if (!linha) return null;

    return {
        impressao: linha.impressao,
        grade: Array.isArray(linha.melhor_grade) ? linha.melhor_grade : [],
        pendentes: linha.pendentes ?? 0,
        pesos: linha.pesos ?? {},
        geracoes: linha.geracoes ?? 0,
        atual: linha.impressao === impressaoAtual,
    };
}

/**
 * Guarda o resultado — mas só se ele for melhor que o que já está lá, ou se o
 * cadastro tiver mudado (caso em que a grade antiga perdeu a validade e a nova,
 * mesmo pior, é a que corresponde aos dados de hoje).
 *
 * Os pesos são sempre atualizados: saber onde a busca costuma travar continua
 * valendo mesmo depois de o cadastro mudar.
 */
export async function gravarMemoria(params: {
    escolaId: string;
    turnoId: string;
    impressao: string;
    grade: any[];
    pendentes: number;
    pesos: Record<string, number>;
}): Promise<void> {
    if (params.grade.length === 0) return;

    await getPool().query(
        `insert into public.geracao_memoria
             (escola_id, turno_id, impressao, melhor_grade, pendentes, pesos, geracoes, atualizado_em)
         values ($1, $2, $3, $4::jsonb, $5, $6::jsonb, 1, now())
         on conflict (escola_id, turno_id) do update set
             -- grade e impressão só trocam quando a nova é melhor OU quando a
             -- guardada já não corresponde ao cadastro atual
             melhor_grade = case
                 when excluded.pendentes <= public.geracao_memoria.pendentes
                   or public.geracao_memoria.impressao <> excluded.impressao
                 then excluded.melhor_grade else public.geracao_memoria.melhor_grade end,
             pendentes = case
                 when excluded.pendentes <= public.geracao_memoria.pendentes
                   or public.geracao_memoria.impressao <> excluded.impressao
                 then excluded.pendentes else public.geracao_memoria.pendentes end,
             impressao = case
                 when excluded.pendentes <= public.geracao_memoria.pendentes
                   or public.geracao_memoria.impressao <> excluded.impressao
                 then excluded.impressao else public.geracao_memoria.impressao end,
             pesos = excluded.pesos,
             geracoes = public.geracao_memoria.geracoes + 1,
             atualizado_em = now()`,
        [
            params.escolaId, params.turnoId, params.impressao,
            JSON.stringify(params.grade), params.pendentes,
            JSON.stringify(limitarPesos(params.pesos)),
        ]
    );
}

/**
 * Os pesos crescem sem limite ao longo de uma geração longa e a maioria vale
 * zero ou quase. Guardar só os que dizem alguma coisa mantém o jsonb pequeno e
 * evita que um valor gigante de ontem domine a ordenação de amanhã.
 */
function limitarPesos(pesos: Record<string, number>, maximo = 300): Record<string, number> {
    const entradas = Object.entries(pesos).filter(([, v]) => v > 0);
    if (entradas.length === 0) return {};

    entradas.sort((a, b) => b[1] - a[1]);
    const cortadas = entradas.slice(0, maximo);

    // Normaliza para 0-100: o que importa é a ordem relativa, não a escala.
    const teto = cortadas[0][1] || 1;
    return Object.fromEntries(cortadas.map(([k, v]) => [k, Math.max(1, Math.round((v / teto) * 100))]));
}

/* -------------------------------------------------------------------------- */
/*                        PADRÕES AGREGADOS DA REDE                           */
/* -------------------------------------------------------------------------- */

/**
 * Desliga o perfil agregado entre unidades. Existe porque é o componente de
 * menor retorno de todo o sistema de memória — escolas têm turnos, matrizes e
 * corpos docentes muito diferentes, e o sinal é fraco. Se atrapalhar, some.
 */
const USAR_PADROES = process.env.SHETO_USAR_PADROES_GLOBAIS !== '0';

/**
 * Chave de um padrão. Só categorias genéricas.
 *
 * Nada de professor, turma ou escola aqui dentro — nem no nome nem no valor.
 * Esta é a única tabela do sistema que cruza unidades, e é por ela que um
 * vazamento entre escolas aconteceria.
 */
const chavePadrao = (siglaComponente: string, diaSemana: string, aulaIndex: number) =>
    `comp=${siglaComponente}|dia=${diaSemana}|aula=${aulaIndex}`;

/**
 * Devolve, por chave, a fatia das aulas daquele componente que historicamente
 * cai naquele horário — entre 0 e 1.
 *
 * `sucessos` são as aulas do componente naquele slot; `tentativas`, o total de
 * aulas do componente. A razão é a distribuição do componente pela semana:
 * "Educação Física costuma cair nas últimas aulas" vira um número.
 */
export async function lerPadroes(): Promise<Record<string, number>> {
    if (!USAR_PADROES) return {};
    const { rows } = await getPool().query(
        `select chave, sucessos, tentativas from public.geracao_padroes where tentativas > 0`
    );
    const mapa: Record<string, number> = {};
    for (const r of rows) {
        // Suavização de Laplace: uma chave vista duas vezes não vira verdade
        // absoluta. Com amostra pequena o valor fica perto do neutro.
        mapa[r.chave] = (Number(r.sucessos) + 1) / (Number(r.tentativas) + 10);
    }
    return mapa;
}

/**
 * Registra onde as aulas de cada componente acabaram caindo numa grade fechada.
 * Só grade completa conta: grade com pendência não é exemplo de nada.
 */
export async function registrarPadroes(
    grade: any[],
    siglaPorComponente: Map<string, string>,
): Promise<void> {
    if (!USAR_PADROES || grade.length === 0) return;

    const porSlot = new Map<string, number>();
    const totalPorSigla = new Map<string, number>();

    for (const a of grade) {
        const sigla = siglaPorComponente.get(a.componente_id);
        if (!sigla) continue;
        const k = chavePadrao(sigla, a.dia_semana, a.aula_index);
        porSlot.set(k, (porSlot.get(k) ?? 0) + 1);
        totalPorSigla.set(sigla, (totalPorSigla.get(sigla) ?? 0) + 1);
    }
    if (porSlot.size === 0) return;

    const chaves = [...porSlot.keys()];
    const sucessos = chaves.map(k => porSlot.get(k)!);
    // Denominador: total de aulas daquele componente nesta grade. É o que
    // transforma a contagem numa proporção comparável entre escolas de tamanhos
    // diferentes — sem isso uma escola grande dominaria a média da rede.
    const totais = chaves.map(k => totalPorSigla.get(k.split('|')[0].slice('comp='.length)) ?? 1);

    await getPool().query(
        `insert into public.geracao_padroes (chave, sucessos, tentativas)
         select chave, s, t from unnest($1::text[], $2::bigint[], $3::bigint[]) as u(chave, s, t)
         on conflict (chave) do update set
             sucessos = public.geracao_padroes.sucessos + excluded.sucessos,
             tentativas = public.geracao_padroes.tentativas + excluded.tentativas,
             atualizado_em = now()`,
        [chaves, sucessos, totais]
    );
}
