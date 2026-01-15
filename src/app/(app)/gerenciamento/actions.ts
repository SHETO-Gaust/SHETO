'use server';

import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

export async function updateSubscriptionFormConfig(formacaoId: string, config: any) {
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);

  const { data, error } = await supabase
    .from('formacoes')
    .update({ subscription_form_config: config })
    .eq('id', formacaoId)
    .select();

  if (error) {
    console.error('Error updating subscription form config:', error);
    return { error: 'Ocorreu um erro ao salvar as configurações do formulário.' };
  }

  revalidatePath('/gerenciamento');
  revalidatePath('/inscricoes');
  return { data };
}


export async function toggleSubscription(formacaoId: string, currentState: any) {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    const newConfig = {
        ...currentState,
        open: !currentState.open,
    };

    const { data, error } = await supabase
        .from('formacoes')
        .update({ subscription_form_config: newConfig })
        .eq('id', formacaoId)
        .select();

    if (error) {
        console.error('Error toggling subscription:', error);
        return { error: 'Ocorreu um erro ao alterar o status da inscrição.' };
    }

    revalidatePath('/gerenciamento');
    revalidatePath('/inscricoes');
    return { data };
}
