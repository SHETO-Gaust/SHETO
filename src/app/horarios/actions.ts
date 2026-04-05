
'use server';

import { createClient } from '@/lib/supabase/server';
import type { HorarioCompleto, Escola } from '@/lib/types';

export async function getEscolaPorInep(inep: string): Promise<{ data?: Escola, error?: string }> {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('escolas')
        .select('*')
        .eq('inep', inep)
        .single();

    if (error || !data) {
        return { error: 'Escola não encontrada com este código INEP.' };
    }
    return { data: data as Escola };
}

export async function getHorariosPublicos(escolaId: string): Promise<{ data?: HorarioCompleto[], error?: string }> {
    const supabase = await createClient();
    
    // Buscar horários publicados da escola
    const { data: horarios, error: hError } = await supabase
        .from('horarios')
        .select('*, turno:turnos(*)')
        .eq('escola_id', escolaId)
        .eq('status', 'publicado');

    if (hError) return { error: 'Erro ao buscar horários.' };
    if (!horarios || horarios.length === 0) return { data: [] };

    // Buscar todos os turnos para identificar contraturnos
    const { data: allTurnos } = await supabase.from('turnos').select('*').eq('escola_id', escolaId);

    const resultados: HorarioCompleto[] = [];

    for (const h of horarios) {
        const nomeTurno = (h.turno as any).nome.toLowerCase();
        const turnoOposto = allTurnos?.find(t => {
            if (nomeTurno.includes('matutino')) return t.nome.toLowerCase().includes('vespertino');
            if (nomeTurno.includes('vespertino')) return t.nome.toLowerCase().includes('matutino');
            return false;
        }) || allTurnos?.find(t => t.id !== (h.turno as any).id);

        const { data: aulas } = await supabase
            .from('horario_aulas')
            .select('*, componente:componentes_curriculares(id, nome, sigla), professor:professores(id, nome_horario), turma:turmas(id, nome)')
            .eq('horario_id', h.id)
            .order('aula_index', { ascending: true });

        resultados.push({
            ...h,
            turno: h.turno as any,
            turno_oposto: turnoOposto as any,
            aulas: (aulas || []) as any[],
            turmas_config: [] // Não necessário para visualização pública
        });
    }

    return { data: resultados };
}

// MELHORIA ITEM 3: Buscar horários consolidados por professor
export async function getGradeProfessorPublica(escolaId: string, nomeProfessor: string): Promise<{ data?: any, error?: string }> {
    const supabase = await createClient();

    // 1. Achar o professor na escola
    const { data: prof } = await supabase
        .from('professores')
        .select('id, nome_horario, restricoes')
        .eq('escola_id', escolaId)
        .ilike('nome_horario', `%${nomeProfessor}%`)
        .limit(1)
        .single();

    if (!prof) return { error: 'Professor não encontrado nesta unidade.' };

    // 2. Buscar todas as aulas publicadas deste professor nesta escola
    const { data: aulas } = await supabase
        .from('horario_aulas')
        .select(`
            *,
            componente:componentes_curriculares(id, nome, sigla),
            turma:turmas(id, nome),
            horario:horarios!inner(id, status, turno_id, turno:turnos(*))
        `)
        .eq('professor_id', prof.id)
        .eq('horarios.status', 'publicado')
        .eq('horarios.escola_id', escolaId);

    if (!aulas || aulas.length === 0) return { error: 'Este professor não possui aulas em grades publicadas no momento.' };

    // 3. Agrupar por turno para o visualizador
    const turnosMap = new Map<string, any>();
    aulas.forEach(a => {
        const tId = a.horario.turno_id;
        if (!turnosMap.has(tId)) {
            turnosMap.set(tId, {
                horario_id: a.horario_id,
                turno: a.horario.turno,
                aulas: []
            });
        }
        turnosMap.get(tId).aulas.push({
            ...a,
            professor: prof
        });
    });

    return { 
        data: {
            professor: prof,
            turnos: Array.from(turnosMap.values())
        }
    };
}
