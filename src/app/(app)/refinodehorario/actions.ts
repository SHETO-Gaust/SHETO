'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { Turno } from '@/lib/types';
import type { AulaRefino, Move } from '@/lib/refino-horario';

export async function getHorariosParaRefino(escolaId: string) {
    const supabase = await createClient();
    const { data: horarios, error } = await supabase
        .from('horarios')
        .select('id, nome, status, turno:turnos(nome)')
        .eq('escola_id', escolaId)
        .eq('status', 'publicado')
        .order('created_at', { ascending: false });

    return { data: horarios, error: error?.message };
}

export async function getDadosRefinoHorario(escolaId: string, horarioSelecionadoId: string) {
    const supabase = await createClient();

    // 1. Buscar todos os turnos
    const { data: turnosList } = await supabase.from('turnos').select('*').eq('escola_id', escolaId);

    // 2. Buscar TODAS as aulas publicadas
    const { data: aulasRaw, error } = await supabase
        .from('horario_aulas')
        .select(`
            id, horario_id, turma_id, componente_id, professor_id, dia_semana, aula_index, tipo, turno_id,
            aula_fixa_id, compartilhada, aula_compartilhada_id,
            turma:turmas(nome),
            componente:componentes_curriculares(nome, sigla),
            professor:professores(nome_horario, cpf),
            horario:horarios!inner(escola_id, status)
        `)
        .eq('horario.escola_id', escolaId)
        .eq('horario.status', 'publicado');

    if (error) return { error: 'Falha ao buscar dados de aulas. ' + error.message };

    const todasAulas: AulaRefino[] = (aulasRaw || []).map((a: any) => ({
        id: a.id,
        horario_id: a.horario_id,
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
    }));

    const aulasDesteHorario = todasAulas.filter(a => a.horario_id === horarioSelecionadoId);
    if (!aulasDesteHorario.length) {
        return { data: { todasAulas: [], professores: [], turnos: [] } };
    }

    const profsMap = new Map<string, { id: string; nome: string }>();
    for (const a of aulasDesteHorario) {
        if (a.professor_id) {
            profsMap.set(a.professor_id, { id: a.professor_id, nome: a.professor_nome });
        }
    }
    const professores = Array.from(profsMap.values()).sort((a,b) => a.nome.localeCompare(b.nome));

    return {
        data: {
            todasAulas,
            professores,
            turnos: turnosList as Turno[]
        }
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
 *   the migration in supabase/migrations/aplicar_rota_refino.sql and ensure
 *   the NOTIFY pgrst, 'reload schema' line executes after CREATE FUNCTION.
 */
export async function aplicarMudancasRefino(mudancas: Move[]) {
    if (!mudancas || mudancas.length === 0) return { error: 'Nenhuma mudança recebida.' };

    const supabase = await createClient();
    const aulaIds = mudancas.map(m => m.aulaId);

    // ── Phase 0: Guard — aulas fixas não podem ser movidas ────────────────────
    const { data: aulasParaMover } = await supabase
        .from('horario_aulas')
        .select('id, aula_fixa_id')
        .in('id', aulaIds);

    const fixasBloqueadas = (aulasParaMover || []).filter(a => a.aula_fixa_id);
    if (fixasBloqueadas.length > 0) {
        return {
            error: 'Aula fixa não pode ser movida pelo refinamento. Para alterar o horário desta aula, edite a fixação no modelo da série e regenere o horário.'
        };
    }
    const { data: aulasAtuais, error: fetchError } = await supabase
        .from('horario_aulas')
        .select('id, horario_id, turma_id, componente_id, professor_id, dia_semana, aula_index, tipo, turno_id')
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
    const { error: rpcError } = await supabase.rpc('aplicar_rota_refino', {
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
            'Para resolver permanentemente: execute supabase/migrations/aplicar_rota_refino.sql ' +
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
    const { error: deleteError } = await supabase
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
    const { error: insertError } = await supabase
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
