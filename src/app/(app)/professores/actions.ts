'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import type { Professor, ProfessorComDados, ComponenteCurricular, Turno } from '@/lib/types';

/* -------------------------------------------------------------------------- */
/*                               GET PROFESSORES                              */
/* -------------------------------------------------------------------------- */
export async function getProfessores(escolaId: string): Promise<{
  data?: ProfessorComDados[];
  error?: string;
}> {
  const supabase = createClient(cookies());

  try {
    // 1. Fetch all professors for the school
    const { data: professores, error: profError } = await supabase
      .from('professores')
      .select('*')
      .eq('escola_id', escolaId)
      .order('nome_completo', { ascending: true });

    if (profError) throw profError;

    // 2. Fetch all linking table entries for the school's professors
    const professorIds = professores.map(p => p.id);
    const { data: links, error: linkError } = await supabase
      .from('professores_componentes')
      .select('professor_id, componente_id')
      .in('professor_id', professorIds);
    
    if (linkError) throw linkError;

    // 3. Fetch all components for the school
    const { data: componentes, error: compError } = await supabase
        .from('componentes_curriculares')
        .select('id, nome, sigla')
        .eq('escola_id', escolaId);

    if (compError) throw compError;
    const componentesMap = new Map(componentes.map(c => [c.id, c]));

    // 4. Fetch all turnos for the school
    const { data: turnos, error: turnoError } = await supabase
        .from('turnos')
        .select('id, nome')
        .eq('escola_id', escolaId);
        
    if (turnoError) throw turnoError;
    const turnosMap = new Map(turnos.map(t => [t.id, t]));

    // 5. Assemble the final data structure
    const professoresComDados: ProfessorComDados[] = professores.map(prof => {
      const professorComponenteIds = links
        .filter(l => l.professor_id === prof.id)
        .map(l => l.componente_id);

      const professorComponentes = professorComponenteIds
        .map(id => componentesMap.get(id))
        .filter((c): c is Pick<ComponenteCurricular, 'id' | 'nome' | 'sigla'> => !!c);
        
      const professorTurnos = (prof.turnos_ids || [])
        .map(id => turnosMap.get(id))
        .filter((t): t is Pick<Turno, 'id' | 'nome'> => !!t);

      return {
        ...prof,
        componentes: professorComponentes,
        turnos: professorTurnos,
      };
    });

    return { data: professoresComDados };
  } catch (error: any) {
    console.error('Error fetching professors data:', error);
    return { error: 'Não foi possível buscar os dados dos professores.' };
  }
}

/* -------------------------------------------------------------------------- */
/*                               UPSERT PROFESSOR                             */
/* -------------------------------------------------------------------------- */
const upsertProfessorSchema = z.object({
  id: z.string().optional(),
  escola_id: z.string(),
  nome_completo: z.string().min(3, 'O nome completo é obrigatório.'),
  nome_horario: z.string().min(2, 'O nome para o horário é obrigatório.'),
  email: z.string().email('Email inválido.').optional().or(z.literal('')),
  turnos_ids: z.array(z.string()).min(1, 'Selecione ao menos um turno.'),
});

export async function upsertProfessor(formData: z.infer<typeof upsertProfessorSchema>) {
  const supabase = createClient(cookies());
  
  const validated = upsertProfessorSchema.safeParse(formData);
  if (!validated.success) {
    return { error: 'Dados inválidos.', errors: validated.error.flatten().fieldErrors };
  }
  
  const { id, ...dataToUpsert } = validated.data;
  
  const { data, error } = await supabase
    .from('professores')
    .upsert(id ? { id, ...dataToUpsert } : dataToUpsert, { onConflict: 'id' })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') { // unique_violation
        return { error: `Um professor com o nome "${dataToUpsert.nome_completo}" já existe.` };
    }
    console.error('Error upserting professor:', error);
    return { error: 'Não foi possível salvar o professor.' };
  }

  revalidatePath('/professores');
  return { data };
}

/* -------------------------------------------------------------------------- */
/*                               DELETE PROFESSOR                             */
/* -------------------------------------------------------------------------- */
export async function deleteProfessor(id: string) {
  const supabase = createClient(cookies());
  const { error } = await supabase.from('professores').delete().eq('id', id);

  if (error) {
    console.error('Error deleting professor:', error);
    return { error: 'Não foi possível deletar o professor.' };
  }

  revalidatePath('/professores');
  return { success: true };
}

/* -------------------------------------------------------------------------- */
/*                        UPDATE COMPONENTES DO PROFESSOR                       */
/* -------------------------------------------------------------------------- */
export async function updateProfessorComponentes(professorId: string, componenteIds: string[]) {
    const supabase = createClient(cookies());

    // 1. Delete existing links for the professor
    const { error: deleteError } = await supabase
        .from('professores_componentes')
        .delete()
        .eq('professor_id', professorId);
    
    if (deleteError) {
        console.error('Error deleting professor_componentes links:', deleteError);
        return { error: 'Não foi possível limpar as disciplinas antigas.' };
    }

    // 2. Insert new links if there are any
    if (componenteIds.length > 0) {
        const linksToInsert = componenteIds.map(componente_id => ({
            professor_id: professorId,
            componente_id,
        }));
        
        const { error: insertError } = await supabase
            .from('professores_componentes')
            .insert(linksToInsert);

        if (insertError) {
            console.error('Error inserting professor_componentes links:', insertError);
            return { error: 'Não foi possível salvar as novas disciplinas.' };
        }
    }
    
    revalidatePath('/professores');
    return { success: true };
}

/* -------------------------------------------------------------------------- */
/*                         UPDATE RESTRIÇÕES DO PROFESSOR                      */
/* -------------------------------------------------------------------------- */
export async function updateProfessorRestricoes(professorId: string, restricoes: any) {
    const supabase = createClient(cookies());

    const { error } = await supabase
        .from('professores')
        .update({ restricoes })
        .eq('id', professorId);

    if (error) {
        console.error('Error updating professor restricoes:', error);
        return { error: 'Não foi possível salvar as restrições de horário.' };
    }

    revalidatePath('/professores');
    return { success: true };
}
