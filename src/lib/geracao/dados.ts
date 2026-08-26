/**
 * Carga dos dados que o motor de geração precisa.
 *
 * Vivia dentro de `gerarhorarios/actions.ts`, mas o orquestrador da geração em
 * segundo plano roda FORA de uma requisição e `actions.ts` é `'use server'` —
 * arquivo assim só pode exportar funções async, então nem o cache nem os tipos
 * poderiam sair de lá. Daí a mudança de casa.
 */

import { createClient } from '@/lib/supabase/server';
import type { Turno, ConfiguracaoGerminacao } from '@/lib/types';
// Leitura sem guard, de propósito: o orquestrador roda fora de uma requisição e
// os guards das Server Actions resolvem a sessão pelos cookies. Ver
// `src/lib/dados/leitura.ts`. A autorização acontece antes, ao criar o job.
import { lerProfessores, lerTurmas, lerTurnos } from '@/lib/dados/leitura';
import { calcularImpressao, lerMemoria, lerPadroes, type MemoriaTurno } from './memoria';

export type DadosDaGeracao = {
    turnoData: Turno;
    turmasDoTurno: any[];
    allProfessores: any[];
    allTurnos: Turno[];
    ocupacoes: any[];
    aulasFixas: any[];
    /** Hash dos dados acima; identifica se a memória guardada ainda vale. */
    impressao: string;
    /** Melhor grade e pesos da última geração deste turno. Ausente na primeira vez. */
    memoria: MemoriaTurno | null;
    /** Distribuição histórica agregada da rede. Vazio se desligado por env. */
    padroes: Record<string, number>;
};

/**
 * Cache do conjunto de dados de uma geração.
 *
 * Nada disso muda durante a geração, e a varredura de `horario_aulas` é a
 * consulta mais cara do sistema — só cresce com o histórico de grades. Com o
 * laço no servidor a carga já acontece uma vez por turno, mas o cache continua
 * valendo: ele é o que evita reler tudo quando a tela e o orquestrador pedem os
 * mesmos dados, e mantém `getTurmas`/`getProfessores` fora do caminho quente.
 *
 * TTL curto e invalidação explícita nas mutações: entre um turno e o seguinte a
 * chave muda (inclui o turnoId), então a geração multi-turno continua enxergando
 * a pré-produção que o turno anterior acabou de gravar.
 */
const CACHE_TTL_MS = Number(process.env.SHETO_GERACAO_CACHE_MS) || 30_000;

declare global {
    // eslint-disable-next-line no-var
    var __shetoCacheGeracao: Map<string, { expiraEm: number; dados: DadosDaGeracao }> | undefined;
}

function cacheGeracao() {
    if (!global.__shetoCacheGeracao) global.__shetoCacheGeracao = new Map();
    return global.__shetoCacheGeracao;
}

/** Chamado por toda mutação de horário: os dados em cache podem ter ficado velhos. */
export function invalidarCacheGeracao() {
    global.__shetoCacheGeracao?.clear();
}

/**
 * Carrega tudo que o motor precisa. Lança em qualquer falha de leitura — um
 * erro engolido aqui gerava uma grade "sem conflito nenhum" só porque a
 * consulta de ocupações voltou vazia, e o choque só aparecia depois de publicado.
 */
export async function carregarDadosDaGeracao(
    escolaId: string,
    turnoId: string,
    statusOcupacao: string[],
    /**
     * Entra na impressão digital da memória: uma grade lembrada só vale se tiver
     * sido montada sob a MESMA geminação que se está pedindo agora.
     */
    configGerminacao: ConfiguracaoGerminacao[] = []
): Promise<DadosDaGeracao> {
    const assinaturaGeminacao = configGerminacao
        .filter(c => c.geminar && c.tamanho_bloco > 1)
        .map(c => `${c.componente_id}:${c.tamanho_bloco}`)
        .sort()
        .join(',');
    const chave = `${escolaId}|${turnoId}|${statusOcupacao.join(',')}|${assinaturaGeminacao}`;
    const emCache = cacheGeracao().get(chave);
    if (emCache && emCache.expiraEm > Date.now()) return emCache.dados;

    const supabase = await createClient();

    const [
        { data: allTurmas, error: turmasError },
        { data: allProfessores, error: professoresError },
        { data: allTurnos, error: turnosError },
        turnoResult
    ] = await Promise.all([
        lerTurmas(escolaId),
        lerProfessores(escolaId),
        lerTurnos(escolaId),
        supabase.from('turnos').select('*').eq('id', turnoId).maybeSingle()
    ]);

    if (turmasError) throw new Error(`Falha ao ler as turmas: ${turmasError}`);
    if (professoresError) throw new Error(`Falha ao ler os professores: ${professoresError}`);
    if (turnosError) throw new Error(`Falha ao ler os turnos: ${turnosError}`);
    if (turnoResult.error) throw new Error(`Falha ao ler o turno: ${turnoResult.error.message}`);
    if (!turnoResult.data) throw new Error('Turno não encontrado.');

    const turnoData = turnoResult.data as Turno;
    const turmasDoTurno = allTurmas?.filter(t => t.serie?.turno_id === turnoId) || [];

    if (turmasDoTurno.length === 0) {
        throw new Error(`Nenhuma turma vinculada ao turno "${turnoData.nome}". Verifique o Passo 6.`);
    }

    // Ocupações para detecção de conflitos (professor identificado por CPF global,
    // porque o mesmo docente pode estar cadastrado em mais de uma unidade).
    const cpfs = allProfessores?.map(p => p.cpf).filter(Boolean) || [];
    const allTeacherIds = allProfessores?.map(p => p.id) || [];
    const { data: globalProfessors, error: globalProfError } =
        await supabase.from('professores').select('id').in('cpf', cpfs);
    if (globalProfError) throw new Error(`Falha ao ler os professores de outras unidades: ${globalProfError.message}`);
    const professorIdsGlobais = Array.from(new Set([...allTeacherIds, ...(globalProfessors?.map(p => p.id) || [])]));

    const aulaSelectFields = `
            id, professor_id, dia_semana, aula_index, tipo, horario_id, turno_id,
            professor:professores(nome_horario, restricoes, cpf),
            turma:turmas(id, nome),
            componente:componentes_curriculares(id, nome),
            horario:horarios!inner(id, status, turno_id, turno:turnos(*))
        `;

    // Uma consulta por status: o .in() sobre coluna de tabela relacionada (!inner)
    // não é suportado pelo query-builder e devolveria vazio em silêncio.
    //
    // 'pre_producao' importa na geração "Todos os Turnos": cada turno é salvo
    // como pré-produção antes de o próximo ser gerado, e é isso que impede o
    // segundo turno de realocar professores nos slots NP que o primeiro reservou.
    const resultados = await Promise.all(
        statusOcupacao.map(status =>
            supabase
                .from('horario_aulas')
                .select(aulaSelectFields)
                .in('professor_id', professorIdsGlobais)
                .eq('horarios.status', status)
        )
    );

    const ocupacoesBrutas: any[] = [];
    resultados.forEach((r, i) => {
        if (r.error) throw new Error(`Falha ao ler as grades com status "${statusOcupacao[i]}": ${r.error.message}`);
        ocupacoesBrutas.push(...(r.data || []));
    });

    // ── FILTRO ANTI-FALSO-CONFLITO ──────────────────────────────────────────────
    // Aulas do próprio turno sendo gerado saem do conjunto: versões antigas dele
    // marcariam os professores como "globalmente ocupados" nos mesmos slots que a
    // nova grade precisa usar, produzindo uma falha que não existe.
    const ocupacoes = ocupacoesBrutas.filter(o => (o.horario as any)?.turno_id !== turnoId);

    // Aulas fixas das turmas deste turno. A fixação é por turma desde a migração
    // 20260812 — antes valia para a série inteira.
    const turmaIds = turmasDoTurno.map((t: any) => t.id).filter(Boolean);
    let aulasFixas: any[] = [];
    if (turmaIds.length > 0) {
        const { data: fixas, error: fixasError } = await supabase
            .from('turmas_aulas_fixas')
            .select('*')
            .in('turma_id', turmaIds);
        if (fixasError) throw new Error(`Falha ao ler as aulas fixas: ${fixasError.message}`);
        aulasFixas = fixas || [];
    }

    // ── LOG DE DIAGNÓSTICO ───────────────────────────────────────────────────
    if (process.env.NODE_ENV !== 'production' || process.env.TIMETABLE_DEBUG === '1') {
        console.log(`[GERADOR DEBUG] turnoId=${turnoId} status=${statusOcupacao.join('+')}`);
        console.log(`[GERADOR DEBUG] ocupações globais brutas: ${ocupacoesBrutas.length}`);
        console.log(`[GERADOR DEBUG] removidas por ser do próprio turno: ${ocupacoesBrutas.length - ocupacoes.length}`);
        console.log(`[GERADOR DEBUG] ocupações globais passadas ao motor: ${ocupacoes.length}`);

        const porProf = new Map<string, number>();
        ocupacoes.forEach(o => {
            const nome = (o.professor as any)?.nome_horario || o.professor_id;
            porProf.set(nome, (porProf.get(nome) || 0) + 1);
        });
        if (porProf.size > 0) {
            console.log(`[GERADOR DEBUG] professores com ocupações externas (top 5):`);
            [...porProf.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .forEach(([nome, count]) => console.log(`  - ${nome}: ${count} slots ocupados em outros turnos`));
        }
    }

    // Memória: a melhor grade que este turno já produziu e os pesos aprendidos.
    // A impressão é calculada sobre os dados recém-lidos e diz se aquela grade
    // ainda corresponde ao cadastro de hoje.
    const impressao = calcularImpressao({
        turnoData,
        turmasDoTurno,
        allProfessores: allProfessores || [],
        aulasFixas,
        configGerminacao,
    });
    const [memoria, padroes] = await Promise.all([
        lerMemoria(escolaId, turnoId, impressao).catch(err => {
            // Memória é conveniência: se a leitura falhar, gerar do zero continua
            // sendo um desfecho correto. Derrubar a geração por isso não seria.
            console.error('[geracao] falha ao ler a memoria do turno:', err);
            return null;
        }),
        lerPadroes().catch(() => ({} as Record<string, number>)),
    ]);

    if (process.env.NODE_ENV !== 'production' || process.env.TIMETABLE_DEBUG === '1') {
        console.log(
            `[GERADOR DEBUG] memoria: ${memoria
                ? `${memoria.grade.length} aulas, ${memoria.pendentes} pendentes, ` +
                  `${Object.keys(memoria.pesos).length} pesos, cadastro ${memoria.atual ? 'IGUAL' : 'MUDOU'}`
                : 'nenhuma (primeira geracao deste turno)'}`
        );
    }

    const dados: DadosDaGeracao = {
        turnoData,
        turmasDoTurno,
        allProfessores: allProfessores || [],
        allTurnos: allTurnos || [],
        ocupacoes,
        aulasFixas,
        impressao,
        memoria,
        padroes,
    };
    cacheGeracao().set(chave, { expiraEm: Date.now() + CACHE_TTL_MS, dados });
    return dados;
}

/**
 * INEP da escola, para prefixar as linhas do log.txt.
 *
 * `escolas.id` é a chave interna (bigint) e não diz nada a quem lê o log; o INEP
 * é o código que a SEDUC usa para se referir à unidade. O mapa vive no processo
 * porque isso nunca muda e a geração pergunta uma vez por rodada.
 */
declare global {
    // eslint-disable-next-line no-var
    var __shetoInepPorEscola: Map<string, string> | undefined;
}

export async function inepDaEscola(escolaId: string): Promise<string> {
    if (!global.__shetoInepPorEscola) global.__shetoInepPorEscola = new Map();
    const cache = global.__shetoInepPorEscola;

    const guardado = cache.get(String(escolaId));
    if (guardado) return guardado;

    try {
        const supabase = await createClient();
        const { data } = await supabase.from('escolas').select('inep').eq('id', escolaId).maybeSingle();
        // Sem INEP cadastrado, o id ainda identifica a unidade — melhor que nada.
        const inep = data?.inep ? String(data.inep) : `escola-${escolaId}`;
        cache.set(String(escolaId), inep);
        return inep;
    } catch {
        return `escola-${escolaId}`;
    }
}

/**
 * Mensagem legível de uma exceção.
 *
 * O Next converte a exceção de uma Server Action num erro opaco e o único rastro
 * que sobra na tela é "erro no servidor". Devolver a mensagem real como dado
 * (`{ error }`) é o que torna a falha diagnosticável — sem ela, cada incidente
 * vira tentativa e erro.
 */
export function mensagemDeErro(err: unknown): string {
    if (err instanceof Error) return err.message;
    return String(err);
}
