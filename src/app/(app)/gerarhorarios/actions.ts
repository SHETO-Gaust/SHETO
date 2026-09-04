'use server';

import { createClient } from '@/lib/db/server';
import { revalidatePath } from 'next/cache';
import type { Turno, Horario, HorarioCompleto, ConfiguracaoGerminacao } from '@/lib/types';
import { registrarLog } from '@/lib/log-geracao';
import { requireEscolaDoRecurso, requireEscolaDosRecursos, requireEscolaEModulo } from '@/lib/auth/guards';
import { inepDaEscola, invalidarCacheGeracao, mensagemDeErro } from '@/lib/geracao/dados';
import { getSlotMinutes, minutesConflitam } from '@/lib/horario-slots';
import { chaveProfessor } from '@/lib/refino/professor';
import { normalizarNomeDeGrade, temSufixoDePendencias } from '@/lib/nome-de-grade';
import { salvarGrade } from '@/lib/geracao/salvar-grade';
import { sincronizarPendencias } from './alocacao-actions';
import { ORCAMENTO_PADRAO, dispararJob } from '@/lib/geracao/orquestrador';
import {
    GeracaoEmAndamentoError,
    criarJob,
    lerGradeParcial,
    lerJob,
    lerJobRelevante,
    limparGradeParcial,
    registrarHorarioGerado,
    solicitarCancelamento,
    type GeracaoJob,
} from '@/lib/geracao/job-store';

export async function getTurnosAtivos(escolaId: string): Promise<{ data?: Turno[], error?: string }> {
    await requireEscolaEModulo(escolaId, 'horarios');
    const db = await createClient();
    const { data, error } = await db
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
    const db = await createClient();
    const { data: series, error } = await db
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
    const db = await createClient();
    const { data, error } = await db
        .from('horarios')
        .select('*')
        .eq('turno_id', turnoId)
        .order('created_at', { ascending: false });

    if (error) return { error: 'Não foi possível buscar os horários salvos.' };
    return { data: data as Horario[] };
}

export async function getHorariosSalvosTodasTurnos(escolaId: string): Promise<{ data?: (Horario & { turno_nome: string })[], error?: string }> {
    await requireEscolaEModulo(escolaId, 'horarios');
    const db = await createClient();
    const { data, error } = await db
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
    permitirMesmoProfDisciplinasMesmoDia: boolean = false,
    /** Padrão `true`: é o comportamento que o motor sempre teve. */
    permitirMaisDeDuasAulasProfNaTurma: boolean = true,
    /**
     * `turno_id` → `horario_id` a usar como ponto de partida daquele turno.
     * Vazio = gerar como sempre. Ver `ConfigJob.basePorTurno`.
     */
    basePorTurno: Record<string, string> = {}
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
                permitirMaisDeDuasAulasProfNaTurma,
                // Só os turnos que esta geração vai rodar: uma escolha deixada
                // para trás de um turno desmarcado não pode voltar a valer.
                basePorTurno: Object.fromEntries(
                    Object.entries(basePorTurno).filter(([turnoId]) => turnoIds.includes(turnoId)),
                ),
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

    /**
     * O horário salvo entra no job, e não só na resposta.
     *
     * Quem vai alocar as aulas que ficaram de fora precisa saber em qual
     * horário escrever, e essa informação vivia apenas no estado do componente:
     * bastava recarregar a página para o botão sumir, com o painel de
     * pendências ainda na tela. Gravado no job, sobrevive a recarregar, a fechar
     * a aba e a voltar no dia seguinte.
     */
    if (resultado.data?.id) {
        await registrarHorarioGerado(jobId, resultado.data.id);

        /**
         * A grade salva manda mais que o relatorio da geracao.
         *
         * O nome ganha "(Com Pendencias)" e a lista de pendencias vem do
         * diagnostico do motor — que e uma leitura de dentro da busca, e pode
         * discordar da grade que acabou de ser gravada. Aconteceu na Girassol em
         * 28/08: 405 de 405 aulas, nenhuma turma devendo nada ao cadastro, e a
         * tela anunciou "Geracao incompleta" com uma pendencia de uma aula que
         * estava la, com o sufixo carimbado no nome.
         *
         * Aqui a conta e refeita contra o cadastro e a grade recem-gravada. Se
         * nao falta nada, nao ha pendencia nem sufixo — independente do que o
         * diagnostico tenha dito.
         */
        await sincronizarPendencias(resultado.data.id);
    }

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
    const db = await createClient();
    const { data: current } = await db.from('horarios').select('turno_id').eq('id', id).single();
    if (!current) return { error: 'Horário não encontrado.' };

    // Reverte qualquer versão publicada ou pré-produção do mesmo turno para rascunho.
    // Se isto falhar em silêncio, o turno fica com DOIS horários publicados e a
    // detecção de conflito passa a enxergar ocupações duplicadas.
    const { error: revertError } = await db.from('horarios').update({ status: 'em_rascunho' })
        .eq('turno_id', current.turno_id)
        .in('status', ['publicado', 'pre_producao']);
    if (revertError) {
        console.error('Erro ao reverter horários anteriores do turno:', revertError);
        return { error: 'Erro ao consolidar: não foi possível reverter a grade publicada anterior deste turno.' };
    }
    const { error: uError } = await db.from('horarios').update({ status: 'publicado' }).eq('id', id);
    if (uError) return { error: 'Erro ao consolidar.' };

    invalidarCacheGeracao();
    revalidatePath('/gerarhorarios');
    return { success: true };
}

export async function converterPreProducaoParaRascunho(horarioIds: string[]) {
    await requireEscolaDosRecursos('horarios', horarioIds, 'horarios');
    if (horarioIds.length === 0) return { success: true };
    const db = await createClient();
    const { error } = await db
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
    const db = await createClient();
    const { error } = await db.from('horarios').update({ status: 'em_rascunho' }).eq('id', id);
    if (error) return { error: 'Não foi possível reverter.' };
    invalidarCacheGeracao();
    revalidatePath('/gerarhorarios');
    return { success: true };
}

/**
 * Cria uma cópia rascunho de uma grade, no mesmo turno.
 *
 * É a versão para experimentar sem tocar na publicada — até aqui, ter uma
 * segunda versão de um horário exigia gerar tudo de novo.
 *
 * Mesmo turno de propósito: `aula_index` não é transponível entre turnos (os
 * slots têm outras horas e o turno pode ter outra quantidade de aulas), e a
 * turma pertence a uma série, que pertence a um turno — clonar para outro turno
 * seria remapear turmas, não copiar linhas.
 */
export async function duplicarHorario(horarioId: string, novoNome: string) {
    await requireEscolaDoRecurso('horarios', horarioId, 'horarios');
    const db = await createClient();

    const { data: origem, error: oErr } = await db
        .from('horarios')
        .select('id, escola_id, turno_id, nome, status, pendencias')
        .eq('id', horarioId)
        .single();

    if (oErr || !origem) return { error: 'Horário não encontrado.' };

    const pendencias = (origem as any).pendencias ?? null;
    const nome = normalizarNomeDeGrade(novoNome, temSufixoDePendencias((origem as any).nome || ''));
    if (!nome) return { error: 'Dê um nome para a cópia.' };

    /**
     * Unicidade conferida ANTES de tentar gravar.
     *
     * `salvarGrade` devolve "Falha ao criar registro do horário" para qualquer
     * erro de insert, inclusive o 23505 de nome repetido — o usuário leria uma
     * falha genérica onde o problema é só o nome.
     */
    const { data: irmas } = await db
        .from('horarios')
        .select('nome')
        .eq('escola_id', (origem as any).escola_id)
        .eq('turno_id', (origem as any).turno_id);

    const jaExiste = ((irmas || []) as { nome: string }[])
        .some(h => (h.nome || '').trim().toLowerCase() === nome.toLowerCase());
    if (jaExiste) return { error: `Já existe um horário chamado "${nome}" neste turno.` };

    const { data: aulas, error: aErr } = await db
        .from('horario_aulas')
        .select('turma_id, componente_id, professor_id, dia_semana, aula_index, tipo, turno_id, aula_fixa_id, compartilhada, aula_compartilhada_id')
        .eq('horario_id', horarioId);

    if (aErr) return { error: 'Não foi possível ler as aulas da grade de origem.' };

    /**
     * Fixação que não existe mais vira `null` na cópia.
     *
     * A FK de `aula_fixa_id` é `ON DELETE SET NULL`, então em teoria não há
     * órfã — mas se uma fixação for apagada entre esta leitura e a gravação, o
     * insert em lote morre inteiro e `salvarGrade` apaga o horário recém-criado
     * como compensação: o botão falharia sem dizer por quê. O usuário fica
     * sabendo quantas se perderam.
     */
    const fixaIds = Array.from(new Set(((aulas || []) as any[]).map(a => a.aula_fixa_id).filter(Boolean)));
    let fixacoesVivas = new Set<string>();
    if (fixaIds.length > 0) {
        const { data: fixas } = await db.from('turmas_aulas_fixas').select('id').in('id', fixaIds);
        fixacoesVivas = new Set(((fixas || []) as { id: string }[]).map(f => f.id));
    }

    let fixacoesPerdidas = 0;
    const aulasParaCopiar = ((aulas || []) as any[]).map(a => {
        if (a.aula_fixa_id && !fixacoesVivas.has(a.aula_fixa_id)) {
            fixacoesPerdidas++;
            return { ...a, aula_fixa_id: null };
        }
        return a;
    });

    const inep = await inepDaEscola((origem as any).escola_id);
    const resultado = await salvarGrade(
        (origem as any).escola_id,
        (origem as any).turno_id,
        nome,
        aulasParaCopiar,
        'em_rascunho',
        inep,
        pendencias,
    );
    if (resultado.error || !resultado.data) return { error: resultado.error || 'Falha ao duplicar a grade.' };

    const novoId = resultado.data.id as string;

    /**
     * Confere quantas linhas realmente entraram.
     *
     * `salvarGrade` descarta em silêncio duplicatas na chave única. Numa cópia
     * o descarte deveria ser zero — se não for, a grade de origem tem duas
     * aulas no mesmo slot da mesma turma, e é melhor o usuário saber disso do
     * que receber uma cópia menor sem aviso.
     */
    const { data: copiadas } = await db.from('horario_aulas').select('id').eq('horario_id', novoId);
    const aulasCopiadas = (copiadas || []).length;

    // As pendências da origem podem já ter sido resolvidas na mão; reconciliar
    // evita a cópia nascer com aviso que não vale mais.
    await sincronizarPendencias(novoId);

    invalidarCacheGeracao();
    revalidatePath('/gerarhorarios');
    revalidatePath('/refinodehorario');
    revalidatePath('/visualizarhorario');

    return {
        data: {
            id: novoId,
            nome,
            aulasCopiadas,
            aulasDescartadas: aulasParaCopiar.length - aulasCopiadas,
            fixacoesPerdidas,
        },
    };
}

export async function deleteHorario(id: string) {
    await requireEscolaDoRecurso('horarios', id, 'horarios');
    const db = await createClient();
    const { error } = await db.from('horarios').delete().eq('id', id);
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
 *
 * Conflito é o mesmo professor em duas grades AO MESMO TEMPO — comparado por
 * minutos de relógio, não por índice de aula. A conta por índice
 * (`dia + aula_index + turno_id`) só enxergava choque dentro do mesmo turno: o
 * Integral e o Matutino começam os dois às 7h, têm `turno_id` diferente, e por
 * isso o relatório respondia "nenhum conflito" justamente no caso em que o
 * professor está mesmo em duas salas. Mesma regra do motor de geração.
 */
export async function analisarConflitosHorarios(
    escolaId: string,
    turnoFiltro: string,
    selecionadosIds?: string[]
): Promise<{ data?: HorarioConflictResult[]; error?: string }> {
    await requireEscolaEModulo(escolaId, 'horarios');
    const db = await createClient();

    let horarios: any[];

    if (selecionadosIds && selecionadosIds.length > 0) {
        const { data, error: hErr } = await db
            .from('horarios')
            .select('id, nome, status, turno_id, turno:turnos(id, nome)')
            .in('id', selecionadosIds);
        if (hErr) return { error: 'Erro ao buscar horários.' };
        horarios = data || [];
    } else {
        let query = db
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

    const { data: todasAulas, error: aErr } = await db
        .from('horario_aulas')
        .select('horario_id, professor_id, dia_semana, aula_index, turno_id, professor:professores(nome_horario, cpf)')
        .in('horario_id', horarioIds)
        .not('professor_id', 'is', null);

    if (aErr) return { error: 'Erro ao buscar aulas.' };
    const aulas = (todasAulas || []) as any[];

    // Os turnos inteiros, não só o nome: comparar por relógio exige os horários
    // de cada slot, que moram em `turnos.horarios`.
    const { data: turnosDaEscola } = await db.from('turnos').select('*').eq('escola_id', escolaId);
    const turnosById = new Map<string, Turno>(((turnosDaEscola || []) as Turno[]).map(t => [t.id, t]));

    const turnoNomeMap = new Map<string, string>();
    (horarios as any[]).forEach(h => {
        if (h.turno) turnoNomeMap.set(h.turno.id, h.turno.nome);
    });
    turnosById.forEach(t => { if (!turnoNomeMap.has(t.id)) turnoNomeMap.set(t.id, t.nome); });

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

    /**
     * Agrupa por PESSOA e dia — a identidade é o CPF, como no motor: dois
     * cadastros com o mesmo CPF são o mesmo professor, e ele não se desdobra.
     * Dentro do grupo, todo par de aulas de grades diferentes é comparado no
     * relógio.
     */
    const porProfessorDia = new Map<string, any[]>();
    for (const aula of aulas) {
        if (!aula.professor_id) continue;
        const chave = chaveProfessor(aula.professor_id, aula.professor?.cpf);
        if (!chave) continue;
        const key = `${chave}|${aula.dia_semana}`;
        const lista = porProfessorDia.get(key);
        if (lista) lista.push(aula);
        else porProfessorDia.set(key, [aula]);
    }

    const conflictsPerHorario = new Map<string, ConflictDetail[]>();
    (horarios as any[]).forEach(h => conflictsPerHorario.set(h.id, []));

    /** Um mesmo par (professor, slot, outra grade) só é listado uma vez. */
    const jaListado = new Set<string>();
    const registrar = (aula: any, outroId: string, outroNome: string) => {
        const marca = `${aula.horario_id}|${aula.professor_id}|${aula.dia_semana}|${aula.aula_index}|${aula.turno_id}|${outroId}`;
        if (jaListado.has(marca)) return;
        jaListado.add(marca);
        conflictsPerHorario.get(aula.horario_id)?.push({
            professor_id: aula.professor_id,
            professor_nome: profNomeMap.get(aula.professor_id) || aula.professor_id,
            dia_semana: aula.dia_semana,
            aula_index: aula.aula_index,
            turno_id: aula.turno_id,
            turno_nome: turnoNomeMap.get(aula.turno_id) || '',
            conflicting_horario_id: outroId,
            conflicting_horario_nome: outroNome,
        });
    };

    for (const grupo of porProfessorDia.values()) {
        for (let i = 0; i < grupo.length; i++) {
            for (let j = i + 1; j < grupo.length; j++) {
                const A = grupo[i];
                const B = grupo[j];
                // Choque dentro da MESMA grade é assunto do refino, não deste relatório.
                if (A.horario_id === B.horario_id) continue;

                const infoA = horarioInfoMap.get(A.horario_id);
                const infoB = horarioInfoMap.get(B.horario_id);
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

                const [iA, fA] = getSlotMinutes(turnosById.get(A.turno_id), A.aula_index);
                const [iB, fB] = getSlotMinutes(turnosById.get(B.turno_id), B.aula_index);
                if (!minutesConflitam(iA, fA, iB, fB, A.turno_id === B.turno_id, A.aula_index, B.aula_index)) continue;

                registrar(A, B.horario_id, infoB.nome);
                registrar(B, A.horario_id, infoA.nome);
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
    const db = await createClient();
    const { data: horario, error: hError } = await db.from('horarios').select('*, turno:turnos(*)').eq('id', id).single();
    if (hError || !horario) return { error: 'Horário não encontrado.' };

    const { data: allTurnos } = await db.from('turnos').select('*').eq('escola_id', horario.escola_id);
    const nomeTurno = (horario.turno as any).nome.toLowerCase();
    const turnoOposto = allTurnos?.find(t => {
        if (nomeTurno.includes('matutino') || nomeTurno.includes('manhã')) return t.nome.toLowerCase().includes('vespertino') || t.nome.toLowerCase().includes('tarde');
        if (nomeTurno.includes('vespertino') || nomeTurno.includes('tarde')) return t.nome.toLowerCase().includes('matutino') || t.nome.toLowerCase().includes('manhã');
        return false;
    }) || allTurnos?.find(t => t.id !== (horario.turno as any).id);

    const { data: aulas } = await db
        .from('horario_aulas')
        .select('*, componente:componentes_curriculares(id, nome, sigla), professor:professores(id, nome_horario, nome_completo, cpf, restricoes, livre_docencia, sem_preferencia_livre_docencia, turnos_ids), turma:turmas(id, nome)')
        .eq('horario_id', id)
        .order('aula_index', { ascending: true });

    const { data: turmasConfig } = await db
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
