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
        ...(currentState || {}),
        open: !currentState?.open,
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

export async function toggleAttendance(formacaoId: string, currentState: any) {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    const newConfig = {
        ...(currentState || {}),
        open: !currentState?.open,
    };

    const { data, error } = await supabase
        .from('formacoes')
        .update({ attendance_list_info: newConfig })
        .eq('id', formacaoId)
        .select();

    if (error) {
        console.error('Error toggling attendance:', error);
        return { error: 'Ocorreu um erro ao alterar o status da frequência.' };
    }

    revalidatePath('/gerenciamento');
    revalidatePath('/frequencia');
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

export async function deleteInscricoes(ids: string[]) {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    if (!ids || ids.length === 0) {
        return { error: 'Nenhuma inscrição selecionada.' };
    }

    const { error } = await supabase
        .from('inscricoes')
        .delete()
        .in('id', ids);

    if (error) {
        console.error('Error bulk deleting inscricoes:', error);
        return { error: 'Ocorreu um erro ao deletar as inscrições em lote.' };
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


const bulkInscricaoSchema = z.array(z.object({
    cpf: z.string(),
    nome_completo: z.string(),
    email: z.string().email(),
    dados: z.record(z.any()),
}));

export async function bulkCreateInscricao(formacao_id: string, inscritos: z.infer<typeof bulkInscricaoSchema>) {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    const cpfs = inscritos.map(i => i.cpf);
    const { data: existing, error: existingError } = await supabase
        .from('inscricoes')
        .select('cpf')
        .eq('formacao_id', formacao_id)
        .in('cpf', cpfs);

    if (existingError) {
        console.error('Error checking for existing inscricoes:', existingError);
        return { error: 'Ocorreu um erro ao verificar as inscrições existentes.' };
    }

    const existingCpfs = new Set(existing.map(e => e.cpf));
    const newInscritos = inscritos
        .filter(i => !existingCpfs.has(i.cpf))
        .map(i => ({ ...i, formacao_id }));
    
    const duplicates = inscritos.length - newInscritos.length;

    if (newInscritos.length === 0) {
        return { 
            data: { inserted: 0, duplicates },
            message: 'Nenhum novo inscrito para adicionar. Todos os CPFs da lista já constam como inscritos.'
        };
    }

    const { error } = await supabase.from('inscricoes').insert(newInscritos);

    if (error) {
        console.error('Error on bulk insert:', error);
        return { error: 'Ocorreu um erro ao inserir a lista de inscritos.' };
    }

    revalidatePath('/gerenciamento');
    return { data: { inserted: newInscritos.length, duplicates } };
}

export async function updateAttendanceConfig(formacaoId: string, config: any) {
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);

  const { data, error } = await supabase
    .from('formacoes')
    .update({ attendance_list_info: config })
    .eq('id', formacaoId)
    .select();

  if (error) {
    console.error('Error updating attendance config:', error);
    return { error: 'Ocorreu um erro ao salvar as configurações de frequência.' };
  }

  revalidatePath('/gerenciamento');
  return { data };
}

const syncFormadoresToAddSchema = z.object({
  formacao_date: z.string(),
  name: z.string(),
  reference: z.string().optional(),
  periodo: z.enum(['matutino', 'vespertino', 'integral']).optional(),
});

export async function syncFormadores(
  formacao_id: string,
  to_add: z.infer<typeof syncFormadoresToAddSchema>[],
  to_delete: string[]
) {
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);

  if (to_delete.length > 0) {
    const { error: deleteError } = await supabase
      .from('formadores')
      .delete()
      .in('id', to_delete);
    
    if (deleteError) {
      console.error('Error deleting formadores:', deleteError);
      return { error: 'Ocorreu um erro ao remover formadores.' };
    }
  }

  if (to_add.length > 0) {
    const dataToAdd = to_add.map(f => ({
      formacao_id,
      formacao_date: f.formacao_date,
      name: f.name,
      reference: f.reference,
      periodo: f.periodo,
    }));
    const { error: addError } = await supabase
      .from('formadores')
      .insert(dataToAdd);

    if (addError) {
      console.error('Error adding formadores:', addError);
      return { error: `Ocorreu um erro ao adicionar novos formadores: ${addError.message}` };
    }
  }
  
  revalidatePath('/gerenciamento');
  return { success: true };
}

export async function toggleAvaliacao(formacaoId: string, currentState: any) {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    const newConfig = {
        ...(currentState || {}),
        open: !currentState?.open,
    };

    const { data, error } = await supabase
        .from('formacoes')
        // @ts-ignore
        .update({ gadsg_info: { avaliacao: newConfig } })
        .eq('id', formacaoId)
        .select();

    if (error) {
        console.error('Error toggling avaliacao:', error);
        return { error: 'Ocorreu um erro ao alterar o status da avaliação.' };
    }

    revalidatePath('/gerenciamento');
    revalidatePath('/avaliacoes');
    return { data };
}
