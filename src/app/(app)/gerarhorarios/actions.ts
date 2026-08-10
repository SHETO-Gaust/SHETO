
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { Turno, Horario, HorarioCompleto, ConfiguracaoGerminacao } from '@/lib/types';
// A geração roda numa worker thread: chamada direta, ela congela o event loop
// do processo inteiro e derruba o sistema para todos os outros usuários.
import { gerarHorarioEmWorker } from '@/lib/timetabling-pool';
import { registrarLog, registrarLogs } from '@/lib/log-geracao';
import { getTurmas } from '../turmas/actions';
import { getProfessores } from '../professores/actions';
import { getTurnos } from '../turno/actions';
import { requireEscolaDoRecurso, requireEscolaDosRecursos, requireEscolaEModulo } from '@/lib/auth/guards';

export async function getTurnosAtivos(escolaId: string): Promise<{ data?: Turno[], error?: string }> {
    await requireEscolaEModulo(escolaId, 'horarios');
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('turnos')
        .select('*')
        .eq('escola_id', escolaId)
        .eq('ativo', true)
        .order('nome', { ascending: true });

    if (error) return { error: 'Não foi possível buscar os turnos ativos.' };
    return { data: data as Turno[] };
}

export type DisciplinaParaConfig = { id: string; nome: string; sigla: string; maxAulas: number };

export async function getDisciplinasParaConfigGerminacao(turnoIds: string[]): Promise<{ data?: DisciplinaParaConfig[], error?: string }> {
    await requireEscolaDosRecursos('turnos', turnoIds, 'horarios');
    const supabase = await createClient();
    const { data: series, error } = await supabase
        .from('series')
        .select(`
            id,
            series_componentes(
                aulas_presenciais,
                aulas_nao_presenciais,
                componente:componentes_curriculares(id, nome, sigla)
            )
        `)
        .in('turno_id', turnoIds);

    if (error) return { error: 'Não foi possível buscar as disciplinas.' };

    const discMap = new Map<string, DisciplinaParaConfig>();
    (series || []).forEach((s: any) => {
        const componentes = Array.isArray(s.series_componentes) ? s.series_componentes : [s.series_componentes];
        componentes.forEach((sc: any) => {
            if (!sc) return;
            const total = (sc.aulas_presenciais || 0) + (sc.aulas_nao_presenciais || 0);
            if (total >= 2) {
                const existing = discMap.get(sc.componente.id);
                discMap.set(sc.componente.id, {
                    id: sc.componente.id,
                    nome: sc.componente.nome,
                    sigla: sc.componente.sigla,
                    maxAulas: Math.max(total, existing?.maxAulas || 0)
                });
            }
        });
    });

    const list = Array.from(discMap.values()).sort((a, b) => a.nome.localeCompare(b.nome));
    return { data: list };
}

export async function getHorariosSalvos(turnoId: string): Promise<{ data?: Horario[], error?: string }> {
    await requireEscolaDoRecurso('turnos', turnoId, 'horarios');
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('horarios')
        .select('*')
        .eq('turno_id', turnoId)
        .order('created_at', { ascending: false });

    if (error) return { error: 'Não foi possível buscar os horários salvos.' };
    return { data: data as Horario[] };
}

export async function getHorariosSalvosTodasTurnos(escolaId: string): Promise<{ data?: (Horario & { turno_nome: string })[], error?: string }> {
    await requireEscolaEModulo(escolaId, 'horarios');
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('horarios')
        .select('*, turno:turnos(nome)')
        .eq('escola_id', escolaId)
        .order('created_at', { ascending: false });

    if (error) return { error: 'Não foi possível buscar os horários.' };
    return {
        data: (data as any[]).map(h => ({
            ...h,
            turno_nome: h.turno?.nome || '',
        })),
    };
}

/**
 * Mensagem legível de uma exceção.
 *
 * O cliente do gerador roda ~200 lotes em sequência; quando um deles estoura,
 * o Next converte a exceção da Server Action num erro opaco e o único rastro
 * que sobra na tela é "erro no servidor". Devolver a mensagem real como dado
 * (`{ error }`) é o que torna a falha diagnosticável — sem ela, cada incidente
 * vira tentativa e erro.
 */
function mensagemDeErro(err: unknown): string {
    if (err instanceof Error) return err.message;
    return String(err);
}

type DadosDaGeracao = {
    turnoData: Turno;
    turmasDoTurno: any[];
    allProfessores: any[];
    allTurnos: Turno[];
    ocupacoes: any[];
    aulasFixas: any[];
};

/**
 * INEP da escola, para prefixar as linhas do log.txt.
 *
 * `escolas.id` é a chave interna (bigint) e não diz nada a quem lê o log; o INEP
 * é o código que a SEDUC usa para se referir à unidade. O mapa vive no processo
 * porque isso nunca muda e a geração pergunta uma vez por lote.
 */
declare global {
    // eslint-disable-next-line no-var
    var __shetoInepPorEscola: Map<string, string> | undefined;
}

/**
 * Decide se o diagnóstico do motor entra no log.txt neste lote.
 *
 * O diagnóstico é caro em linhas (uma seção por bloco pendente) e repete-se
 * igual lote após lote — a geração de 10/08 travou em exatamente 384 aulas nas
 * 14 tentativas seguidas. Gravar as ~200 linhas mil vezes só consome a rotação
 * do arquivo e esconde o que interessa. Por padrão registra-se o primeiro lote
 * da execução, que é onde a causa aparece; `SHETO_LOG_MOTOR_TODOS_LOTES=1`
 * força o registro de todos quando se está caçando algo que muda com a
 * progressão do relaxamento de restrições.
 */
function deveRegistrarDiagnostico(progress: number): boolean {
    if (process.env.SHETO_LOG_MOTOR_TODOS_LOTES === '1') return true;
    return progress === 0;
}

async function inepDaEscola(escolaId: string): Promise<string> {
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
 * Cache do conjunto de dados de uma geração.
 *
 * O cliente chama a action uma vez por LOTE (até 200 vezes seguidas por turno)
 * e cada chamada relia turmas, professores, turnos, aulas fixas e a varredura
 * inteira de `horario_aulas` — a consulta mais cara do sistema, que só cresce
 * com o histórico de grades. Como nada disso muda durante a geração, relê-la a
 * cada lote é puro desperdício e é o que faz um lote no meio da série estourar
 * o `statement_timeout` do Postgres (ou o timeout do proxy) sem motivo.
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
function invalidarCacheGeracao() {
    global.__shetoCacheGeracao?.clear();
}

/**
 * Carrega tudo que o motor precisa. Lança em qualquer falha de leitura — um
 * erro engolido aqui gerava uma grade "sem conflito nenhum" só porque a
 * consulta de ocupações voltou vazia, e o choque só aparecia depois de publicado.
 */
async function carregarDadosDaGeracao(
    escolaId: string,
    turnoId: string,
    statusOcupacao: string[]
): Promise<DadosDaGeracao> {
    const chave = `${escolaId}|${turnoId}|${statusOcupacao.join(',')}`;
    const emCache = cacheGeracao().get(chave);
    if (emCache && emCache.expiraEm > Date.now()) return emCache.dados;

    const supabase = await createClient();

    const [
        { data: allTurmas, error: turmasError },
        { data: allProfessores, error: professoresError },
        { data: allTurnos, error: turnosError },
        turnoResult
    ] = await Promise.all([
        getTurmas(escolaId),
        getProfessores(escolaId),
        getTurnos(escolaId),
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

    // Aulas fixas das séries presentes neste turno
    const serieIds = [...new Set(turmasDoTurno.map((t: any) => t.serie?.id).filter(Boolean))];
    let aulasFixas: any[] = [];
    if (serieIds.length > 0) {
        const { data: fixas, error: fixasError } = await supabase
            .from('series_aulas_fixas')
            .select('*')
            .in('serie_id', serieIds);
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

    const dados: DadosDaGeracao = {
        turnoData,
        turmasDoTurno,
        allProfessores: allProfessores || [],
        allTurnos: allTurnos || [],
        ocupacoes,
        aulasFixas,
    };
    cacheGeracao().set(chave, { expiraEm: Date.now() + CACHE_TTL_MS, dados });
    return dados;
}

/**
 * Executa um lote de tentativas de geração de horário.
 */
export async function gerarLoteHorario(
    escolaId: string,
    turnoId: string,
    configGerminacao: ConfiguracaoGerminacao[],
    loteSize: number = 500,
    progress: number = 0,
    permitirMesmoProfDisciplinasMesmoDia: boolean = false
) {
    await requireEscolaEModulo(escolaId, 'horarios');
    const inep = await inepDaEscola(escolaId);

    try {
        const dados = await carregarDadosDaGeracao(escolaId, turnoId, ['publicado', 'pre_producao']);

        registrarLog(
            inep,
            `LOTE INICIADO | turno="${dados.turnoData.nome}" (${turnoId}) | tentativas=${loteSize} | ` +
                `progresso=${(progress * 100).toFixed(1)}% | turmas=${dados.turmasDoTurno.length} | ` +
                `professores=${dados.allProfessores.length} | ocupacoes_externas=${dados.ocupacoes.length} | ` +
                `aulas_fixas=${dados.aulasFixas.length} | geminacao=${configGerminacao.filter(c => c.geminar).length} disciplina(s) | ` +
                `mesmo_prof_disciplinas_mesmo_dia=${permitirMesmoProfDisciplinasMesmoDia ? 'permitido' : 'bloqueado'}`
        );

        const inicio = Date.now();
        const result = await gerarHorarioEmWorker(
            [
                dados.turnoData as any,
                dados.turmasDoTurno,
                dados.allProfessores,
                dados.allTurnos,
                configGerminacao,
                false,
                dados.ocupacoes,
                loteSize,
                progress,
                dados.aulasFixas,
                permitirMesmoProfDisciplinasMesmoDia,
            ],
            // Tudo que o motor imprimiu no lote, inclusive o diagnóstico de falha.
            deveRegistrarDiagnostico(progress) ? (linhas) => registrarLogs(inep, linhas) : undefined
        );

        const duracao = Date.now() - inicio;
        registrarLog(
            inep,
            result.success
                ? `LOTE OK | turno="${dados.turnoData.nome}" | grade fechada com ${result.aulas.length} aulas ` +
                  `em ${result.attemptsMade} tentativa(s) | ${duracao}ms`
                : `LOTE SEM SOLUCAO | turno="${dados.turnoData.nome}" | ${result.attemptsMade} tentativa(s) | ` +
                  `${result.aulas.length} aulas alocadas | ${duracao}ms | ${result.error ?? 'sem detalhe'}`
        );

        if (process.env.NODE_ENV !== 'production' || process.env.TIMETABLE_DEBUG === '1') {
            console.log(`[GERADOR] lote de ${loteSize} tentativas em ${duracao}ms (turno ${turnoId})`);
        }

        return result;
    } catch (err) {
        // Sem este log a causa se perde: o Next redige a exceção antes de ela
        // chegar ao navegador e a tela mostra apenas um aviso genérico.
        console.error(`[GERADOR] falha no lote (escola=${escolaId} turno=${turnoId} progress=${progress}):`, err);
        registrarLog(
            inep,
            `LOTE FALHOU | turno=${turnoId} | progresso=${(progress * 100).toFixed(1)}% | ` +
                `${mensagemDeErro(err)}\n${err instanceof Error && err.stack ? err.stack : ''}`
        );
        return { error: mensagemDeErro(err) };
    }
}

export async function salvarGradeFinal(
    escolaId: string,
    turnoId: string,
    nome: string,
    aulas: any[],
    status: 'em_rascunho' | 'pre_producao' = 'em_rascunho'
) {
    await requireEscolaEModulo(escolaId, 'horarios');
    const supabase = await createClient();
    const inep = await inepDaEscola(escolaId);

    const { data: novoHorario, error: hError } = await supabase
        .from('horarios')
        .insert({
            escola_id: escolaId,
            turno_id: turnoId,
            nome: nome,
            status,
        })
        .select().single();

    if (hError) {
        registrarLog(inep, `SALVAR FALHOU | "${nome}" | turno=${turnoId} | ${hError.message}`);
        return { error: 'Falha ao criar registro do horário.' };
    }

    if (aulas.length > 0) {
        const uniqueMap = new Map();
        const aulasToInsert = [];

        for (const a of aulas) {
            // Chave de unicidade sincronizada com o NOVO índice do banco
            const key = `${novoHorario.id}|${a.turma_id}|${a.dia_semana}|${a.aula_index}|${a.turno_id}`;
            if (!uniqueMap.has(key)) {
                uniqueMap.set(key, true);
                aulasToInsert.push({ 
                    horario_id: novoHorario.id, 
                    turma_id: a.turma_id,
                    componente_id: a.componente_id,
                    professor_id: (a.professor_id && a.professor_id !== 'none') ? a.professor_id : null,
                    dia_semana: a.dia_semana,
                    aula_index: a.aula_index,
                    tipo: a.tipo,
                    turno_id: a.turno_id,
                    // Campos de rastreamento de aulas fixas/compartilhadas
                    aula_fixa_id: a.aula_fixa_id || null,
                    compartilhada: a.compartilhada || false,
                    aula_compartilhada_id: a.aula_compartilhada_id || null,
                });
            }
        }

        const { error: insertError } = await supabase.from('horario_aulas').insert(aulasToInsert);
        
        if (insertError) {
            console.error('Erro ao salvar aulas:', insertError);
            registrarLog(
                inep,
                `SALVAR FALHOU | "${nome}" | ${aulasToInsert.length} aulas | ` +
                    `codigo=${insertError.code ?? '-'} | ${insertError.message}`
            );
            await supabase.from('horarios').delete().eq('id', novoHorario.id);

            if (insertError.code === '23505') {
                return { error: 'Conflito de horários detectado. Por favor, execute o script SQL de atualização de índices no Supabase.' };
            }
            return { error: 'Erro ao salvar os detalhes da grade: ' + insertError.message };
        }

        registrarLog(
            inep,
            `GRADE SALVA | "${nome}" | status=${status} | horario_id=${novoHorario.id} | ` +
                `${aulasToInsert.length} aulas gravadas` +
                (aulas.length !== aulasToInsert.length ? ` (${aulas.length - aulasToInsert.length} duplicadas descartadas)` : '')
        );
    }

    // A grade recém-salva vira ocupação para as próximas gerações (é assim que a
    // geração "Todos os Turnos" evita choque entre turnos): o cache tem que cair.
    invalidarCacheGeracao();
    revalidatePath('/gerarhorarios');
    return { data: novoHorario };
}

/**
 * SUPER HORÁRIO (Beta): executa um lote de tentativas considerando TODOS os horários
 * já existentes (rascunhos + publicados + pré-produção) de qualquer turno como
 * ocupações bloqueadas. Garante zero conflito com grades já salvas.
 * Não interfere em nada na geração normal — é uma função totalmente separada.
 */
export async function gerarSuperHorarioLote(
    escolaId: string,
    turnoId: string,
    configGerminacao: ConfiguracaoGerminacao[],
    loteSize: number = 500,
    progress: number = 0,
    permitirMesmoProfDisciplinasMesmoDia: boolean = false
) {
    await requireEscolaEModulo(escolaId, 'horarios');
    const inep = await inepDaEscola(escolaId);

    try {
        // A única diferença para a geração normal: rascunhos também contam como
        // ocupação, garantindo zero conflito com qualquer grade já salva.
        const dados = await carregarDadosDaGeracao(escolaId, turnoId, ['publicado', 'em_rascunho', 'pre_producao']);

        registrarLog(
            inep,
            `SUPER HORARIO — LOTE INICIADO | turno="${dados.turnoData.nome}" (${turnoId}) | tentativas=${loteSize} | ` +
                `progresso=${(progress * 100).toFixed(1)}% | turmas=${dados.turmasDoTurno.length} | ` +
                `ocupacoes_externas=${dados.ocupacoes.length} (inclui rascunhos)`
        );

        if (process.env.NODE_ENV !== 'production' || process.env.TIMETABLE_DEBUG === '1') {
            console.log(`[SUPER HORÁRIO] turnoId=${turnoId} ocupações consideradas: ${dados.ocupacoes.length}`);
        }

        const inicio = Date.now();
        const result = await gerarHorarioEmWorker(
            [
                dados.turnoData as any,
                dados.turmasDoTurno,
                dados.allProfessores,
                dados.allTurnos,
                configGerminacao,
                false,
                dados.ocupacoes,
                loteSize,
                progress,
                dados.aulasFixas,
                permitirMesmoProfDisciplinasMesmoDia,
            ],
            deveRegistrarDiagnostico(progress) ? (linhas) => registrarLogs(inep, linhas) : undefined
        );

        registrarLog(
            inep,
            `SUPER HORARIO — LOTE ${result.success ? 'OK' : 'SEM SOLUCAO'} | turno="${dados.turnoData.nome}" | ` +
                `${result.attemptsMade} tentativa(s) | ${result.aulas.length} aulas | ${Date.now() - inicio}ms`
        );

        return result;
    } catch (err) {
        console.error(`[SUPER HORÁRIO] falha no lote (escola=${escolaId} turno=${turnoId} progress=${progress}):`, err);
        registrarLog(
            inep,
            `SUPER HORARIO — LOTE FALHOU | turno=${turnoId} | ${mensagemDeErro(err)}\n` +
                `${err instanceof Error && err.stack ? err.stack : ''}`
        );
        return { error: mensagemDeErro(err) };
    }
}

export async function consolidarHorario(id: string) {
    await requireEscolaDoRecurso('horarios', id, 'horarios');
    const supabase = await createClient();
    const { data: current } = await supabase.from('horarios').select('turno_id').eq('id', id).single();
    if (!current) return { error: 'Horário não encontrado.' };

    // Reverte qualquer versão publicada ou pré-produção do mesmo turno para rascunho.
    // Se isto falhar em silêncio, o turno fica com DOIS horários publicados e a
    // detecção de conflito passa a enxergar ocupações duplicadas.
    const { error: revertError } = await supabase.from('horarios').update({ status: 'em_rascunho' })
        .eq('turno_id', current.turno_id)
        .in('status', ['publicado', 'pre_producao']);
    if (revertError) {
        console.error('Erro ao reverter horários anteriores do turno:', revertError);
        return { error: 'Erro ao consolidar: não foi possível reverter a grade publicada anterior deste turno.' };
    }
    const { error: uError } = await supabase.from('horarios').update({ status: 'publicado' }).eq('id', id);
    if (uError) return { error: 'Erro ao consolidar.' };

    invalidarCacheGeracao();
    revalidatePath('/gerarhorarios');
    return { success: true };
}

export async function converterPreProducaoParaRascunho(horarioIds: string[]) {
    await requireEscolaDosRecursos('horarios', horarioIds, 'horarios');
    if (horarioIds.length === 0) return { success: true };
    const supabase = await createClient();
    const { error } = await supabase
        .from('horarios')
        .update({ status: 'em_rascunho' })
        .in('id', horarioIds)
        .eq('status', 'pre_producao');
    if (error) return { error: 'Não foi possível finalizar os rascunhos.' };
    invalidarCacheGeracao();
    revalidatePath('/gerarhorarios');
    return { success: true };
}

export async function reverterParaRascunho(id: string) {
    await requireEscolaDoRecurso('horarios', id, 'horarios');
    const supabase = await createClient();
    const { error } = await supabase.from('horarios').update({ status: 'em_rascunho' }).eq('id', id);
    if (error) return { error: 'Não foi possível reverter.' };
    invalidarCacheGeracao();
    revalidatePath('/gerarhorarios');
    return { success: true };
}

export async function deleteHorario(id: string) {
    await requireEscolaDoRecurso('horarios', id, 'horarios');
    const supabase = await createClient();
    const { error } = await supabase.from('horarios').delete().eq('id', id);
    if (error) return { error: 'Não foi possível deletar.' };
    invalidarCacheGeracao();
    revalidatePath('/gerarhorarios');
    return { success: true };
}

// ── TIPOS EXPORTADOS PARA ANÁLISE DE CONFLITOS ─────────────────────────────

export type ConflictDetail = {
    professor_id: string;
    professor_nome: string;
    dia_semana: string;
    aula_index: number;
    turno_id: string;
    turno_nome: string;
    conflicting_horario_id: string;
    conflicting_horario_nome: string;
};

export type HorarioConflictResult = {
    horario_id: string;
    horario_nome: string;
    horario_status: string;
    turno_nome: string;
    conflicts: ConflictDetail[];
};

/**
 * Analisa todos os conflitos entre horários existentes para a escola/turno dado.
 * Um conflito ocorre quando o mesmo professor está alocado no mesmo slot
 * (dia_semana + aula_index + turno_id) em dois horários distintos.
 */
export async function analisarConflitosHorarios(
    escolaId: string,
    turnoFiltro: string,
    selecionadosIds?: string[]
): Promise<{ data?: HorarioConflictResult[]; error?: string }> {
    await requireEscolaEModulo(escolaId, 'horarios');
    const supabase = await createClient();

    let horarios: any[];

    if (selecionadosIds && selecionadosIds.length > 0) {
        const { data, error: hErr } = await supabase
            .from('horarios')
            .select('id, nome, status, turno_id, turno:turnos(id, nome)')
            .in('id', selecionadosIds);
        if (hErr) return { error: 'Erro ao buscar horários.' };
        horarios = data || [];
    } else {
        let query = supabase
            .from('horarios')
            .select('id, nome, status, turno_id, turno:turnos(id, nome)')
            .eq('escola_id', escolaId)
            .neq('status', 'pre_producao')
            .order('created_at', { ascending: false });

        if (turnoFiltro !== 'todos') {
            query = (query as any).eq('turno_id', turnoFiltro);
        }

        const { data, error: hErr } = await query;
        if (hErr) return { error: 'Erro ao buscar horários.' };
        horarios = data || [];
    }

    if (horarios.length === 0) return { data: [] };

    const horarioIds = horarios.map(h => h.id);

    const { data: todasAulas, error: aErr } = await supabase
        .from('horario_aulas')
        .select('horario_id, professor_id, dia_semana, aula_index, turno_id, professor:professores(nome_horario)')
        .in('horario_id', horarioIds)
        .not('professor_id', 'is', null);

    if (aErr) return { error: 'Erro ao buscar aulas.' };
    const aulas = (todasAulas || []) as any[];

    const turnoNomeMap = new Map<string, string>();
    (horarios as any[]).forEach(h => {
        if (h.turno) turnoNomeMap.set(h.turno.id, h.turno.nome);
    });

    const profNomeMap = new Map<string, string>();
    aulas.forEach(a => {
        if (a.professor_id && a.professor?.nome_horario) {
            profNomeMap.set(a.professor_id, a.professor.nome_horario);
        }
    });

    const horarioInfoMap = new Map<string, { nome: string; status: string; turno_nome: string; turno_id: string }>();
    (horarios as any[]).forEach(h => {
        horarioInfoMap.set(h.id, { nome: h.nome, status: h.status, turno_nome: h.turno?.nome || '', turno_id: h.turno_id });
    });

    // slot key → set of horario_ids que usam esse slot
    const slotToHorarios = new Map<string, Set<string>>();
    for (const aula of aulas) {
        if (!aula.professor_id) continue;
        const key = `${aula.professor_id}|${aula.dia_semana}|${aula.aula_index}|${aula.turno_id}`;
        if (!slotToHorarios.has(key)) slotToHorarios.set(key, new Set());
        slotToHorarios.get(key)!.add(aula.horario_id);
    }

    const conflictsPerHorario = new Map<string, ConflictDetail[]>();
    (horarios as any[]).forEach(h => conflictsPerHorario.set(h.id, []));

    for (const [key, hSet] of slotToHorarios.entries()) {
        if (hSet.size <= 1) continue;
        const parts = key.split('|');
        const profId = parts[0];
        const dia = parts[1];
        const aulaIdx = parseInt(parts[2]);
        const turnoId = parts[3];
        const turnoNome = turnoNomeMap.get(turnoId) || '';
        const profNome = profNomeMap.get(profId) || profId;
        const hArray = Array.from(hSet);

        for (let i = 0; i < hArray.length; i++) {
            for (let j = i + 1; j < hArray.length; j++) {
                const idA = hArray[i];
                const idB = hArray[j];
                const infoA = horarioInfoMap.get(idA);
                const infoB = horarioInfoMap.get(idB);
                if (!infoA || !infoB) continue;

                // Suprimir apenas o par "publicado vs rascunho do mesmo turno":
                // o rascunho é o substituto natural do publicado, então ter os mesmos
                // professores nos mesmos slots é esperado (o rascunho irá publicar
                // sobre o anterior). Dois rascunhos independentes do mesmo turno SÃO
                // conflito real e devem ser exibidos.
                if (infoA.turno_id === infoB.turno_id) {
                    const umPublicado = infoA.status === 'publicado' || infoB.status === 'publicado';
                    if (umPublicado) continue;
                }

                conflictsPerHorario.get(idA)?.push({
                    professor_id: profId, professor_nome: profNome,
                    dia_semana: dia, aula_index: aulaIdx,
                    turno_id: turnoId, turno_nome: turnoNome,
                    conflicting_horario_id: idB, conflicting_horario_nome: infoB.nome,
                });
                conflictsPerHorario.get(idB)?.push({
                    professor_id: profId, professor_nome: profNome,
                    dia_semana: dia, aula_index: aulaIdx,
                    turno_id: turnoId, turno_nome: turnoNome,
                    conflicting_horario_id: idA, conflicting_horario_nome: infoA.nome,
                });
            }
        }
    }

    const result: HorarioConflictResult[] = (horarios as any[]).map(h => ({
        horario_id: h.id,
        horario_nome: h.nome,
        horario_status: h.status,
        turno_nome: h.turno?.nome || '',
        conflicts: conflictsPerHorario.get(h.id) || [],
    }));

    return { data: result };
}

export async function getHorarioDetalhado(id: string): Promise<{ data?: HorarioCompleto, error?: string }> {
    await requireEscolaDoRecurso('horarios', id, 'horarios');
    const supabase = await createClient();
    const { data: horario, error: hError } = await supabase.from('horarios').select('*, turno:turnos(*)').eq('id', id).single();
    if (hError || !horario) return { error: 'Horário não encontrado.' };

    const { data: allTurnos } = await supabase.from('turnos').select('*').eq('escola_id', horario.escola_id);
    const nomeTurno = (horario.turno as any).nome.toLowerCase();
    const turnoOposto = allTurnos?.find(t => {
        if (nomeTurno.includes('matutino') || nomeTurno.includes('manhã')) return t.nome.toLowerCase().includes('vespertino') || t.nome.toLowerCase().includes('tarde');
        if (nomeTurno.includes('vespertino') || nomeTurno.includes('tarde')) return t.nome.toLowerCase().includes('matutino') || t.nome.toLowerCase().includes('manhã');
        return false;
    }) || allTurnos?.find(t => t.id !== (horario.turno as any).id);

    const { data: aulas } = await supabase
        .from('horario_aulas')
        .select('*, componente:componentes_curriculares(id, nome, sigla), professor:professores(id, nome_horario, cpf, restricoes), turma:turmas(id, nome)')
        .eq('horario_id', id)
        .order('aula_index', { ascending: true });

    const { data: turmasConfig } = await supabase
        .from('turmas')
        .select(`
            id, 
            serie:series(id, componentes:series_componentes(aulas_presenciais, aulas_nao_presenciais, componente:componentes_curriculares(id, nome, sigla))),
            professores:turmas_professores(componente_id, professor:professores(nome_horario))
        `)
        .eq('escola_id', horario.escola_id);

    return { 
        data: {
            ...horario,
            turno: horario.turno as any,
            turno_oposto: turnoOposto as any,
            aulas: (aulas || []) as any[],
            turmas_config: (turmasConfig || []) as any[]
        }
    };
}
