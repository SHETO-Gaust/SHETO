'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { Turno, Horario, HorarioCompleto, ConfiguracaoGerminacao } from '@/lib/types';
import { registrarLog } from '@/lib/log-geracao';
import { requireEscolaDoRecurso, requireEscolaDosRecursos, requireEscolaEModulo } from '@/lib/auth/guards';
import { inepDaEscola, invalidarCacheGeracao, mensagemDeErro } from '@/lib/geracao/dados';
import { salvarGrade } from '@/lib/geracao/salvar-grade';
import { ORCAMENTO_PADRAO, dispararJob } from '@/lib/geracao/orquestrador';
import {
    GeracaoEmAndamentoError,
    criarJob,
    lerGradeParcial,
    lerJob,
    lerJobRelevante,
    limparGradeParcial,
    solicitarCancelamento,
    type GeracaoJob,
} from '@/lib/geracao/job-store';

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

// ─────────────────────────────────────────────────────────────────────────────
//  GERAÇÃO EM SEGUNDO PLANO
//
//  Antes daqui saía `gerarLoteHorario`: a tela chamava a action uma vez por
//  lote de 100 tentativas, centenas de vezes seguidas, e o laço vivia no
//  navegador. Fechar a aba matava a geração e cada lote era uma requisição
//  longa exposta ao corte de 60s do proxy da SEDUC.
//
//  Agora a tela só dispara o job, pergunta o andamento e pede a parada — quem
//  executa é o orquestrador, no servidor (`src/lib/geracao/orquestrador.ts`).
// ─────────────────────────────────────────────────────────────────────────────

/** O que a tela precisa saber sobre uma geração. Espelha a linha de `geracao_jobs`. */
export type EstadoGeracao = {
    id: string;
    status: GeracaoJob['status'];
    emAndamento: boolean;
    cancelamentoSolicitado: boolean;
    turnoAtualNome: string | null;
    turnosConcluidos: number;
    totalTurnos: number;
    tentativas: number;
    orcamento: number;
    horariosGerados: string[];
    erro: string | null;
    diagnostico: any | null;
    /** Há uma grade incompleta guardada que o usuário pode optar por salvar. */
    temGradeParcial: boolean;
    turnoParcialNome: string | null;
    criadoEm: string;
};

function paraEstado(job: GeracaoJob): EstadoGeracao {
    return {
        id: job.id,
        status: job.status,
        emAndamento: job.status === 'executando',
        cancelamentoSolicitado: job.cancelamento_solicitado,
        turnoAtualNome: job.turno_atual_nome,
        turnosConcluidos: job.turnos_concluidos,
        totalTurnos: job.turno_ids.length,
        tentativas: job.tentativas,
        orcamento: job.orcamento,
        horariosGerados: job.horarios_gerados ?? [],
        erro: job.erro,
        diagnostico: job.diagnostico,
        temGradeParcial: job.tem_grade_parcial === true,
        turnoParcialNome: job.turno_parcial_nome,
        criadoEm: job.created_at,
    };
}

/**
 * Inicia a geração e retorna assim que o job está registrado — o processamento
 * segue no servidor depois que esta requisição termina.
 */
export async function iniciarGeracao(
    escolaId: string,
    turnoIds: string[],
    nome: string,
    configGerminacao: ConfiguracaoGerminacao[],
    permitirMesmoProfDisciplinasMesmoDia: boolean = false
): Promise<{ data?: EstadoGeracao; error?: string }> {
    const profile = await requireEscolaEModulo(escolaId, 'horarios');

    if (turnoIds.length === 0) return { error: 'Nenhum turno selecionado para a geração.' };
    if (!nome.trim()) return { error: 'O nome do horário é obrigatório.' };

    try {
        const job = await criarJob({
            escolaId,
            criadoPor: profile?.id ?? null,
            turnoIds,
            config: {
                nome: nome.trim(),
                configGerminacao,
                permitirMesmoProfDisciplinasMesmoDia,
            },
            orcamento: ORCAMENTO_PADRAO,
        });

        // Fora de qualquer `await`: a requisição responde agora e o job continua.
        dispararJob(job);

        revalidatePath('/gerarhorarios');
        return { data: paraEstado(job) };
    } catch (err) {
        if (err instanceof GeracaoEmAndamentoError) return { error: err.message };
        const inep = await inepDaEscola(escolaId);
        console.error(`[GERADOR] falha ao iniciar a geração (escola=${escolaId}):`, err);
        registrarLog(inep, `JOB NAO INICIADO | escola=${escolaId} | ${mensagemDeErro(err)}`);
        return { error: mensagemDeErro(err) };
    }
}

/**
 * Estado da geração desta unidade: a que está rodando ou, na falta dela, o
 * último desfecho. É o que faz a tela reencontrar uma geração depois de o
 * usuário fechar a aba, e o que mantém o botão bloqueado enquanto ela corre.
 */
export async function getEstadoGeracao(escolaId: string): Promise<{ data?: EstadoGeracao | null; error?: string }> {
    await requireEscolaEModulo(escolaId, 'horarios');
    try {
        const job = await lerJobRelevante(escolaId);
        return { data: job ? paraEstado(job) : null };
    } catch (err) {
        console.error(`[GERADOR] falha ao ler o estado da geração (escola=${escolaId}):`, err);
        return { error: mensagemDeErro(err) };
    }
}

/**
 * Pede a parada. O orquestrador só reage na virada da rodada (≤ ~11s), então a
 * tela mostra "interrompendo" até o status mudar de fato.
 */
export async function cancelarGeracao(jobId: string): Promise<{ error?: string }> {
    const job = await lerJob(jobId);
    if (!job) return { error: 'Geração não encontrada.' };

    await requireEscolaEModulo(job.escola_id, 'horarios');

    if (job.status !== 'executando') return { error: 'Esta geração já foi encerrada.' };

    await solicitarCancelamento(jobId);
    registrarLog(await inepDaEscola(job.escola_id), `CANCELAMENTO PEDIDO | job=${jobId}`);
    return {};
}

/**
 * Salva a melhor grade incompleta que a geração encontrou.
 *
 * Antes essas aulas voltavam junto da resposta do lote e viviam no estado do
 * componente; com o laço no servidor, elas ficam guardadas no job até o usuário
 * decidir — é o que mantém o "Forçar Salvamento" funcionando depois de fechar
 * e reabrir a página.
 */
export async function salvarGradeParcial(jobId: string, nome: string) {
    const parcial = await lerGradeParcial(jobId);
    if (!parcial) return { error: 'Não há grade parcial guardada para esta geração.' };

    await requireEscolaEModulo(parcial.escolaId, 'horarios');
    const inep = await inepDaEscola(parcial.escolaId);

    const resultado = await salvarGrade(
        parcial.escolaId, parcial.turnoId, `${nome} (Com Pendências)`, parcial.aulas, 'em_rascunho', inep,
        parcial.pendencias
    );
    if (resultado.error) return { error: resultado.error };

    await limparGradeParcial(jobId);
    revalidatePath('/gerarhorarios');
    return { data: resultado.data };
}

/**
 * Grava uma grade montada fora do fluxo de geração.
 *
 * O miolo vive em `@/lib/geracao/salvar-grade` porque o orquestrador também
 * precisa dele, e lá não existe sessão para o guard nem rota para revalidar.
 */
export async function salvarGradeFinal(
    escolaId: string,
    turnoId: string,
    nome: string,
    aulas: any[],
    status: 'em_rascunho' | 'pre_producao' = 'em_rascunho'
) {
    await requireEscolaEModulo(escolaId, 'horarios');
    const inep = await inepDaEscola(escolaId);

    const resultado = await salvarGrade(escolaId, turnoId, nome, aulas, status, inep);
    if (resultado.error) return { error: resultado.error };

    revalidatePath('/gerarhorarios');
    return { data: resultado.data };
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
