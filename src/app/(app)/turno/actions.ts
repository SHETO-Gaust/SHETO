'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import type { Turno, HorarioAula } from '@/lib/types';

/* -------------------------------------------------------------------------- */
/*                               GET TURNOS                                   */
/* -------------------------------------------------------------------------- */
/**
 * Busca os turnos de uma escola.
 * Caso não existam, cria os turnos padrão.
 */
export async function getTurnos(
  escolaId: string
): Promise<{ data?: Turno[]; error?: string }> {
  const supabase = await createClient(cookies());

  const { data, error } = await supabase
    .from('turnos')
    .select('*')
    .eq('escola_id', escolaId)
    .order('nome', { ascending: true });

  if (error) {
    console.error('Error fetching turnos:', error);
    return { error: 'Não foi possível buscar os turnos.' };
  }

  if (!data || data.length === 0) {
    const defaultTurnos = [
      {
        nome: 'Matutino',
        escola_id: escolaId,
        ativo: true,
        aulas_por_dia: 5,
        dias_semana: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
      },
      {
        nome: 'Vespertino',
        escola_id: escolaId,
        ativo: true,
        aulas_por_dia: 5,
        dias_semana: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
      },
      {
        nome: 'Noturno',
        escola_id: escolaId,
        ativo: false,
        aulas_por_dia: 4,
        dias_semana: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
      },
    ];

    const { data: newTurnos, error: insertError } = await supabase
      .from('turnos')
      .insert(defaultTurnos)
      .select();

    if (insertError) {
      console.error('Error creating default turnos:', insertError);
      return { error: 'Não foi possível criar os turnos padrão.' };
    }

    return { data: newTurnos as Turno[] };
  }

  return { data: data as Turno[] };
}

/* -------------------------------------------------------------------------- */
/*                              UPSERT TURNO                                  */
/* -------------------------------------------------------------------------- */

const upsertTurnoSchema = z.object({
  id: z.string().optional(),
  escola_id: z.string(),
  nome: z.string().min(3, 'O nome deve ter pelo menos 3 caracteres.'),
  dias_semana: z.array(z.string()),
  aulas_por_dia: z.coerce
    .number()
    .min(1, 'Deve haver pelo menos 1 aula por dia.'),
});

/**
 * Cria ou atualiza um turno.
 */
export async function upsertTurno(
  formData: z.infer<typeof upsertTurnoSchema>
) {
  const supabase = createClient(cookies());

  const validated = upsertTurnoSchema.safeParse(formData);
  if (!validated.success) {
    return {
      error: 'Dados inválidos.',
      errors: validated.error.flatten().fieldErrors,
    };
  }

  const { id, escola_id, nome, dias_semana, aulas_por_dia } = validated.data;

  const { data, error } = await supabase
    .from('turnos')
    .upsert(
      { id, escola_id, nome, dias_semana, aulas_por_dia },
      { onConflict: 'id' }
    )
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return { error: `Um turno com o nome "${nome}" já existe.` };
    }

    console.error('Error upserting turno:', error);
    return { error: 'Não foi possível salvar o turno.' };
  }

  revalidatePath('/turno');
  return { data };
}

/* -------------------------------------------------------------------------- */
/*                          ATIVAR / DESATIVAR TURNO                           */
/* -------------------------------------------------------------------------- */

export async function updateTurnoStatus(id: string, ativo: boolean) {
  const supabase = createClient(cookies());

  const { error } = await supabase
    .from('turnos')
    .update({ ativo })
    .eq('id', id);

  if (error) {
    console.error('Error updating turno status:', error);
    return { error: 'Não foi possível atualizar o status do turno.' };
  }

  revalidatePath('/turno');
  return { success: true };
}

/* -------------------------------------------------------------------------- */
/*                         HORÁRIOS DO TURNO                                   */
/* -------------------------------------------------------------------------- */

const horarioAulaSchema = z.object({
  id: z.string(),
  inicio: z.string().regex(
    /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
    'Formato de hora inválido.'
  ),
  fim: z.string().regex(
    /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
    'Formato de hora inválido.'
  ),
});

const updateHorariosSchema = z
  .object({
    id: z.string(),
    horarios: z.array(horarioAulaSchema),
  })
  .refine(
    ({ horarios }) =>
      horarios.every(aula => aula.inicio < aula.fim),
    {
      message: 'O horário de início deve ser anterior ao horário de fim.',
      path: ['horarios'],
    }
  );

/**
 * Atualiza os horários de um turno.
 */
export async function updateTurnoHorarios(
  formData: z.infer<typeof updateHorariosSchema>
) {
  const supabase = await createClient(cookies());

  const validated = updateHorariosSchema.safeParse(formData);
  if (!validated.success) {
    return {
      error: 'Dados inválidos.',
      errors: validated.error.flatten().fieldErrors,
    };
  }

  const { id, horarios } = validated.data;

  const { error } = await supabase
    .from('turnos')
    .update({ horarios: horarios as HorarioAula[] })
    .eq('id', id);

  if (error) {
    console.error('Error updating turno horarios:', error);
    return { error: 'Não foi possível salvar os horários do turno.' };
  }

  revalidatePath('/turno');
  return { success: true };
}

/* -------------------------------------------------------------------------- */
/*                                DELETE TURNO                                */
/* -------------------------------------------------------------------------- */
export async function deleteTurno(id: string) {
  const supabase = createClient(cookies());

  const { error } = await supabase.from('turnos').delete().eq('id', id);

  if (error) {
    console.error('Error deleting turno:', error);
    return { error: 'Não foi possível deletar o turno.' };
  }

  revalidatePath('/turno');
  return { success: true };
}
