
'use server';

import { createClient } from '@/lib/db/server';
import type { Turno, ProfessorComDados } from '@/lib/types';
import { getProfessores } from '../professores/actions';
import { requireEscolaDoRecurso, requireEscolaEModulo } from '@/lib/auth/guards';

export async function getTurnosAtivos(escolaId: string) {
    await requireEscolaEModulo(escolaId, 'horarios');
    const db = await createClient();
    const { data } = await db.from('turnos').select('*').eq('escola_id', escolaId).eq('ativo', true).order('nome');
    return { data: data as Turno[] };
}

export async function getProfessorAulasNoDia(turnoId: string, professorId: string, dia: string) {
    await requireEscolaDoRecurso('turnos', turnoId, 'horarios');
    const db = await createClient();
    
    // 1. Buscar horário publicado para o turno
    const { data: horario } = await db
        .from('horarios')
        .select('id')
        .eq('turno_id', turnoId)
        .eq('status', 'publicado')
        .single();

    if (!horario) return { error: 'Nenhum horário publicado para este turno.' };

    // 2. Buscar aulas do professor naquele dia
    const { data: aulas } = await db
        .from('horario_aulas')
        .select('*, turma:turmas(nome), componente:componentes_curriculares(nome, sigla)')
        .eq('horario_id', horario.id)
        .eq('professor_id', professorId)
        .eq('dia_semana', dia)
        .eq('tipo', 'presencial')
        .order('aula_index');

    return { data: aulas };
}

export async function buscarSubstitutosDisponiveis(escolaId: string, turnoId: string, dia: string, aulaIndex: number, turmaId: string) {
    await requireEscolaEModulo(escolaId, 'horarios');
    const db = await createClient();
    const { data: professores } = await getProfessores(escolaId);
    const { data: turno } = await db.from('turnos').select('*').eq('id', turnoId).single();

    if (!professores || !turno) return { error: 'Dados não encontrados.' };

    // 1. Buscar ocupações de TODOS os horários publicados naquele turno e aula
    const { data: ocupados } = await db
        .from('horario_aulas')
        .select('professor_id')
        .eq('dia_semana', dia)
        .eq('aula_index', aulaIndex)
        .eq('tipo', 'presencial')
        .not('professor_id', 'is', null);

    const ocupadosIds = new Set(ocupados?.map(o => o.professor_id) || []);

    // 1.5. Buscar professores que já ensinam nesta turma
    const { data: turmaProfessores } = await db
        .from('turmas_professores')
        .select('professor_id')
        .eq('turma_id', turmaId);
        
    const professoresDaTurmaIds = new Set(turmaProfessores?.map(tp => tp.professor_id) || []);

    // 2. Filtrar professores disponíveis e adicionar flag
    const disponiveis = professores.filter(p => {
        // Regra 1: Deve atuar neste turno
        if (!p.turnos_ids.includes(turnoId)) return false;

        // Regra 2: Não deve estar dando aula em nenhuma outra turma neste momento
        if (ocupadosIds.has(p.id)) return false;

        // Regra 3: Não deve ter restrição de indisponibilidade ou planejamento (que bloqueia o professor)
        const r = p.restricoes?.[turnoId]?.[dia]?.[aulaIndex];
        if (r === 'indisponivel' || r === 'planejamento') return false;

        return true;
    }).map(p => ({
        ...p,
        ja_ensina_na_turma: professoresDaTurmaIds.has(p.id)
    }));

    return { data: disponiveis };
}
