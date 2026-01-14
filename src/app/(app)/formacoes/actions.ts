'use server';

import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { z } from 'zod';

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

export async function createFormacao(formData: z.infer<typeof formacaoFormSchema>) {
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Usuário não autenticado.' };
  }

  const { name, modality, days } = formacaoFormSchema.parse(formData);

  const { data, error } = await supabase
    .from('formacoes')
    .insert([
      {
        name,
        modality,
        dates: days, // The entire days array is stored in the 'dates' jsonb column
        created_by: user.id,
        updated_at: new Date().toISOString(),
      },
    ])
    .select();

  if (error) {
    console.error('Error creating formacao:', error);
    return { error: 'Ocorreu um erro ao cadastrar a formação. Tente novamente.' };
  }

  return { data };
}
