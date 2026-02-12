'use server';

import { createClient } from '@/lib/supabase/server';
import type { ChecklistReportData, TurmaComDados, ProfessorComDados } from '@/lib/types';
import { getTurmas } from '@/app/(app)/turmas/actions';
import { getProfessores } from '@/app/(app)/professores/actions';
import { getTurnos } from '@/app/(app)/turno/actions';


export async function getChecklistReportData(escolaId: string, turnoId: string): Promise<{ data?: ChecklistReportData; error?: string }> {
  const supabase = await createClient();

  try {
    // Parallel data fetching
    const [
      turnosResult,
      niveisEnsinoResult,
      componentesResult,
      professoresResult,
      turmasResult,
      seriesResult,
    ] = await Promise.all([
      getTurnos(escolaId),
      supabase.from('niveis_ensino').select('id', { count: 'exact', head: true }).eq('escola_id', escolaId),
      supabase.from('componentes_curriculares').select('id', { count: 'exact', head: true }).eq('escola_id', escolaId),
      getProfessores(escolaId),
      getTurmas(escolaId),
      supabase.from('series').select('id, nome, turno_id, series_componentes(aulas_presenciais, componente_id)').eq('escola_id', escolaId),
    ]);

    // Handle potential errors from fetches
    if (turnosResult.error) throw new Error('Falha ao buscar turnos.');
    if (niveisEnsinoResult.error) throw new Error('Falha ao buscar níveis de ensino.');
    if (componentesResult.error) throw new Error('Falha ao buscar componentes.');
    if (professoresResult.error) throw new Error('Falha ao buscar professores.');
    if (turmasResult.error) throw new Error('Falha ao buscar turmas.');
    if (seriesResult.error) throw new Error('Falha ao buscar séries.');

    const allTurnos = turnosResult.data || [];
    const allProfessores = professoresResult.data || [];
    const allTurmas = turmasResult.data || [];
    const allSeries = seriesResult.data || [];
    
    // --- Start of new logic ---

    // Calculate assigned classes for each professor
    const aulasAtribuidasMap = new Map<string, number>();
    for (const turma of allTurmas) {
      for (const prof of turma.professores) {
        const comp = turma.serie.componentes.find(c => c.componente_id === prof.componente_id);
        if (comp) {
          const currentCount = aulasAtribuidasMap.get(prof.professor_id) || 0;
          const totalAulas = (comp.aulas_presenciais || 0) + (comp.aulas_nao_presenciais || 0);
          aulasAtribuidasMap.set(prof.professor_id, currentCount + totalAulas);
        }
      }
    }
    
    const selectedTurno = allTurnos.find(t => t.id === turnoId);
    const seriesDoTurno = allSeries.filter(s => s.turno_id === turnoId);
    const turmasDoTurno = allTurmas.filter(t => t.serie.turno_id === turnoId);
    const professoresDoTurno = allProfessores.filter(p => p.turnos_ids.includes(turnoId));

    const checklist: ChecklistReportData = [];

    // 1. Turno
    checklist.push({
        id: '1',
        title: 'Turno',
        description: 'Verificar os dias e horários dos turnos.',
        status: selectedTurno && selectedTurno.horarios && selectedTurno.horarios.length > 0 && selectedTurno.dias_semana.length > 0 ? 'ok' : 'error',
        details: !(selectedTurno && selectedTurno.horarios && selectedTurno.horarios.length > 0) ? 'Horários ou dias da semana não configurados.' : '',
        link: '/turno'
    });
    
    // 2. Ensino
    checklist.push({
        id: '2',
        title: 'Ensino',
        description: 'Verificar se os Ensinos foram cadastrados.',
        status: (niveisEnsinoResult.count ?? 0) > 0 ? 'ok' : 'error',
        details: (niveisEnsinoResult.count ?? 0) === 0 ? 'Nenhum nível de ensino cadastrado.' : '',
        link: '/ensino'
    });

    // 3. Disciplinas
    checklist.push({
        id: '3',
        title: 'Disciplinas',
        description: 'Verificar se as Disciplinas foram cadastradas.',
        status: (componentesResult.count ?? 0) > 0 ? 'ok' : 'error',
        details: (componentesResult.count ?? 0) === 0 ? 'Nenhuma disciplina (componente) cadastrada.' : '',
        link: '/componentes'
    });

    // 4. Séries
    const seriesComProblemaCarga = seriesDoTurno
        .filter(s => {
          const totalAulasDistribuidas = s.series_componentes.reduce((sum, item) => sum + item.aulas_presenciais, 0);
          const turnoDaSerie = allTurnos.find(t => t.id === s.turno_id);
          const totalAulasSemanais = (turnoDaSerie?.aulas_por_dia || 0) * (turnoDaSerie?.dias_semana?.length || 0);
          return totalAulasSemanais !== totalAulasDistribuidas;
        })
        .map(s => s.nome);

    checklist.push({
        id: '4',
        title: 'Carga Horária Presencial das Séries',
        description: 'Verificar se a soma das aulas presenciais das disciplinas bate com o total de aulas semanais do turno.',
        status: seriesComProblemaCarga.length > 0 ? 'warning' : 'ok',
        details: seriesComProblemaCarga.length > 0 ? `Séries com carga horária inconsistente: ${seriesComProblemaCarga.join(', ')}` : '',
        link: '/serie'
    });

    // 5. Professores
    const professoresSemDisciplina = professoresDoTurno.filter(p => p.componentes.length === 0).map(p => p.nome_horario);
    checklist.push({
        id: '5',
        title: 'Habilitação dos Professores',
        description: 'Verificar se os professores foram associados com suas respectivas disciplinas.',
        status: professoresSemDisciplina.length > 0 ? 'warning' : 'ok',
        details: professoresSemDisciplina.length > 0 ? `Professores sem disciplinas associadas: ${professoresSemDisciplina.join(', ')}` : '',
        link: '/professores'
    });

    // 6. Turmas e Ensalamento
    const turmasComEnsalamentoIncompleto = turmasDoTurno
        .filter(t => {
            const componentesDaSerie = t.serie.componentes.filter(c => (c.aulas_presenciais + c.aulas_nao_presenciais) > 0);
            const professoresAlocados = t.professores.map(p => p.componente_id);
            return componentesDaSerie.some(c => !professoresAlocados.includes(c.componente_id));
        })
        .map(t => `${t.serie.nome} - ${t.nome}`);

    checklist.push({
        id: '6',
        title: 'Ensalamento das Turmas',
        description: 'Verificar nas turmas se os professores estão relacionados com todas as disciplinas.',
        status: turmasDoTurno.length === 0 ? 'error' : turmasComEnsalamentoIncompleto.length > 0 ? 'warning' : 'ok',
        details: turmasDoTurno.length === 0 ? 'Nenhuma turma criada para este turno.' : turmasComEnsalamentoIncompleto.length > 0 ? `Turmas com disciplinas sem professor: ${turmasComEnsalamentoIncompleto.join('; ')}` : '',
        link: '/turmas'
    });
    
    // 7. Carga Horária dos Professores
    const overbookedProfessors: string[] = [];
    if (selectedTurno) {
        for (const prof of professoresDoTurno) {
            const aulasAtribuidas = aulasAtribuidasMap.get(prof.id) || 0;
            if (aulasAtribuidas > prof.aulas_disponiveis) {
                overbookedProfessors.push(prof.nome_horario);
            }
        }
    }
    checklist.push({
        id: '7',
        title: 'Consistência da Carga Horária',
        description: 'Verifica se algum professor foi alocado em mais aulas do que sua carga horária disponível permite.',
        status: overbookedProfessors.length > 0 ? 'error' : 'ok',
        details: overbookedProfessors.length > 0 ? `Professores com mais aulas do que o disponível: ${overbookedProfessors.join(', ')}` : '',
        link: '/turmas'
    });
    
    // 8. Relatório de Restrições dos Professores
    const bottleneckSlots: string[] = [];
    if (selectedTurno && turmasDoTurno.length > 0) {
        const numTurmas = turmasDoTurno.length;
        for (const dia of selectedTurno.dias_semana) {
            for (let aulaIndex = 0; aulaIndex < selectedTurno.aulas_por_dia; aulaIndex++) {
                const professorsRestrictedInSlot = professoresDoTurno.filter(p => p.restricoes?.[turnoId]?.[dia]?.[aulaIndex]).length;
                const availableProfessors = professoresDoTurno.length - professorsRestrictedInSlot;
                if (availableProfessors < numTurmas) {
                    bottleneckSlots.push(`${dia.charAt(0).toUpperCase() + dia.slice(1)}, ${aulaIndex + 1}ª aula`);
                }
            }
        }
    }
    checklist.push({
        id: '8',
        title: 'Conflito de Restrições',
        description: 'Verifica se a quantidade de professores disponíveis em cada horário é suficiente para a quantidade de turmas.',
        status: bottleneckSlots.length > 0 ? 'error' : 'ok',
        details: bottleneckSlots.length > 0 ? `Conflito de disponibilidade. Não há professores suficientes para todas as turmas nos seguintes horários: ${bottleneckSlots.join('; ')}` : '',
        link: '/professores'
    });

    return { data: checklist };
  } catch (error: any) {
    console.error('Error fetching checklist report data:', error);
    return { error: error.message || 'Não foi possível buscar os dados do relatório.' };
  }
}

// Placeholder actions for other reports
export async function getDadosInstituicao(escolaId: string, turnoId: string) {
    // In the future, this will fetch detailed data.
    await new Promise(resolve => setTimeout(resolve, 500));
    return { data: { message: `Dados da Instituição para o turno ${turnoId} (Em construção)` }};
}

export async function getRestricoesProfessores(escolaId: string, turnoId: string) {
    // In the future, this will fetch professor restrictions.
    await new Promise(resolve => setTimeout(resolve, 500));
    return { data: { message: `Restrições dos Professores para o turno ${turnoId} (Em construção)` }};
}

export async function getHorariosTurmas(escolaId: string, turnoId: string) {
    // In the future, this will fetch generated schedules.
    await new Promise(resolve => setTimeout(resolve, 500));
    return { data: { message: `Horários das Turmas para o turno ${turnoId} (Em construção)` }};
}
