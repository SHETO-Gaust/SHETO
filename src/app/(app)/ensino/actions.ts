
'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import type { NivelEnsino } from '@/lib/types';

/* -------------------------------------------------------------------------- */
/*                               GET NIVEIS ENSINO                            */
/* -------------------------------------------------------------------------- */
/**
 * Busca os níveis de ensino de uma escola.
 * Caso não existam, cria os níveis padrão.
 */
export async function getNiveisEnsino(
  escolaId: string
): Promise<{ data?: NivelEnsino[]; error?: string }> {
  const supabase = createClient(cookies());

  const { data, error } = await supabase
    .from('niveis_ensino')
    .select('*')
    .eq('escola_id', escolaId)
    .order('nome', { ascending: true });

  if (error) {
    console.error('Error fetching niveis_ensino:', error);
    return { error: 'Não foi possível buscar as etapas de ensino.' };
  }

  if (!data || data.length === 0) {
    const defaultNiveis = [
      {
        nome: 'Ensino Fundamental II',
        sigla: 'EF-II',
        escola_id: escolaId,
      },
      {
        nome: 'Ensino Médio',
        sigla: 'EM',
        escola_id: escolaId,
      },
    ];

    const { data: newNiveis, error: insertError } = await supabase
      .from('niveis_ensino')
      .insert(defaultNiveis)
      .select();

    if (insertError) {
      console.error('Error creating default niveis_ensino:', insertError);
      return { error: 'Não foi possível criar as etapas de ensino padrão.' };
    }

    return { data: newNiveis as NivelEnsino[] };
  }

  return { data: data as NivelEnsino[] };
}

/* -------------------------------------------------------------------------- */
/*                              UPSERT NIVEL ENSINO                           */
/* -------------------------------------------------------------------------- */

const upsertNivelEnsinoSchema = z.object({
  id: z.string().optional(),
  escola_id: z.string(),
  nome: z.string().min(3, 'O nome deve ter pelo menos 3 caracteres.'),
  sigla: z.string().min(1, 'A sigla é obrigatória.'),
});

/**
 * Cria ou atualiza um nível de ensino.
 */
export async function upsertNivelEnsino(
  formData: z.infer<typeof upsertNivelEnsinoSchema>
) {
  const supabase = createClient(cookies());

  const validated = upsertNivelEnsinoSchema.safeParse(formData);
  if (!validated.success) {
    return {
      error: 'Dados inválidos.',
      errors: validated.error.flatten().fieldErrors,
    };
  }

  const { id, ...dataToUpsert } = validated.data;

  const { data, error } = await supabase
    .from('niveis_ensino')
    .upsert(
      id ? { id, ...dataToUpsert } : dataToUpsert,
      { onConflict: 'id' }
    )
    .select()
    .single();

  if (error) {
    if (error.code === '23505') { // unique_violation
        if (error.message.includes('nome')) {
            return { error: `Uma etapa com o nome "${dataToUpsert.nome}" já existe.` };
        }
        if (error.message.includes('sigla')) {
            return { error: `Uma etapa com a sigla "${dataToUpsert.sigla}" já existe.` };
        }
    }

    console.error('Error upserting nivel_ensino:', error);
    return { error: 'Não foi possível salvar a etapa de ensino.' };
  }

  revalidatePath('/ensino');
  return { data };
}


/* -------------------------------------------------------------------------- */
/*                                DELETE NIVEL ENSINO                         */
/* -------------------------------------------------------------------------- */
export async function deleteNivelEnsino(id: string) {
  const supabase = createClient(cookies());

  const { error } = await supabase.from('niveis_ensino').delete().eq('id', id);

  if (error) {
    console.error('Error deleting nivel_ensino:', error);
    return { error: 'Não foi possível deletar a etapa de ensino.' };
  }

  revalidatePath('/ensino');
  return { success: true };
}
