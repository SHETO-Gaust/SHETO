'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import type { ProfessorComDados, ComponenteCurricular, Turno } from '@/lib/types';

/* -------------------------------------------------------------------------- */
/* GET PROFESSORES                               */
/* -------------------------------------------------------------------------- */
export async function getProfessores(escolaId: string): Promise<{
  data?: ProfessorComDados[];
  error?: string;
}> {
  const supabase = await createClient();

  try {
    const { data: professores, error: profError } = await supabase
      .from('professores')
      .select('*')
      .eq('escola_id', escolaId)
      .order('nome_completo', { ascending: true });

    if (profError) throw profError;
    if (!professores || professores.length === 0) return { data: [] };

    const professorIds = professores.map(p => p.id);
    
    const { data: links, error: linkError } = await supabase
      .from('professores_componentes')
      .select('professor_id, componente_id')
      .in('professor_id', professorIds);
    
    if (linkError) throw linkError;

    const { data: componentes, error: compError } = await supabase
        .from('componentes_curriculares')
        .select('id, nome, sigla')
        .eq('escola_id', escolaId);

    if (compError) throw compError;
    const componentesMap = new Map(componentes.map(c => [c.id, c]));

    const { data: turnos, error: turnoError } = await supabase
        .from('turnos')
        .select('*')
        .eq('escola_id', escolaId);
        
    if (turnoError) throw turnoError;
    const turnosMap = new Map(turnos.map(t => [t.id, t]));

    const professoresComDados: ProfessorComDados[] = professores.map(prof => {
      const professorComponenteIds = links
        .filter(l => l.professor_id === prof.id)
        .map(l => l.componente_id);

      const professorComponentes = professorComponenteIds
        .map(id => componentesMap.get(id))
        .filter((c): c is Pick<ComponenteCurricular, 'id' | 'nome' | 'sigla'> => !!c);
        
      const professorTurnos = (prof.turnos_ids || [])
        .map(id => turnosMap.get(id))
        .filter((t): t is Turno => !!t);

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
/* UPSERT PROFESSOR                             */
/* -------------------------------------------------------------------------- */
const upsertProfessorSchema = z.object({
  id: z.string().optional(),
  escola_id: z.string(),
  nome_completo: z.string().min(3, 'O nome completo é obrigatório.'),
  nome_horario: z.string().min(2, 'O nome para o horário é obrigatório.'),
  email: z.string().email('Email inválido.').optional().or(z.literal('')),
  turnos_ids: z.array(z.string()).min(1, 'Selecione ao menos um turno.'),
  aulas_disponiveis: z.coerce.number().min(0, 'As aulas disponíveis não podem ser negativas.'),
  aulas_planejamento: z.coerce.number().min(0, 'As aulas de planejamento não podem ser negativas.'),
  componente_ids: z.array(z.string()).optional(),
});

export async function upsertProfessor(formData: z.infer<typeof upsertProfessorSchema>) {
  const supabase = await createClient(); 
  
  const validated = upsertProfessorSchema.safeParse(formData);
  if (!validated.success) {
    return { error: 'Dados inválidos.', errors: validated.error.flatten().fieldErrors };
  }
  
  const { id, componente_ids, ...dataToUpsert } = validated.data;
  
  const { data: professor, error } = await supabase
    .from('professores')
    .upsert(id ? { id, ...dataToUpsert } : dataToUpsert, { onConflict: 'id' })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
        return { error: `Um professor com o nome "${dataToUpsert.nome_completo}" já existe.` };
    }
    return { error: 'Não foi possível salvar o professor.' };
  }

  // Sincroniza componentes se fornecidos
  if (componente_ids !== undefined) {
    // Remove antigos
    await supabase
        .from('professores_componentes')
        .delete()
        .eq('professor_id', professor.id);
    
    // Insere novos
    if (componente_ids.length > 0) {
        const linksToInsert = componente_ids.map(componente_id => ({
            professor_id: professor.id,
            componente_id,
        }));
        await supabase.from('professores_componentes').insert(linksToInsert);
    }
  }

  revalidatePath('/professores');
  return { data: professor };
}

/* -------------------------------------------------------------------------- */
/* DELETE PROFESSOR                             */
/* -------------------------------------------------------------------------- */
export async function deleteProfessor(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('professores').delete().eq('id', id);

  if (error) return { error: 'Não foi possível deletar the professor.' };

  revalidatePath('/professores');
  return { success: true };
}

/* -------------------------------------------------------------------------- */
/* UPDATE COMPONENTES DO PROFESSOR                     */
/* -------------------------------------------------------------------------- */
export async function updateProfessorComponentes(professorId: string, componenteIds: string[]) {
    const supabase = await createClient();

    const { error: deleteError } = await supabase
        .from('professores_componentes')
        .delete()
        .eq('professor_id', professorId);
    
    if (deleteError) return { error: 'Não foi possível limpar as disciplinas antigas.' };

    if (componenteIds.length > 0) {
        const linksToInsert = componenteIds.map(componente_id => ({
            professor_id: professorId,
            componente_id,
        }));
        
        const { error: insertError } = await supabase
            .from('professores_componentes')
            .insert(linksToInsert);

        if (insertError) return { error: 'Não foi possível salvar as novas disciplinas.' };
    }
    
    revalidatePath('/professores');
    return { success: true };
}

/* -------------------------------------------------------------------------- */
/* UPDATE RESTRIÇÕES DO PROFESSOR                     */
/* -------------------------------------------------------------------------- */
export async function updateProfessorRestricoes(professorId: string, restricoes: any) {
    const supabase = await createClient();

    const { error } = await supabase
        .from('professores')
        .update({ restricoes })
        .eq('id', professorId);

    if (error) return { error: 'Não foi possível salvar as restrições de horário.' };

    revalidatePath('/professores');
    return { success: true };
}
