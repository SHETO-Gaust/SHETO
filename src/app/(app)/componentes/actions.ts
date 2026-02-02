
'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import type { ComponenteCurricular } from '@/lib/types';

const defaultComponentes = [
  { nome: 'Língua Portuguesa', sigla: 'LP' },
  { nome: 'Língua Inglesa', sigla: 'ING' },
  { nome: 'Arte', sigla: 'ART' },
  { nome: 'Educação Física', sigla: 'ED. FIS' },
  { nome: 'Matemática', sigla: 'MAT' },
  { nome: 'Biologia', sigla: 'BIO' },
  { nome: 'Física', sigla: 'FIS' },
  { nome: 'Química', sigla: 'QUI' },
  { nome: 'História', sigla: 'HIST' },
  { nome: 'Geografia', sigla: 'GEO' },
  { nome: 'Filosofia', sigla: 'FIL' },
  { nome: 'Sociologia', sigla: 'SOC' },
];

export async function getComponentes(
  escolaId: string
): Promise<{ data?: ComponenteCurricular[]; error?: string }> {
  const supabase = await createClient(cookies());

  const { data, error } = await supabase
    .from('componentes_curriculares')
    .select('*')
    .eq('escola_id', escolaId)
    .order('nome', { ascending: true });

  if (error) {
    console.error('Error fetching componentes_curriculares:', error);
    return { error: 'Não foi possível buscar os componentes curriculares.' };
  }

  if (!data || data.length === 0) {
    const dataToInsert = defaultComponentes.map(c => ({ ...c, escola_id: escolaId }));

    const { data: newComponentes, error: insertError } = await supabase
      .from('componentes_curriculares')
      .insert(dataToInsert)
      .select();

    if (insertError) {
      console.error('Error creating default componentes_curriculares:', insertError);
      return { error: 'Não foi possível criar os componentes padrão.' };
    }

    return { data: newComponentes as ComponenteCurricular[] };
  }

  return { data: data as ComponenteCurricular[] };
}

const upsertComponenteSchema = z.object({
  id: z.string().optional(),
  escola_id: z.string(),
  nome: z.string().min(3, 'O nome deve ter pelo menos 3 caracteres.'),
  sigla: z.string().min(1, 'A sigla é obrigatória.'),
});

export async function upsertComponente(
  formData: z.infer<typeof upsertComponenteSchema>
) {
  const supabase = await createClient(cookies());

  const validated = upsertComponenteSchema.safeParse(formData);
  if (!validated.success) {
    return {
      error: 'Dados inválidos.',
      errors: validated.error.flatten().fieldErrors,
    };
  }

  const { id, ...dataToUpsert } = validated.data;

  const { data, error } = await supabase
    .from('componentes_curriculares')
    .upsert(
      id ? { id, ...dataToUpsert } : dataToUpsert,
      { onConflict: 'id' }
    )
    .select()
    .single();

  if (error) {
    if (error.code === '23505') { // unique_violation
        if (error.message.includes('nome')) {
            return { error: `Um componente com o nome "${dataToUpsert.nome}" já existe.` };
        }
        if (error.message.includes('sigla')) {
            return { error: `Um componente com a sigla "${dataToUpsert.sigla}" já existe.` };
        }
    }

    console.error('Error upserting componente_curricular:', error);
    return { error: 'Não foi possível salvar o componente curricular.' };
  }

  revalidatePath('/componentes');
  return { data };
}

export async function deleteComponente(id: string) {
  const supabase = await createClient(cookies());

  const { error } = await supabase.from('componentes_curriculares').delete().eq('id', id);

  if (error) {
    console.error('Error deleting componente_curricular:', error);
    return { error: 'Não foi possível deletar o componente curricular.' };
  }

  revalidatePath('/componentes');
  return { success: true };
}
