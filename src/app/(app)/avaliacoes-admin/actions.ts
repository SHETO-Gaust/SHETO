
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { Turno, Horario, HorarioCompleto, ConfiguracaoGerminacao } from '@/lib/types';
import { gerarHorarioAlgoritmico } from '@/lib/timetabling';
import { getTurmas } from '../turmas/actions';
import { getProfessores } from '../professores/actions';
import { getTurnos } from '../turno/actions';

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
export async function iniciarGeracaoHorario(
    escolaId: string, 
    turnoId: string, 
    nomeHorario: string, 
    configGerminacao: ConfiguracaoGerminacao[] = [],
    force: boolean = false
) {
    const supabase = await createClient();

    if (!nomeHorario || nomeHorario.trim() === '') {
        return { error: 'O nome do horário é obrigatório.' };
    }

    // 1. Buscar Dados Necessários
    const [
        { data: allTurmas },
        { data: allProfessores },
        { data: allTurnos },
        { data: turno }
    ] = await Promise.all([
        getTurmas(escolaId),
        getProfessores(escolaId),
        getTurnos(escolaId),
        supabase.from('turnos').select('*').eq('id', turnoId).single()
    ]);

    const turmasDoTurno = allTurmas?.filter(t => t.serie.turno_id === turnoId) || [];

    if (turmasDoTurno.length === 0) {
        return { error: 'Não há turmas cadastradas para este turno. Verifique a página de Turmas.' };
    }

    if (!turno) return { error: 'Turno não encontrado.' };

    // 2. Buscar Ocupações de Horários Consolidados (Publicados) de OUTROS TURNOS
    // Isso evita que o professor seja alocado aqui se já estiver ocupado em outro turno ativo
    const { data: ocupacoesAtivas } = await supabase
        .from('horario_aulas')
        .select('professor_id, dia_semana, aula_index, tipo, horario:horarios!inner(id, status, turno_id)')
        .eq('horarios.escola_id', escolaId)
        .eq('horarios.status', 'publicado')
        .neq('horarios.turno_id', turnoId); // Apenas de outros turnos

    // 3. Executar o Algoritmo de Geração Lógica (Timetabling)
    const result = gerarHorarioAlgoritmico(
        turno as any,
        turmasDoTurno as any[],
        allProfessores as any[],
        allTurnos || [],
        configGerminacao,
        force,
        ocupacoesAtivas || [] // Passamos as restrições globais de professores ocupados
    );

    if (!result.success && !force) {
        return { error: result.error || 'Erro lógico ao organizar as aulas.' };
    }

    // 4. Criar o registro do horário
    const { data: novoHorario, error: hError } = await supabase
        .from('horarios')
        .insert({
            escola_id: escolaId,
            turno_id: turnoId,
            nome: force ? `${nomeHorario} (Incompleto)` : nomeHorario,
            status: 'em_rascunho',
        })
        .select()
        .single();

    if (hError) return { error: 'Falha ao criar registro de horário.' };

    try {
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

            const { error: insertError } = await supabase
                .from('horario_aulas')
                .insert(aulasToInsert);

            if (insertError) {
                console.error("❌ Erro ao salvar aulas no banco:", insertError);
                await supabase.from('horarios').delete().eq('id', novoHorario.id);
                return { error: `Erro ao salvar a grade: ${insertError.message}` };
            }
        }
    } catch (err: any) {
        console.error("❌ Erro no salvamento das aulas:", err);
        await supabase.from('horarios').delete().eq('id', novoHorario.id);
        return { error: 'Ocorreu um erro inesperado ao salvar os horários.' };
    }

    revalidatePath('/avaliacoes-admin');
    return { data: novoHorario };
}

export async function consolidarHorario(id: string) {
    const supabase = await createClient();
    
    // 1. Buscar informações do horário atual
    const { data: current, error: fError } = await supabase
        .from('horarios')
        .select('turno_id')
        .eq('id', id)
        .single();
    
    if (fError || !current) return { error: 'Horário não encontrado.' };

    // 2. Desativar outros horários ativos do mesmo turno
    await supabase
        .from('horarios')
        .update({ status: 'em_rascunho' })
        .eq('turno_id', current.turno_id)
        .eq('status', 'publicado');

    // 3. Consolidar este horário
    const { error: uError } = await supabase
        .from('horarios')
        .update({ status: 'publicado' })
        .eq('id', id);

    if (uError) return { error: 'Erro ao consolidar horário.' };

    revalidatePath('/avaliacoes-admin');
    revalidatePath(`/avaliacoes-admin/${id}`);
    return { success: true };
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

    // Buscar Turno Oposto para exibir horários do contraturno
    const { data: allTurnos } = await supabase.from('turnos').select('*').eq('escola_id', horario.escola_id);
    const nomeTurno = (horario.turno as any).nome.toLowerCase();
    const turnoOposto = allTurnos?.find(t => {
        if (nomeTurno.includes('matutino')) return t.nome.toLowerCase().includes('vespertino');
        if (nomeTurno.includes('vespertino')) return t.nome.toLowerCase().includes('matutino');
        return false;
    }) || allTurnos?.find(t => t.id !== (horario.turno as any).id);

    const { data: aulas, error: aError } = await supabase
        .from('horario_aulas')
        .select('*, componente:componentes_curriculares(id, nome, sigla), professor:professores(id, nome_horario), turma:turmas(id, nome)')
        .eq('horario_id', id)
        .order('aula_index', { ascending: true });

    if (aError) return { error: 'Erro ao buscar as aulas do horário.' };

    // Buscar Configurações das Turmas envolvidas (Carga Horária Almejada e Professores Alocados)
    const { data: turmasConfig } = await supabase
        .from('turmas')
        .select(`
            id, 
            serie:series(
                id, 
                componentes:series_componentes(
                    aulas_presenciais, 
                    aulas_nao_presenciais, 
                    componente:componentes_curriculares(id, nome, sigla)
                )
            ),
            professores:turmas_professores(
                componente_id,
                professor:professores(nome_horario)
            )
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
