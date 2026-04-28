
'use server';

import { createClient } from '@/lib/supabase/server';
import type { HorarioCompleto, Turno, Escola, Horario } from '@/lib/types';

/**
 * Busca todos os horários publicados e turnos de uma escola,
 * tratando o limite de 1000 registros do banco de dados através de busca em lotes.
 */
export async function getHorariosEscolaCompletos(escolaId: string) {
    const supabase = await createClient();

    // 1. Buscar todos os turnos da escola
    const { data: turnos } = await supabase
        .from('turnos')
        .select('*')
        .eq('escola_id', escolaId)
        .order('nome', { ascending: true });

    // 2. Buscar todos os horários publicados
    const { data: horarios } = await supabase
        .from('horarios')
        .select('*, turno:turnos(*)')
        .eq('escola_id', escolaId)
        .eq('status', 'publicado');

    if (!horarios || horarios.length === 0) {
        return { turnos: turnos || [], horariosCompletos: [], allAulas: [] };
    }

    const horarioIds = horarios.map(h => h.id);

    // 3. Buscar TODAS as aulas vinculadas a esses horários (Tratando o limite de 1000)
    let allAulas: any[] = [];
    let lastId = null;
    const PAGE_SIZE = 1000;
    let hasMore = true;

    while (hasMore) {
        let query = supabase
            .from('horario_aulas')
            .select(`
                *, 
                aula_fixa_id, compartilhada, aula_compartilhada_id,
                componente:componentes_curriculares(id, nome, sigla), 
                professor:professores(id, nome_horario, restricoes, livre_docencia, sem_preferencia_livre_docencia), 
                turma:turmas(id, nome),
                horario:horarios!inner(id, status, turno_id, turno:turnos(*))
            `)
            .in('horario_id', horarioIds)
            .order('id', { ascending: true })
            .limit(PAGE_SIZE);

        if (lastId) {
            query = query.gt('id', lastId);
        }

        const { data: batch, error } = await query;

        if (error || !batch || batch.length === 0) {
            hasMore = false;
        } else {
            allAulas = [...allAulas, ...batch];
            lastId = batch[batch.length - 1].id;
            if (batch.length < PAGE_SIZE) hasMore = false;
        }
    }

    // 4. Montar objetos HorarioCompleto para cada horário
    const horariosCompletos: HorarioCompleto[] = horarios.map(h => {
        const aulasDesteHorario = allAulas.filter(a => a.horario_id === h.id);
        const outrasAulas = allAulas.filter(a => a.horario_id !== h.id);

        const nomeTurno = (h.turno as any).nome.toLowerCase();
        const turnoOposto = turnos?.find(t => {
            if (nomeTurno.includes('matutino')) return t.nome.toLowerCase().includes('vespertino');
            if (nomeTurno.includes('vespertino')) return t.nome.toLowerCase().includes('matutino');
            return false;
        }) || turnos?.find(t => t.id !== (h.turno as any).id);

        return {
            ...h,
            turno: h.turno as any,
            turno_oposto: turnoOposto as any,
            aulas: aulasDesteHorario,
            outras_aulas_publicadas: outrasAulas,
            turmas_config: []
        };
    });

    return { 
        turnos: turnos || [], 
        horariosCompletos, 
        allAulas 
    };
}
