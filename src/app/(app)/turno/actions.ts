'use server';

import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { Turno } from '@/lib/types';

/* =======================
   GET
======================= */
export async function getTurnos(escolaId: string) {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    const { data: turnos, error } = await supabase
        .from('turnos')
        .select('*')
        .eq('escola_id', escolaId)
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Error fetching turnos:', error);
        return { data: [], error: 'Não foi possível buscar os turnos.' };
    }

    if (turnos.length === 0) {
        // First time access for this school, create default turnos
        const defaultTurnos = [
            { escola_id: escolaId, nome: 'Matutino', ativo: true, dias_semana: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'], aulas_por_dia: 5 },
            { escola_id: escolaId, nome: 'Vespertino', ativo: false, dias_semana: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'], aulas_por_dia: 5 },
            { escola_id: escolaId, nome: 'Noturno', ativo: false, dias_semana: [], aulas_por_dia: 4 },
        ];

        const { data: newTurnos, error: insertError } = await supabase
            .from('turnos')
            .insert(defaultTurnos)
            .select();

        if (insertError) {
            console.error('Error creating default turnos:', insertError);
            return { data: [], error: 'Não foi possível criar os turnos padrão.' };
        }
        return { data: newTurnos as Turno[], error: null };
    }

    return { data: turnos as Turno[], error: null };
}


/* =======================
   SCHEMAS
======================= */

const turnoSchema = z.object({
  id: z.string().optional(),
  escola_id: z.string(),
  nome: z.string().min(3, 'O nome deve ter pelo menos 3 caracteres.'),
  dias_semana: z.array(z.string()),
  aulas_por_dia: z.coerce.number().min(1, 'Deve haver pelo menos 1 aula por dia.'),
});

const horariosFormSchema = z.object({
  id: z.string(),
  horarios: z.array(z.object({
    id: z.string(),
    inicio: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Formato inválido."),
    fim: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Formato inválido."),
  })),
}).refine(data => {
    for (const aula of data.horarios) {
        if (!aula.inicio || !aula.fim || aula.inicio >= aula.fim) return false;
    }
    return true;
}, {
    message: 'Todos os horários devem ser preenchidos e o início deve ser anterior ao fim.',
    path: ['horarios'],
});


/* =======================
   CREATE / UPDATE
======================= */

export async function upsertTurno(formData: z.infer<typeof turnoSchema>) {
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);

  const parsed = turnoSchema.safeParse(formData);

  if (!parsed.success) {
    return {
      error: 'Dados inválidos.',
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  const { id, escola_id, nome, dias_semana, aulas_por_dia } = parsed.data;

  if (id) {
    // UPDATE
    const { data, error } = await supabase
      .from('turnos')
      .update({ nome, dias_semana, aulas_por_dia })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error(error);
      return { error: 'Não foi possível atualizar o turno.' };
    }

    revalidatePath('/turno');
    return { data: data as Turno };
  }

  // CREATE
  const { data, error } = await supabase
    .from('turnos')
    .insert({ escola_id, nome, dias_semana, aulas_por_dia, ativo: true })
    .select()
    .single();

  if (error) {
    console.error(error);
    return { error: 'Não foi possível criar o turno.' };
  }

  revalidatePath('/turno');
  return { data: data as Turno };
}

/* =======================
   STATUS
======================= */

export async function updateTurnoStatus(id: string, ativo: boolean) {
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase
    .from('turnos')
    .update({ ativo })
    .eq('id', id);

  if (error) {
    console.error(error);
    return { error: 'Erro ao atualizar status.' };
  }

  revalidatePath('/turno');
  return { success: true };
}


/* =======================
   HORARIOS
======================= */

export async function updateTurnoHorarios(formData: z.infer<typeof horariosFormSchema>) {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    const parsed = horariosFormSchema.safeParse(formData);

    if (!parsed.success) {
        return {
            error: 'Dados inválidos.',
            errors: parsed.error.flatten().fieldErrors,
        };
    }

    const { id, horarios } = parsed.data;

    const { error } = await supabase
        .from('turnos')
        .update({ horarios: horarios as any })
        .eq('id', id);

    if (error) {
        console.error(error);
        return { error: 'Não foi possível atualizar os horários.' };
    }

    revalidatePath('/turno');
    return { success: true };
}
