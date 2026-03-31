
'use server';

import { createClient } from '@/lib/supabase/server';
import type { HorarioCompleto, Turno } from '@/lib/types';

export async function getTurnosAtivos(escolaId: string): Promise<{ data?: Turno[], error?: string }> {
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

export async function getHorarioPublicadoPorTurno(turnoId: string): Promise<{ data?: HorarioCompleto, error?: string }> {
    const supabase = await createClient();
    
    // 1. Buscar o horário publicado para este turno
    const { data: horario, error: hError } = await supabase
        .from('horarios')
        .select('*, turno:turnos(*)')
        .eq('turno_id', turnoId)
        .eq('status', 'publicado')
        .single();

    if (hError || !horario) return { error: 'Nenhum horário publicado encontrado para este turno.' };

    // 2. Identificar Turno Oposto para contraturno
    const { data: allTurnos } = await supabase.from('turnos').select('*').eq('escola_id', horario.escola_id);
    const nomeTurno = (horario.turno as any).nome.toLowerCase();
    const turnoOposto = allTurnos?.find(t => {
        if (nomeTurno.includes('matutino')) return t.nome.toLowerCase().includes('vespertino');
        if (nomeTurno.includes('vespertino')) return t.nome.toLowerCase().includes('matutino');
        return false;
    }) || allTurnos?.find(t => t.id !== (horario.turno as any).id);

    // 3. Buscar aulas deste horário
    const { data: aulas } = await supabase
        .from('horario_aulas')
        .select('*, componente:componentes_curriculares(id, nome, sigla), professor:professores(id, nome_horario), turma:turmas(id, nome)')
        .eq('horario_id', horario.id)
        .order('aula_index', { ascending: true });

    // 4. Buscar outras aulas publicadas para a visão global do professor
    const { data: outrasAulasPublicadas } = await supabase
        .from('horario_aulas')
        .select(`
            *, 
            componente:componentes_curriculares(id, nome, sigla), 
            professor:professores(id, nome_horario), 
            turma:turmas(id, nome),
            horario:horarios!inner(id, status, turno_id, turno:turnos(*))
        `)
        .eq('horarios.escola_id', horario.escola_id)
        .eq('horarios.status', 'publicado')
        .neq('horario_id', horario.id);

    return { 
        data: {
            ...horario,
            turno: horario.turno as any,
            turno_oposto: turnoOposto as any,
            aulas: (aulas || []) as any[],
            outras_aulas_publicadas: (outrasAulasPublicadas || []) as any[],
            turmas_config: [] // Não necessário na visualização operacional
        }
    };
}
