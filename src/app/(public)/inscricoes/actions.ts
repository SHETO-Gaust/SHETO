'use server';

import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { validateCPF } from '@/lib/utils';

const formSchema = z.object({
  formacao_id: z.string(),
  nome_completo: z.string().min(3, 'Nome completo é obrigatório.'),
  cpf: z.string().length(14, 'CPF inválido.').refine(validateCPF, 'CPF inválido.'),
  email: z.string().email('Email inválido.'),
  dados: z.record(z.any()),
});


export async function createInscricao(formData: z.infer<typeof formSchema>) {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    const validatedFields = formSchema.safeParse(formData);

    if (!validatedFields.success) {
        return {
        error: 'Dados inválidos. Verifique o formulário.',
        errors: validatedFields.error.flatten().fieldErrors,
        };
    }

    const { formacao_id, cpf, email, nome_completo, dados } = validatedFields.data;

    // Check for duplicate CPF for the same formacao
    const { data: existingInscricao, error: existingError } = await supabase
        .from('inscricoes')
        .select('id')
        .eq('formacao_id', formacao_id)
        .eq('cpf', cpf)
        .single();

    if (existingError && existingError.code !== 'PGRST116') { // PGRST116: 'exact-one' violation (no rows)
        console.error('Error checking for existing inscricao:', existingError);
        return { error: 'Ocorreu um erro ao verificar sua inscrição. Tente novamente.' };
    }

    if (existingInscricao) {
        return { error: 'Este CPF já está inscrito nesta formação.' };
    }

    const { data, error } = await supabase
        .from('inscricoes')
        .insert([
        {
            formacao_id,
            cpf,
            nome_completo,
            email,
            dados,
        },
        ])
        .select();

    if (error) {
        console.error('Error creating inscricao:', error);
        return { error: 'Ocorreu um erro ao realizar a inscrição. Tente novamente.' };
    }

    revalidatePath(`/inscricoes/${formacao_id}`);
    return { data };
}
