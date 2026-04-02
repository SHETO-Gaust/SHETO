
'use server';

import { createClient } from '@/lib/supabase/server';
import type { ChecklistReportData, TurmaComDados, ProfessorComDados, Turno } from '@/lib/types';
import { getTurmas } from '@/app/(app)/turmas/actions';
import { getProfessores } from '@/app/(app)/professores/actions';
import { getTurnos } from '@/app/(app)/turno/actions';

/**
 * Relatório 1: Checklist de Dados
 */
export async function getChecklistReportData(escolaId: string, turnoId: string): Promise<{ data?: ChecklistReportData; error?: string }> {
  const supabase = await createClient();

  try {
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
      supabase.from('series').select('id, nome, turno_id, series_componentes(aulas_presenciais, aulas_nao_presenciais, componente_id)').eq('escola_id', escolaId),
    ]);

    if (turnosResult.error) throw new Error('Falha ao buscar turnos.');
    const allTurnos = turnosResult.data || [];
    const allProfessores = professoresResult.data || [];
    const allTurmas = turmasResult.data || [];
    const allSeries = seriesResult.data || [];
    
    const selectedTurno = allTurnos.find(t => t.id === turnoId);
    const seriesDoTurno = allSeries.filter(s => s.turno_id === turnoId);
    const turmasDoTurno = allTurmas.filter(t => t.serie.turno_id === turnoId);
    const professoresDoTurno = allProfessores.filter(p => p.turnos_ids.includes(turnoId));

    const checklist: ChecklistReportData = [];

    // 1. Turno
    checklist.push({
        id: '1',
        title: 'Configuração do Turno',
        description: 'Verifica se os dias e horários das aulas foram definidos.',
        status: selectedTurno && selectedTurno.horarios?.length ? 'ok' : 'error',
        details: !(selectedTurno && selectedTurno.horarios?.length) ? 'Horários das aulas não configurados.' : '',
        link: '/turno'
    });
    
    // 2. Séries
    const seriesIncompletas = seriesDoTurno.filter(s => {
        const total = s.series_componentes.reduce((acc, curr) => acc + (curr.aulas_presenciais || 0), 0);
        const esperado = (selectedTurno?.aulas_por_dia || 0) * (selectedTurno?.dias_semana?.length || 0);
        return total !== esperado;
    });
    checklist.push({
        id: '2',
        title: 'Carga Horária das Séries',
        description: 'A soma das aulas das disciplinas deve bater com a grade do turno.',
        status: seriesIncompletas.length > 0 ? 'warning' : 'ok',
        details: seriesIncompletas.length > 0 ? `Séries com carga divergente: ${seriesIncompletas.map(s => s.nome).join(', ')}` : '',
        link: '/serie'
    });

    // 3. Ensalamento
    const turmasIncompletas = turmasDoTurno.filter(t => {
        const componentesObrigatorios = t.serie.componentes.filter(c => (c.aulas_presenciais || 0) > 0);
        const alocados = t.professores.map(p => p.componente_id);
        return componentesObrigatorios.some(c => !alocados.includes(c.componente_id));
    });
    checklist.push({
        id: '3',
        title: 'Vínculo de Professores (Ensalamento)',
        description: 'Todas as disciplinas das turmas devem ter um professor associado.',
        status: turmasIncompletas.length > 0 ? 'error' : 'ok',
        details: turmasIncompletas.length > 0 ? `${turmasIncompletas.length} turmas possuem disciplinas sem professor.` : '',
        link: '/turmas'
    });

    return { data: checklist };
  } catch (error: any) {
    return { error: error.message };
  }
}

/**
 * Relatório 2: Carga Horária Docente (Audit)
 */
export async function getWorkloadReportData(escolaId: string, turnoId: string) {
    const { data: turmas } = await getTurmas(escolaId);
    const { data: professores } = await getProfessores(escolaId);

    if (!turmas || !professores) return { error: 'Dados insuficientes.' };

    const report = professores.map(prof => {
        let totalAtribuido = 0;
        const detalhes: any[] = [];

        turmas.forEach(t => {
            t.professores.forEach(p => {
                if (p.professor_id === prof.id) {
                    const comp = t.serie.componentes.find(c => c.componente_id === p.componente_id);
                    const aulas = (comp?.aulas_presenciais || 0) + (comp?.aulas_nao_presenciais || 0);
                    totalAtribuido += aulas;
                    detalhes.push({ turma: t.nome, serie: t.serie.nome, aulas, disciplina: (comp as any).componente?.nome });
                }
            });
        });

        return {
            id: prof.id,
            nome: prof.nome_horario,
            disponivel: prof.aulas_disponiveis,
            atribuido: totalAtribuido,
            saldo: prof.aulas_disponiveis - totalAtribuido,
            detalhes
        };
    }).sort((a, b) => a.nome.localeCompare(b.nome));

    return { data: report };
}

/**
 * Relatório 3: Mapa de Gargalos (Heatmap de Disponibilidade)
 */
export async function getBottleneckReportData(escolaId: string, turnoId: string) {
    const supabase = await createClient();
    const { data: turno } = await supabase.from('turnos').select('*').eq('id', turnoId).single();
    const { data: turmas } = await supabase.from('turmas').select('id, serie:series(turno_id)').filter('serie.turno_id', 'eq', turnoId);
    const { data: professores } = await getProfessores(escolaId);

    if (!turno || !professores) return { error: 'Dados insuficientes.' };

    const numTurmas = turmas?.length || 0;
    const dias = turno.dias_semana;
    const aulas = turno.aulas_por_dia;

    const heatmap = dias.map((dia: string) => {
        const slots = Array.from({ length: aulas }).map((_, idx) => {
            // Conta quantos professores estão disponíveis (não tem bloqueio nem planejamento)
            const disponiveis = professores.filter(p => {
                const r = p.restricoes?.[turnoId]?.[dia]?.[idx];
                return r !== 'indisponivel' && r !== 'planejamento' && p.turnos_ids.includes(turnoId);
            }).length;

            return {
                aula: idx + 1,
                disponiveis,
                necessarios: numTurmas,
                conflito: disponiveis < numTurmas
            };
        });
        return { dia, slots };
    });

    return { data: { heatmap, numTurmas, turnoNome: turno.nome } };
}
