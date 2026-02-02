'use server';

import { createClient } from '@/lib/supabase/server';
import type { SituacaoDados } from '@/lib/types';

export async function getSituacaoDados(escolaId: string): Promise<{ data?: SituacaoDados; error?: string }> {
  const supabase = await createClient();

  try {
    const [
      turnosResult,
      ensinoResult,
      componentesResult,
      professoresResult,
      seriesResult
    ] = await Promise.all([
      supabase.from('turnos').select('id', { count: 'exact', head: true }).eq('escola_id', escolaId),
      supabase.from('niveis_ensino').select('id', { count: 'exact', head: true }).eq('escola_id', escolaId),
      supabase.from('componentes_curriculares').select('id', { count: 'exact', head: true }).eq('escola_id', escolaId),
      supabase.from('professores').select('id', { count: 'exact', head: true }).eq('escola_id', escolaId),
      supabase.from('series').select('id', { count: 'exact', head: true }).eq('escola_id', escolaId),
    ]);

    if (turnosResult.error) throw turnosResult.error;
    if (ensinoResult.error) throw ensinoResult.error;
    if (componentesResult.error) throw componentesResult.error;
    if (professoresResult.error) throw professoresResult.error;
    if (seriesResult.error) throw seriesResult.error;

    const data: SituacaoDados = {
      turnos: turnosResult.count ?? 0,
      niveisEnsino: ensinoResult.count ?? 0,
      componentes: componentesResult.count ?? 0,
      professores: professoresResult.count ?? 0,
      series: seriesResult.count ?? 0,
    };

    return { data };

  } catch (error: any) {
    console.error('Error fetching situacao dos dados:', error);
    return { error: 'Não foi possível buscar a situação dos dados.' };
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
