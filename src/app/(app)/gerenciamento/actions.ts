'use server';

import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

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

export async function deleteInscricao(id: string) {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    const { error } = await supabase
        .from('inscricoes')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting inscricao:', error);
        return { error: 'Ocorreu um erro ao remover a inscrição.' };
    }

    revalidatePath('/gerenciamento');
    return { success: true };
}


const formSchema = z.object({
  id: z.string(),
  nome_completo: z.string().min(3, 'Nome completo é obrigatório.'),
  cpf: z.string().length(14, 'CPF inválido.'),
  email: z.string().email('Email inválido.'),
  dados: z.record(z.any()),
});


export async function updateInscricao(formData: z.infer<typeof formSchema>) {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    const validatedFields = formSchema.safeParse(formData);

    if (!validatedFields.success) {
        return {
        error: 'Dados inválidos. Verifique o formulário.',
        errors: validatedFields.error.flatten().fieldErrors,
        };
    }

    const { id, cpf, email, nome_completo, dados } = validatedFields.data;

    const { data, error } = await supabase
        .from('inscricoes')
        .update(
        {
            cpf,
            nome_completo,
            email,
            dados,
        },
        )
        .eq('id', id)
        .select();

    if (error) {
        console.error('Error updating inscricao:', error);
        return { error: 'Ocorreu um erro ao atualizar a inscrição. Tente novamente.' };
    }

    revalidatePath('/gerenciamento');
    return { data };
}
