
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { Turno, Horario, HorarioCompleto } from '@/lib/types';
import { gerarHorarioAlgoritmico } from '@/lib/timetabling';
import { getTurmas } from '../turmas/actions';
import { getProfessores } from '../professores/actions';

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

    // 1. Buscar Dados Necessários
    const [
        { data: allTurmas },
        { data: allProfessores },
        { data: turno }
    ] = await Promise.all([
        getTurmas(escolaId),
        getProfessores(escolaId),
        supabase.from('turnos').select('*').eq('id', turnoId).single()
    ]);

    const turmasDoTurno = allTurmas?.filter(t => t.serie.turno_id === turnoId) || [];

    if (turmasDoTurno.length === 0) {
        return { error: 'Não há turmas cadastradas para este turno. Verifique a página de Turmas.' };
    }

    if (!turno) return { error: 'Turno não encontrado.' };
    
    const countResult = await supabase
        .from('horarios')
        .select('id', { count: 'exact', head: true })
        .eq('turno_id', turnoId);

    const newVersion = (countResult.count || 0) + 1;
    const nomeHorario = `Horário V${newVersion}`;

    // 2. Criar o registro do horário
    const { data: novoHorario, error: hError } = await supabase
        .from('horarios')
        .insert({
            escola_id: escolaId,
            turno_id: turnoId,
            nome: nomeHorario,
            status: 'em_rascunho',
        })
        .select()
        .single();

    if (hError) return { error: 'Falha ao criar rascunho de horário.' };

    // 3. Executar o Algoritmo de Geração Lógica (Timetabling)
    try {
        const result = gerarHorarioAlgoritmico(
            turno as any,
            turmasDoTurno as any[],
            allProfessores as any[]
        );
        
        if (result.aulas.length > 0) {
            const aulasToInsert = result.aulas.map(aula => ({
                horario_id: novoHorario.id,
                turma_id: aula.turma_id,
                componente_id: aula.componente_id,
                professor_id: aula.professor_id,
                dia_semana: aula.dia_semana,
                aula_index: aula.aula_index,
                tipo: aula.tipo
            }));

            // Inserção em lote para performance e atomicidade
            const { error: insertError } = await supabase
                .from('horario_aulas')
                .insert(aulasToInsert);

            if (insertError) {
                console.error("❌ Erro ao salvar aulas no banco:", insertError);
                // Se der erro nas aulas, removemos o registro do horário para não deixar sujeira
                await supabase.from('horarios').delete().eq('id', novoHorario.id);
                return { error: `Erro ao salvar a grade: ${insertError.message}` };
            }
        }
    } catch (err: any) {
        console.error("❌ Erro no algoritmo de timetabling:", err);
        await supabase.from('horarios').delete().eq('id', novoHorario.id);
        return { error: 'Ocorreu um erro lógico ao organizar as aulas. Verifique as restrições dos professores.' };
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
        .eq('horario_id', id)
        .order('aula_index', { ascending: true });

    if (aError) return { error: 'Erro ao buscar as aulas do horário.' };

    return { 
        data: {
            ...horario,
            turno: horario.turno as any,
            aulas: (aulas || []) as any[],
        }
    };
}
