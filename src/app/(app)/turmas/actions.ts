'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getProfessores } from '@/app/(app)/professores/actions';
import type { TurmaComDados, Serie, ComponenteCurricular, ProfessorComDados } from '@/lib/types';

/* -------------------------------------------------------------------------- */
/*                                  GET TURMAS                                */
/* -------------------------------------------------------------------------- */
export async function getTurmas(escolaId: string): Promise<{ data?: TurmaComDados[], error?: string }> {
  const supabase = await createClient();
  try {
    const { data: turmas, error: turmasError } = await supabase
      .from('turmas')
      .select(`
        *,
        serie:series(id, nome, turno_id, componentes:series_componentes(*, componente:componentes_curriculares(id, nome, sigla))),
        professores:turmas_professores(*, professor:professores(id, nome_horario))
      `)
      .eq('escola_id', escolaId)
      .order('nome', { referencedTable: 'series', ascending: true })
      .order('nome', { ascending: true });

    if (turmasError) throw turmasError;
    if (!turmas) return { data: [] };

    return { data: turmas as any[] };
  } catch (error: any) {
    console.error("Error fetching turmas:", error);
    return { error: 'Não foi possível buscar as turmas.' };
  }
}

/* -------------------------------------------------------------------------- */
/*                              GET DEPENDENCIES                              */
/* -------------------------------------------------------------------------- */
export async function getEnsalamentoDependencies(escolaId: string): Promise<{
    series: (Serie & { componentes: { componente_id: string, aulas_presenciais: number, aulas_nao_presenciais: number }[] })[],
    professores: ProfessorComDados[],
    componentes: ComponenteCurricular[],
}> {
    const supabase = await createClient();
    const [seriesResult, professoresResult, componentesResult] = await Promise.all([
        supabase.from('series').select('*, componentes:series_componentes(componente_id, aulas_presenciais, aulas_nao_presenciais)').eq('escola_id', escolaId),
        getProfessores(escolaId),
        supabase.from('componentes_curriculares').select('*').eq('escola_id', escolaId)
    ]);

    return {
        series: seriesResult.data as any[] || [],
        professores: professoresResult.data || [],
        componentes: componentesResult.data || [],
    };
}

/* -------------------------------------------------------------------------- */
/*                                 UPSERT TURMA                               */
/* -------------------------------------------------------------------------- */
const upsertTurmaSchema = z.object({
  id: z.string().optional(),
  escola_id: z.string(),
  serie_id: z.string({ required_error: 'Selecione um modelo de série.' }),
  nome: z.string().min(1, 'O nome/letra da turma é obrigatório.'),
});

export async function upsertTurma(formData: z.infer<typeof upsertTurmaSchema>) {
    const supabase = await createClient();
    const validated = upsertTurmaSchema.safeParse(formData);
    if (!validated.success) {
        return { error: 'Dados inválidos.', errors: validated.error.flatten().fieldErrors };
    }
    const { id, ...dataToUpsert } = validated.data;

    const { data, error } = await supabase
        .from('turmas')
        .upsert(id ? { id, ...dataToUpsert } : dataToUpsert, { onConflict: 'id' })
        .select().single();
    
    if (error) {
        if (error.code === '23505') {
            return { error: `Uma turma com este nome já existe para esta série.` };
        }
        console.error("Error upserting turma:", error);
        return { error: "Não foi possível salvar a turma." };
    }

    revalidatePath('/turmas');
    return { data };
}

/* -------------------------------------------------------------------------- */
/*                                DELETE TURMA                                */
/* -------------------------------------------------------------------------- */
export async function deleteTurma(id: string) {
    const supabase = await createClient();
    const { error } = await supabase.from('turmas').delete().eq('id', id);
    if (error) {
        console.error("Error deleting turma:", error);
        return { error: 'Não foi possível deletar a turma.' };
    }
    revalidatePath('/turmas');
    return { success: true };
}


/* -------------------------------------------------------------------------- */
/*                             UPDATE ENSALAMENTO                             */
/* -------------------------------------------------------------------------- */
const ensalamentoSchema = z.object({
    turma_id: z.string(),
    assignments: z.array(z.object({
        componente_id: z.string(),
        professor_id: z.string().nullable(),
    }))
});

export async function updateEnsalamento(formData: z.infer<typeof ensalamentoSchema>) {
    const supabase = await createClient();
    const validated = ensalamentoSchema.safeParse(formData);
    if (!validated.success) return { error: 'Dados de ensalamento inválidos.' };
    
    const { turma_id, assignments } = validated.data;

    // Delete old assignments for this turma
    const { error: deleteError } = await supabase
        .from('turmas_professores')
        .delete()
        .eq('turma_id', turma_id);

    if (deleteError) {
        console.error("Error deleting old ensalamento:", deleteError);
        return { error: 'Erro ao limpar ensalamento antigo.' };
    }

    const toInsert = assignments
        .filter(a => a.professor_id && a.professor_id !== 'none')
        .map(a => ({
            turma_id,
            componente_id: a.componente_id,
            professor_id: a.professor_id!,
        }));

    if (toInsert.length > 0) {
        const { error: insertError } = await supabase
            .from('turmas_professores')
            .insert(toInsert);
        
        if (insertError) {
            console.error("Error inserting new ensalamento:", insertError);
            return { error: 'Erro ao salvar o novo ensalamento.' };
        }
    }

    revalidatePath('/turmas');
    revalidatePath('/relatorios');
    return { success: true };
}
