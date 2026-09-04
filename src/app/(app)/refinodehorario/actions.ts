'use server';

import { createClient } from '@/lib/db/server';
import { revalidatePath } from 'next/cache';
import type { Turno } from '@/lib/types';
import type { AulaRefino, Move, ProfessorRefino } from '@/lib/refino-horario';
import { turnosSemHorarioCompleto } from '@/lib/horario-slots';
import {
    resolverGradesDeReferencia,
    SELECT_AULA_REFINO,
    type GradeCandidata,
    type ReferenciaResolvida,
    type StatusGrade,
} from '@/lib/refino/grades-de-referencia';
import { requireEscolaDosRecursos, requireEscolaEModulo } from '@/lib/auth/guards';

/**
 * Todas as grades da escola, de qualquer status.
 *
 * Rascunho entra: é ali que mora o turno que ainda está sendo montado, e ignorá-lo
 * era o que deixava o Integral invisível para o Matutino. Qual delas conta como
 * ocupação é decisão de `resolverGradesDeReferencia` — uma por turno.
 */
export async function getHorariosParaRefino(escolaId: string) {
    await requireEscolaEModulo(escolaId, 'horarios');
    const db = await createClient();
    const { data: horarios, error } = await db
        .from('horarios')
        .select('id, nome, status, turno_id, created_at, turno:turnos(nome)')
        .eq('escola_id', escolaId)
        .order('created_at', { ascending: false });

    const data: GradeCandidata[] = (horarios || []).map((h: any) => ({
        id: h.id,
        nome: h.nome,
        status: h.status as StatusGrade,
        turno_id: h.turno_id,
        turno_nome: h.turno?.nome || '',
        created_at: h.created_at,
    }));

    return { data, error: error?.message };
}

export type SelecaoRefino = {
    horarioId: string;
    /** turnoId → horarioId. Turno ausente cai na política padrão; `nenhuma` = ignorar o turno. */
    referencias?: Record<string, string> | null;
};

export type DadosRefino = {
    horarioId: string;
    turnoEmEdicaoId: string;
    /** Aulas da grade em edição — as únicas móveis. */
    aulasMoveis: AulaRefino[];
    /** Aulas das grades de referência — bloqueiam, nunca se movem. */
    aulasReferencia: AulaRefino[];
    referencias: ReferenciaResolvida[];
    candidatos: GradeCandidata[];
    professores: ProfessorRefino[];
    turmas: { id: string; nome: string }[];
    turnos: Turno[];
    avisos: string[];
};

function mapearAula(a: any, gradeNome: string, movel: boolean): AulaRefino {
    return {
        id: a.id,
        horario_id: a.horario_id,
        horario_nome: gradeNome,
        turma_id: a.turma_id,
        turma_nome: a.turma?.nome || '',
        componente_id: a.componente_id,
        componente_nome: a.componente?.nome || '',
        componente_sigla: a.componente?.sigla || '',
        professor_id: a.professor_id,
        professor_nome: a.professor?.nome_horario || 'Sem Professor',
        professor_cpf: a.professor?.cpf,
        dia_semana: a.dia_semana,
        aula_index: a.aula_index,
        tipo: a.tipo,
        turno_id: a.turno_id,
        aula_fixa_id: a.aula_fixa_id || null,
        compartilhada: a.compartilhada || false,
        aula_compartilhada_id: a.aula_compartilhada_id || null,
        movel,
    };
}

export async function getDadosRefinoHorario(escolaId: string, selecao: SelecaoRefino) {
    await requireEscolaEModulo(escolaId, 'horarios');
    const db = await createClient();

    const { data: candidatos, error: erroGrades } = await getHorariosParaRefino(escolaId);
    if (erroGrades) return { error: 'Falha ao listar as grades da escola. ' + erroGrades };

    const emEdicao = (candidatos || []).find(g => g.id === selecao.horarioId);
    if (!emEdicao) return { error: 'A grade selecionada não pertence a esta escola ou não existe mais.' };

    const { referencias, avisos } = resolverGradesDeReferencia(
        candidatos || [], emEdicao.id, emEdicao.turno_id, selecao.referencias,
    );

    const { data: turnosList } = await db.from('turnos').select('*').eq('escola_id', escolaId);
    const turnos = (turnosList || []) as Turno[];

    // A grade em edição e as de referência vêm em consultas separadas, por
    // `horario_id`: com rascunhos na conta, varrer a escola inteira e filtrar em
    // memória traria dezenas de milhares de linhas para descartar quase todas.
    const { data: aulasDeste, error } = await db
        .from('horario_aulas')
        .select(SELECT_AULA_REFINO)
        .eq('horario_id', emEdicao.id);

    if (error) return { error: 'Falha ao buscar as aulas desta grade. ' + error.message };

    const aulasMoveis: AulaRefino[] = (aulasDeste || []).map((a: any) => mapearAula(a, emEdicao.nome, true));

    let aulasReferencia: AulaRefino[] = [];
    if (referencias.length > 0) {
        const nomePorHorario = new Map(referencias.map(r => [r.horario_id, r.horario_nome]));
        const { data: outras } = await db
            .from('horario_aulas')
            .select(SELECT_AULA_REFINO)
            .in('horario_id', referencias.map(r => r.horario_id));

        /**
         * Turma que já está na grade em edição não entra pela porta da
         * referência. A agenda de uma turma é a da grade aberta; a versão dela
         * noutra grade é história, não ocupação — e contá-la duplicaria a turma
         * (e o professor) contra si mesma em cada slot.
         */
        const turmasEmEdicao = new Set(aulasMoveis.map(a => a.turma_id));
        aulasReferencia = (outras || [])
            .filter((a: any) => !turmasEmEdicao.has(a.turma_id))
            .map((a: any) => mapearAula(a, nomePorHorario.get(a.horario_id) || 'Outra grade', false));
    }

    const todas = [...aulasMoveis, ...aulasReferencia];

    /**
     * Restrições só dos professores que aparecem nestas grades.
     *
     * O JSONB de restrições é pesado e o `alocacao-actions` evita mandá-lo ao
     * navegador de propósito. Aqui a tela precisa dele — é o que permite
     * recusar a troca que joga o professor na folga declarada dele —, então o
     * recorte é por quem está em cena, não pela escola inteira.
     */
    const professorIds = Array.from(new Set(todas.map(a => a.professor_id).filter(Boolean) as string[]));
    let professores: ProfessorRefino[] = [];
    if (professorIds.length > 0) {
        const { data: profs } = await db
            .from('professores')
            .select('id, nome_horario, cpf, restricoes, livre_docencia, sem_preferencia_livre_docencia')
            .in('id', professorIds);

        professores = ((profs || []) as any[]).map(p => ({
            id: p.id,
            nome: p.nome_horario || '',
            cpf: p.cpf ?? null,
            restricoes: p.restricoes ?? null,
            livre_docencia: p.livre_docencia ?? [],
            sem_preferencia_livre_docencia: p.sem_preferencia_livre_docencia ?? null,
        }));
    }

    const turmasMap = new Map<string, { id: string; nome: string }>();
    for (const a of aulasMoveis) {
        if (a.turma_id) turmasMap.set(a.turma_id, { id: a.turma_id, nome: a.turma_nome });
    }
    const turmas = Array.from(turmasMap.values()).sort((a, b) => a.nome.localeCompare(b.nome));

    /**
     * Turno sem horários cadastrados não dá para comparar com outro turno, e a
     * conta conservadora passa a recusar tudo. O aviso existe para o usuário não
     * ler "bloqueado" e concluir que o sistema quebrou: o que falta é cadastro.
     */
    const turnosEmCena = new Set(todas.map(a => a.turno_id));
    const incompletos = turnosSemHorarioCompleto(turnos.filter(t => turnosEmCena.has(t.id)));
    const avisosDeCadastro = incompletos.map(t =>
        `O turno ${t.nome} está com ${t.faltam} horário(s) de aula em branco no cadastro. ` +
        'Enquanto isso, qualquer comparação dele com outro turno é recusada por precaução.'
    );

    const avisosDeReferencia = referencias.length === 0
        ? ['Nenhuma outra grade está sendo considerada: o conflito é calculado só dentro desta.']
        : [];

    return {
        data: {
            horarioId: emEdicao.id,
            turnoEmEdicaoId: emEdicao.turno_id,
            aulasMoveis,
            aulasReferencia,
            referencias,
            candidatos: candidatos || [],
            professores,
            turmas,
            turnos,
            avisos: [...avisos, ...avisosDeCadastro, ...avisosDeReferencia],
        } satisfies DadosRefino,
    };
}

/**
 * Applies a validated chain of moves using a 3-phase bulk strategy.
 *
 * WHY NOT RELY SOLELY ON RPC:
 * PostgREST error PGRST202 occurs when the function exists in Postgres but is
 * not yet reflected in PostgREST's in-memory schema cache. This happens when:
 *   - The migration was applied but NOTIFY pgrst was not sent
 *   - The grants are missing for the calling role
 *   - PostgREST has not yet cycled its background reload
 *
 * STRATEGY:
 *   1. Try the RPC first (fully atomic inside a single Postgres transaction).
 *   2. On PGRST202 only, fall back to bulk DELETE → bulk INSERT.
 *      - DELETE WHERE id IN (...) atomically frees all chain slots.
 *      - INSERT all rows at their new positions in a single request.
 *      - No unique constraint violation occurs because all conflicting rows
 *        were already removed before any insertion.
 *   3. Any other RPC error (e.g. 23505, 23503) is returned as-is — it means
 *      the function ran but detected a real data problem.
 *
 * ATOMICITY NOTE:
 *   The bulk fallback has a tiny window between DELETE and INSERT where rows
 *   do not exist. For a school scheduling system with low concurrent writes
 *   this is acceptable. If full ACID atomicity is required in all cases, run
 *   the migration in migrations/aplicar_rota_refino.sql and ensure
 *   the NOTIFY pgrst, 'reload schema' line executes after CREATE FUNCTION.
 */
export async function aplicarMudancasRefino(
    mudancas: Move[],
    /** Quando informado, recusa a rota se alguma aula for de outra grade. */
    horarioIdEsperado?: string,
) {
    if (!mudancas || mudancas.length === 0) return { error: 'Nenhuma mudança recebida.' };

    const db = await createClient();
    const aulaIds = mudancas.map(m => m.aulaId);

    // A escola dona destas aulas esta a dois saltos (horario_aulas -> horarios),
    // entao resolvemos os horarios envolvidos e delegamos a checagem em lote.
    const { data: aulasParaValidar } = await db
        .from('horario_aulas')
        .select('horario_id')
        .in('id', aulaIds);
    const horarioIds = Array.from(
        new Set((aulasParaValidar || []).map((a: { horario_id: string }) => a.horario_id))
    );
    await requireEscolaDosRecursos('horarios', horarioIds, 'horarios');

    /**
     * Só a grade em edição pode ser alterada.
     *
     * Desde que a tela passou a carregar aulas de outras grades para detectar
     * choque, um `Move` apontando para uma delas deixou de ser impossível — e
     * gravaria alteração numa grade que o usuário nem abriu.
     */
    if (horarioIdEsperado && horarioIds.some(id => id !== horarioIdEsperado)) {
        return {
            error: 'A rota tenta alterar aulas de outra grade. Só a grade aberta pode ser editada aqui; as demais são referência de conflito.'
        };
    }

    // ── Phase 0: Guard — aulas fixas não podem ser movidas ────────────────────
    const { data: aulasParaMover } = await db
        .from('horario_aulas')
        .select('id, aula_fixa_id')
        .in('id', aulaIds);

    const fixasBloqueadas = (aulasParaMover || []).filter(a => a.aula_fixa_id);
    if (fixasBloqueadas.length > 0) {
        return {
            error: 'Aula fixa não pode ser movida pelo refinamento. Para alterar o horário desta aula, edite a fixação no modelo da série e regenere o horário.'
        };
    }
    /**
     * As 12 colunas, não 9.
     *
     * A gravação é DELETE + INSERT, então o que não vier neste SELECT é apagado
     * da linha. Faltavam `aula_fixa_id`, `compartilhada` e
     * `aula_compartilhada_id`: cada refino aplicado desfazia a marca de aula
     * coletiva, e o refino seguinte passava a enxergar choque de professor entre
     * as duas metades da mesma aula.
     */
    const { data: aulasAtuais, error: fetchError } = await db
        .from('horario_aulas')
        .select('id, horario_id, turma_id, componente_id, professor_id, dia_semana, aula_index, tipo, turno_id, aula_fixa_id, compartilhada, aula_compartilhada_id')
        .in('id', aulaIds);

    if (fetchError) {
        return {
            error: `Não foi possível ler o estado atual das aulas antes de aplicar a rota. Detalhe: ${fetchError.message}`
        };
    }
    if (!aulasAtuais || aulasAtuais.length !== aulaIds.length) {
        return {
            error: `Uma ou mais aulas da rota não foram encontradas no banco. A rota pode estar desatualizada — recarregue a página e tente novamente.`
        };
    }

    // Build the desired final state for every row
    const moveMap = new Map(mudancas.map(m => [m.aulaId, m]));
    const registrosFinais = aulasAtuais.map(aula => {
        const move = moveMap.get(aula.id);
        if (!move) return aula;
        return {
            ...aula,
            dia_semana: move.novoDia,
            aula_index: move.novoSlot,
            turno_id: move.novoTurnoId,
        };
    });

    // ── Strategy A: RPC (fully atomic — preferred) ────────────────────────────
    const { error: rpcError } = await db.rpc('aplicar_rota_refino', {
        p_ids: aulaIds,
        p_registros: registrosFinais,
    });

    if (!rpcError) {
        revalidatePath('/refinodehorario');
        revalidatePath('/visualizarhorario');
        revalidatePath('/gerarhorarios');
        return { success: true };
    }

    // PGRST202: function not found in schema cache → fall through to Strategy B.
    if (rpcError.code === 'PGRST202') {
        console.warn(
            '[refino] RPC aplicar_rota_refino não encontrada no schema cache do PostgREST (PGRST202). ' +
            'Usando fallback bulk DELETE + INSERT. ' +
            'Para resolver permanentemente: execute migrations/aplicar_rota_refino.sql ' +
            'e confirme que o NOTIFY pgrst foi enviado após a criação da função.'
        );
        // Fall through to Strategy B below
    } else {
        // Any other error means the RPC ran and encountered a real data problem.
        console.error('[refino] Erro RPC aplicar_rota_refino:', rpcError);
        if (rpcError.code === '23505') {
            return {
                error: 'A rota ficou inválida no momento da gravação: o slot de destino foi ocupado por outro registro antes da confirmação. A transação foi revertida sem alterar o horário. Recarregue a página e tente novamente.'
            };
        }
        if (rpcError.code === '23503') {
            return {
                error: 'Erro de referência de dados ao aplicar a rota. A transação foi revertida sem alterar o horário.'
            };
        }
        return {
            error: `A transação foi revertida sem alterar o horário. Detalhe técnico: ${rpcError.message}`
        };
    }

    // ── Strategy B: Bulk DELETE → Bulk INSERT (no RPC required) ──────────────

    // Phase 2: Atomically release all chain slots in one DELETE
    const { error: deleteError } = await db
        .from('horario_aulas')
        .delete()
        .in('id', aulaIds);

    if (deleteError) {
        console.error('[refino] Erro ao deletar aulas para refino:', deleteError);
        return {
            error: `Falha ao liberar os slots originais. Nenhuma alteração foi feita. Detalhe: ${deleteError.message}`
        };
    }

    // Phase 3: Re-insert all rows at their new positions (single bulk INSERT)
    const { error: insertError } = await db
        .from('horario_aulas')
        .insert(registrosFinais);

    if (insertError) {
        // Critical: rows were deleted but insertion failed.
        // The schedule is in an inconsistent state — log loudly.
        console.error('[refino] ERRO CRÍTICO: aulas deletadas mas falha ao re-inserir:', insertError);

        if (insertError.code === '23505') {
            return {
                error: 'O slot de destino foi ocupado por outro processo durante a operação. O horário pode estar inconsistente — recarregue a página imediatamente para verificar o estado atual.'
            };
        }
        return {
            error: `Falha crítica ao re-inserir as aulas no novo slot. O horário pode estar inconsistente — recarregue a página imediatamente. Detalhe: ${insertError.message}`
        };
    }

    revalidatePath('/refinodehorario');
    revalidatePath('/visualizarhorario');
    revalidatePath('/gerarhorarios');
    return { success: true };
}
