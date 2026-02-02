'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { Turno, Horario } from '@/lib/types';

// Get only active turns for the generator
export async function getTurnosAtivos(escolaId: string): Promise<{ data?: Turno[], error?: string }> {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('turnos')
        .select('*')
        .eq('escola_id', escolaId)
        .eq('ativo', true)
        .order('nome', { ascending: true });

    if (error) {
        console.error('Error fetching active turnos:', error);
        return { error: 'Não foi possível buscar os turnos ativos.' };
    }
    return { data: data as Turno[] };
}

// Get saved schedules for a given turn
export async function getHorariosSalvos(turnoId: string): Promise<{ data?: Horario[], error?: string }> {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('horarios')
        .select('*')
        .eq('turno_id', turnoId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching saved horarios:', error);
        return { error: 'Não foi possível buscar os horários salvos.' };
    }
    return { data: data as Horario[] };
}

// Action to start the generation process
export async function iniciarGeracaoHorario(escolaId: string, turnoId: string) {
    const supabase = await createClient();

    // Check for required data: turmas
    const { data: turmas } = await supabase.from('turmas').select('id, series(turno_id)').eq('escola_id', escolaId);
    const turmasDoTurno = turmas?.filter(t => t.series?.turno_id === turnoId) || [];

    if (turmasDoTurno.length === 0) {
        return { error: 'Não há turmas cadastradas para este turno. Verifique a página de Turmas.' };
    }
    
    const countResult = await supabase
        .from('horarios')
        .select('id', { count: 'exact', head: true })
        .eq('turno_id', turnoId);

    const newVersion = (countResult.count || 0) + 1;
    const nomeHorario = `Horário V${newVersion}`;

    // For now, we will just create the record. The AI generation will be added later.
    const { data: novoHorario, error } = await supabase
        .from('horarios')
        .insert({
            escola_id: escolaId,
            turno_id: turnoId,
            nome: nomeHorario,
            status: 'em_rascunho',
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating new horario:', error);
        return { error: 'Não foi possível iniciar a geração do horário.' };
    }

    revalidatePath('/avaliacoes-admin'); // The page route
    return { data: novoHorario };
}
