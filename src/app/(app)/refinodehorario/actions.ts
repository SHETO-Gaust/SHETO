'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { Turno } from '@/lib/types';
import type { AulaRefino } from '@/lib/refino-horario';

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
    
    // 2. Buscar TODAS as aulas publicadas e as do horário selecionado (mesmo se rascunho, mas filtramos para publicado na página)
    const { data: aulasRaw, error } = await supabase
        .from('horario_aulas')
        .select(`
            id, horario_id, turma_id, componente_id, professor_id, dia_semana, aula_index, tipo, turno_id,
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
    }));

    // Professores deste horário (do turno principal ou mesmo NP)
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

export async function aplicarMudancasRefino(mudancas: { aulaId: string; novoDia: string; novoSlot: number }[]) {
    if (!mudancas || mudancas.length === 0) return { error: 'Nenhuma mudança recebida.' };

    const supabase = await createClient();
    
    for (const m of mudancas) {
        const { error } = await supabase
            .from('horario_aulas')
            .update({
                dia_semana: m.novoDia,
                aula_index: m.novoSlot
            })
            .eq('id', m.aulaId);
            
        if (error) {
            console.error('Erro ao mover aula:', error);
            return { error: 'Falha ao aplicar mudanças.' };
        }
    }

    revalidatePath('/refinodehorario');
    revalidatePath('/visualizarhorario');
    revalidatePath('/gerarhorarios');
    return { success: true };
}
