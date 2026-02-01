'use server';

import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import type { Turno, HorarioAula } from '@/lib/types';
import { z } from 'zod';

/**
 * Busca os turnos de uma escola. Se nenhum existir, cria os turnos padrão.
 */
export async function getTurnos(escolaId: string): Promise<{ data?: Turno[], error?: string }> {
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);

  const { data, error } = await supabase
    .from('turnos')
    .select('*')
    .eq('escola_id', escolaId)
    .order('nome', { ascending: true });

  if (error) {
    console.error('Error fetching turnos:', error);
    return { error: 'Não foi possível buscar os turnos.' };
  }

  if (data.length === 0) {
    // Primeira vez acessando, cria os turnos padrão
    const defaultTurnos = [
      { nome: 'Matutino', escola_id: escolaId, ativo: true, aulas_por_dia: 5, dias_semana: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'] },
      { nome: 'Vespertino', escola_id: escolaId, ativo: true, aulas_por_dia: 5, dias_semana: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'] },
      { nome: 'Noturno', escola_id: escolaId, ativo: false, aulas_por_dia: 4, dias_semana: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'] },
    ];
    const { data: newTurnos, error: insertError } = await supabase
      .from('turnos')
      .insert(defaultTurnos)
      .select();

    if (insertError) {
      console.error('Error creating default turnos:', insertError);
      return { error: 'Não foi possível criar os turnos padrão.' };
    }
    revalidatePath('/turno');
    return { data: newTurnos as Turno[] };
  }

  return { data: data as Turno[] };
}

const upsertTurnoSchema = z.object({
    id: z.string().optional(),
    escola_id: z.string(),
    nome: z.string().min(3, 'O nome deve ter pelo menos 3 caracteres.'),
    dias_semana: z.array(z.string()),
    aulas_por_dia: z.coerce.number().min(1, 'Deve haver pelo menos 1 aula por dia.'),
});

/**
 * Cria ou atualiza o nome de um turno.
 */
export async function upsertTurno(formData: z.infer<typeof upsertTurnoSchema>) {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    const validatedFields = upsertTurnoSchema.safeParse(formData);

    if (!validatedFields.success) {
        return {
            error: 'Dados inválidos.',
            errors: validatedFields.error.flatten().fieldErrors,
        };
    }
    
    const { id, escola_id, nome, dias_semana, aulas_por_dia } = validatedFields.data;

    const { data, error } = await supabase
        .from('turnos')
        .upsert({ id, escola_id, nome, dias_semana, aulas_por_dia }, { onConflict: 'id' })
        .select()
        .single();
    
    if (error) {
        if (error.code === '23505') { // unique_violation
            return { error: `Um turno com o nome "${nome}" já existe.` };
        }
        console.error('Error upserting turno:', error);
        return { error: 'Não foi possível salvar o turno.' };
    }
    
    revalidatePath('/turno');
    return { data };
}

/**
 * Ativa ou desativa um turno.
 */
export async function updateTurnoStatus(id: string, ativo: boolean) {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    const { error } = await supabase.from('turnos').update({ ativo }).eq('id', id);

    if (error) {
        console.error('Error updating turno status:', error);
        return { error: 'Não foi possível atualizar o status do turno.' };
    }
    revalidatePath('/turno');
    return { success: true };
}

const horarioAulaSchema = z.object({
  id: z.string(),
  inicio: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Formato de hora inválido."),
  fim: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Formato de hora inválido."),
});

const updateHorariosSchema = z.object({
  id: z.string(),
  horarios: z.array(horarioAulaSchema),
}).refine(data => {
    for (const aula of data.horarios) {
        if (aula.inicio >= aula.fim) {
            return false;
        }
    }
    return true;
}, {
    message: 'O horário de início deve ser anterior ao horário de fim.',
    path: ['horarios'],
});

/**
 * Salva a configuração de horários de um turno.
 */
export async function updateTurnoHorarios(formData: z.infer<typeof updateHorariosSchema>) {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    const validatedFields = updateHorariosSchema.safeParse(formData);

    if (!validatedFields.success) {
         return {
            error: 'Dados inválidos.',
            errors: validatedFields.error.flatten().fieldErrors,
        };
    }

    const { id, horarios } = validatedFields.data;

    const { error } = await supabase.from('turnos').update({ horarios: horarios as any }).eq('id', id);
    
    if (error) {
        console.error('Error updating turno horarios:', error);
        return { error: 'Não foi possível salvar os horários do turno.' };
    }

    revalidatePath('/turno');
    return { success: true };
}
