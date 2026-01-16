'use server';

import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';

const locationSchema = z.object({
  morning: z.boolean().default(false),
  morning_location: z.string().optional(),
  afternoon: z.boolean().default(false),
  afternoon_location: z.string().optional(),
});

const daySchema = z.object({
  date: z.date(),
  location: locationSchema,
});

const formacaoFormSchema = z.object({
  name: z.string(),
  modality: z.enum(['presencial', 'online']),
  daysCount: z.number(),
  days: z.array(daySchema),
});

const updateFormacaoFormSchema = formacaoFormSchema.extend({
  id: z.string(),
});

export async function createFormacao(formData: z.infer<typeof formacaoFormSchema>) {
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Usuário não autenticado.' };
  }

  const validatedFields = formacaoFormSchema.safeParse(formData);

  if (!validatedFields.success) {
    return {
      error: 'Dados inválidos. Verifique o formulário.',
      errors: validatedFields.error.flatten().fieldErrors,
    };
  }

  const { name, modality, days } = validatedFields.data;

  const { data, error } = await supabase
    .from('formacoes')
    .insert([
      {
        name,
        modality,
        dates: days, 
        created_by: user.id,
        updated_at: new Date().toISOString(),
      },
    ])
    .select();

  if (error) {
    console.error('Error creating formacao:', error);
    return { error: 'Ocorreu um erro ao cadastrar a formação. Tente novamente.' };
  }

  revalidatePath('/formacoes');
  return { data };
}

export async function updateFormacao(formData: z.infer<typeof updateFormacaoFormSchema>) {
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);

  const validatedFields = updateFormacaoFormSchema.safeParse(formData);

  if (!validatedFields.success) {
    return {
      error: 'Dados inválidos. Verifique o formulário.',
      errors: validatedFields.error.flatten().fieldErrors,
    };
  }

  const { id, name, modality, days } = validatedFields.data;

  const { data, error } = await supabase
    .from('formacoes')
    .update({
      name,
      modality,
      dates: days,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

    if (error) {
        console.error('Error updating formacao:', error);
        return { error: 'Ocorreu um erro ao atualizar a formação. Tente novamente.' };
    }

    revalidatePath('/formacoes');
    revalidatePath('/dashboard');
    return { data };
}


export async function deleteFormacao(id: string) {
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);

  const { error } = await supabase.from('formacoes').delete().eq('id', id);

  if (error) {
    console.error('Error deleting formacao:', error);
    return { error: 'Ocorreu um erro ao deletar a formação.' };
  }

  revalidatePath('/formacoes');
  return { success: true };
}

export async function duplicateFormacao(formacaoId: string) {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { error: 'Usuário não autenticado.' };
    }

    // 1. Fetch original
    const { data: originalFormacao, error: fetchError } = await supabase
        .from('formacoes')
        .select('*')
        .eq('id', formacaoId)
        .single();

    if (fetchError || !originalFormacao) {
        console.error('Error fetching original formacao for duplication:', fetchError);
        return { error: 'Não foi possível encontrar a formação original para duplicar.' };
    }
    
    // 2. Prepare new object
    const { id, created_at, name, ...rest } = originalFormacao;
    
    const newFormacaoData = {
        ...rest,
        name: `[CÓPIA] ${name}`,
        created_by: user.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        // Reset open status for subscription and attendance
        subscription_form_config: originalFormacao.subscription_form_config 
            ? { ...originalFormacao.subscription_form_config, open: false }
            : null,
        attendance_list_info: originalFormacao.attendance_list_info
            ? { ...originalFormacao.attendance_list_info, open: false }
            : null,
    };

    // 3. Insert new object
    const { error: insertError } = await supabase.from('formacoes').insert([newFormacaoData]);

    if (insertError) {
        console.error('Error duplicating formacao:', insertError);
        return { error: 'Ocorreu um erro ao duplicar a formação.' };
    }

    revalidatePath('/formacoes');
    return { success: true };
}
