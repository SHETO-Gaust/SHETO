'use server';

import { createClient } from '@/lib/supabase/server';
import type { ChecklistReportData, Turno, SerieComDados, ProfessorComDados } from '@/lib/types';
import { getSeries } from '../../serie/actions';
import { getProfessores } from '../../professores/actions';
import { getTurnos } from '../../turno/actions';


export async function getChecklistReportData(escolaId: string, turnoId: string): Promise<{ data?: ChecklistReportData; error?: string }> {
  const supabase = await createClient();

  try {
    // Parallel data fetching
    const [
      turnosResult,
      niveisEnsinoResult,
      componentesResult,
      professoresResult,
      seriesResult,
    ] = await Promise.all([
      getTurnos(escolaId),
      supabase.from('niveis_ensino').select('id', { count: 'exact', head: true }).eq('escola_id', escolaId),
      supabase.from('componentes_curriculares').select('id', { count: 'exact', head: true }).eq('escola_id', escolaId),
      getProfessores(escolaId),
      getSeries(escolaId),
    ]);

    // Handle potential errors from fetches
    if (turnosResult.error) throw new Error('Falha ao buscar turnos.');
    if (niveisEnsinoResult.error) throw new Error('Falha ao buscar níveis de ensino.');
    if (componentesResult.error) throw new Error('Falha ao buscar componentes.');
    if (professoresResult.error) throw new Error('Falha ao buscar professores.');
    if (seriesResult.error) throw new Error('Falha ao buscar séries.');

    const allTurnos = turnosResult.data || [];
    const allProfessores = professoresResult.data || [];
    const allSeries = seriesResult.data || [];

    const checklist: ChecklistReportData = [];

    // 1. Turno
    const selectedTurno = allTurnos.find(t => t.id === turnoId);
    checklist.push({
        id: '1',
        title: 'Turno',
        description: 'Verificar os dias e horários dos turnos.',
        status: selectedTurno && selectedTurno.horarios && selectedTurno.horarios.length > 0 && selectedTurno.dias_semana.length > 0 ? 'ok' : 'error',
        details: selectedTurno && selectedTurno.horarios && selectedTurno.horarios.length > 0 ? '' : 'Horários ou dias da semana não configurados.',
        link: '/turno'
    });
    
    // 2. Ensino
    checklist.push({
        id: '2',
        title: 'Ensino',
        description: 'Verificar se os Ensinos foram cadastrados.',
        status: (niveisEnsinoResult.count ?? 0) > 0 ? 'ok' : 'error',
        details: (niveisEnsinoResult.count ?? 0) > 0 ? '' : 'Nenhum nível de ensino cadastrado.',
        link: '/ensino'
    });

    // 3. Disciplinas
    checklist.push({
        id: '3',
        title: 'Disciplinas',
        description: 'Verificar se as Disciplinas foram cadastradas.',
        status: (componentesResult.count ?? 0) > 0 ? 'ok' : 'error',
        details: (componentesResult.count ?? 0) > 0 ? '' : 'Nenhuma disciplina (componente) cadastrada.',
        link: '/componentes'
    });

    const seriesDoTurno = allSeries.filter(s => s.turno_id === turnoId);

    // 4. Séries
    checklist.push({
        id: '4',
        title: 'Séries',
        description: 'Verificar as informações relacionadas as Séries.',
        status: seriesDoTurno.length > 0 ? 'ok' : 'warning',
        details: seriesDoTurno.length > 0 ? '' : 'Nenhuma série cadastrada para este turno.',
        link: '/serie'
    });

    // 4.1 Séries / Disciplinas
    const seriesComProblemaCarga = seriesDoTurno
        .filter(s => s.total_aulas_semanais !== s.total_aulas_distribuidas)
        .map(s => s.nome);
    checklist.push({
        id: '4.1',
        title: 'Séries / Disciplinas',
        description: 'Verificar se séries estão com a quantidade correta de aulas de cada disciplina.',
        status: seriesComProblemaCarga.length > 0 ? 'warning' : 'ok',
        details: seriesComProblemaCarga.length > 0 ? `Séries que devem ser revisadas: ${seriesComProblemaCarga.join(' - ')}` : '',
        link: '/serie'
    });

    // 5. Professores
    checklist.push({
        id: '5',
        title: 'Professores',
        description: 'Verificar as informações relacionadas aos Professores.',
        status: allProfessores.length > 0 ? 'ok' : 'error',
        details: allProfessores.length > 0 ? '' : 'Nenhum professor cadastrado.',
        link: '/professores'
    });

    // 5.1 Professores / Disciplinas
    const professoresDoTurno = allProfessores.filter(p => p.turnos_ids.includes(turnoId));
    const professoresSemDisciplina = professoresDoTurno.filter(p => p.componentes.length === 0).map(p => p.nome_horario);
    checklist.push({
        id: '5.1',
        title: 'Professores / Disciplinas',
        description: 'Verificar se os professores foram associados com suas respectivas disciplinas.',
        status: professoresSemDisciplina.length > 0 ? 'warning' : 'ok',
        details: professoresSemDisciplina.length > 0 ? `Professores sem disciplinas associadas: ${professoresSemDisciplina.join(', ')}` : '',
        link: '/professores'
    });

    // 6. Turmas (Placeholder)
    checklist.push({
        id: '6',
        title: 'Turmas',
        description: 'Verificar as informações relacionadas as Turmas.',
        status: 'ok',
        details: 'Funcionalidade em desenvolvimento.',
        link: '/ensalamentos'
    });

    // 6.1 Turmas / Professores / Disciplinas (Placeholder)
    checklist.push({
        id: '6.1',
        title: 'Turmas / Professores / Disciplinas',
        description: 'Verificar nas turmas se os professores estão relacionados com todas as disciplinas.',
        status: 'ok',
        details: 'Funcionalidade em desenvolvimento.',
        link: '/ensalamentos'
    });
    
    // 7. Relatório de Dados Cadastrados (Placeholder)
    checklist.push({
        id: '7',
        title: 'Relatório de Dados Cadastrados',
        description: 'Verifica se existe algum professor com mais restrições no horário que o possível. Exemplo: professor ministra 10 aulas semanais, porém possui apenas 5 horários disponíveis.',
        status: 'ok',
        details: 'Lógica de verificação em desenvolvimento.',
        link: '/relatorios'
    });
    
    // 8. Relatório de Restrições dos Professores (Placeholder)
    checklist.push({
        id: '8',
        title: 'Relatório de Restrições dos Professores',
        description: 'Verifica se a quantidade de professores disponíveis em cada horário é suficiente para a quantidade de turmas.',
        status: 'error',
        details: 'Lógica de verificação em desenvolvimento.',
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
