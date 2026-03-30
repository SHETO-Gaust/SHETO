
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
