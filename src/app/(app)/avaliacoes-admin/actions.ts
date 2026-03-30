'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { Turno, Horario, HorarioCompleto } from '@/lib/types';
import { gerarHorarioIA } from '@/ai/flows/gerar-horario-flow';

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
    const { data: turmas } = await supabase.from('turmas').select('id, series!inner(turno_id)').eq('escola_id', escolaId);
    const turmasDoTurno = turmas?.filter(t => (t.series as any)?.turno_id === turnoId) || [];

    if (turmasDoTurno.length === 0) {
        return { error: 'Não há turmas cadastradas para este turno. Verifique a página de Turmas.' };
    }
    
    const countResult = await supabase
        .from('horarios')
        .select('id', { count: 'exact', head: true })
        .eq('turno_id', turnoId);

    const newVersion = (countResult.count || 0) + 1;
    const nomeHorario = `Horário V${newVersion}`;

    // 1. Create the record
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
        return { error: 'Não foi possível iniciar a geração do rascunho.' };
    }

    // 2. Call AI Flow
    try {
        const resultIA = await gerarHorarioIA(escolaId, turnoId);
        
        if (resultIA && resultIA.aulas.length > 0) {
            const aulasToInsert = resultIA.aulas.map(aula => ({
                ...aula,
                horario_id: novoHorario.id,
            }));

            const { error: insertError } = await supabase
                .from('horario_aulas')
                .insert(aulasToInsert);

            if (insertError) {
                console.error("Error inserting generated classes:", insertError);
                return { error: 'O rascunho foi criado, mas houve um erro ao salvar as aulas geradas pela IA.' };
            }
        }
    } catch (err) {
        console.error("AI Generation Error:", err);
        return { error: 'O rascunho foi criado, mas a IA falhou ao organizar as aulas. Você pode tentar novamente ou editar manualmente.' };
    }

    revalidatePath('/avaliacoes-admin');
    return { data: novoHorario };
}

export async function deleteHorario(id: string) {
    const supabase = await createClient();
    const { error } = await supabase.from('horarios').delete().eq('id', id);
    
    if (error) {
        console.error('Error deleting horario:', error);
        return { error: 'Não foi possível deletar o horário.' };
    }

    revalidatePath('/avaliacoes-admin');
    return { success: true };
}

export async function getHorarioDetalhado(id: string): Promise<{ data?: HorarioCompleto, error?: string }> {
    const supabase = await createClient();
    
    const { data: horario, error: hError } = await supabase
        .from('horarios')
        .select('*, turno:turnos(*)')
        .eq('id', id)
        .single();

    if (hError || !horario) return { error: 'Horário não encontrado.' };

    const { data: aulas, error: aError } = await supabase
        .from('horario_aulas')
        .select('*, componente:componentes_curriculares(id, nome, sigla), professor:professores(id, nome_horario), turma:turmas(id, nome)')
        .eq('horario_id', id);

    if (aError) return { error: 'Erro ao buscar as aulas do horário.' };

    return { 
        data: {
            ...horario,
            turno: horario.turno as any,
            aulas: (aulas || []) as any[],
        }
    };
}
