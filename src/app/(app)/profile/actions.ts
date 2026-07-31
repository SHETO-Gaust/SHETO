'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth/guards';
import { z } from 'zod';

const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Senha atual é obrigatória.'),
  newPassword: z.string().min(6, 'A nova senha deve ter no mínimo 6 caracteres.'),
  confirmPassword: z.string().min(6, 'A confirmação da nova senha deve ter no mínimo 6 caracteres.'),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: 'As novas senhas não correspondem.',
  path: ['confirmPassword'],
});

export async function updatePassword(formData: z.infer<typeof updatePasswordSchema>) {
    // Alem da sessao, requireAuth garante que o perfil esta ativo - um usuario
    // desativado nao deve conseguir trocar a propria senha.
    await requireAuth();
    const supabase = await createClient();

    const validatedFields = updatePasswordSchema.safeParse(formData);

    if (!validatedFields.success) {
        return {
            error: 'Dados inválidos. Verifique o formulário.',
            errors: validatedFields.error.flatten().fieldErrors,
        };
    }
    
    const { currentPassword, newPassword } = validatedFields.data;

    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !user.email) {
        return { error: 'Usuário não encontrado ou não autenticado.' };
    }

    // Step 1: Verify current password by trying to sign in with it.
    const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
    });

    if (signInError) {
        console.error('Error verifying current password:', signInError);
        return { error: 'A senha atual está incorreta.' };
    }

    // Step 2: If verification is successful, update the password.
    const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
    });

    if (updateError) {
        console.error('Error updating password:', updateError);
        return { error: 'Ocorreu um erro ao atualizar a senha. Tente novamente.' };
    }

    return { success: true };
}

export async function updateSelectedSchool(_userId: string, schoolId: string | null) {
    // O userId do cliente e IGNORADO de proposito: usar a sessao como fonte de
    // verdade impede que alguem troque a escola de outro usuario passando o id
    // dele. O parametro so permanece para nao quebrar a assinatura no cliente.
    const perfil = await requireAuth();
    const supabase = await createClient();

    // Usuario comum so pode selecionar a escola a qual esta vinculado;
    // admin pode alternar entre qualquer escola.
    if (perfil.role !== 'admin' && schoolId !== null && String(perfil.ue ?? '') !== String(schoolId)) {
        return { error: 'Você não tem acesso a esta unidade escolar.' };
    }

    const { error } = await supabase
        .from('profiles')
        .update({ ue: schoolId })
        .eq('id', perfil.id);

    if (error) {
        console.error('Error updating selected school:', error);
        return { error: 'Não foi possível atualizar a escola selecionada.' };
    }

    return { success: true };
}
