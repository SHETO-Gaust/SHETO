'use server';

import { createClient } from '@/lib/db/server';
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
    const db = await createClient();

    const validatedFields = updatePasswordSchema.safeParse(formData);

    if (!validatedFields.success) {
        return {
            error: 'Dados inválidos. Verifique o formulário.',
            errors: validatedFields.error.flatten().fieldErrors,
        };
    }
    
    const { currentPassword, newPassword } = validatedFields.data;

    const { data: { user } } = await db.auth.getUser();

    if (!user || !user.email) {
        return { error: 'Usuário não encontrado ou não autenticado.' };
    }

    // Step 1: Verify current password by trying to sign in with it.
    const { error: signInError } = await db.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
    });

    if (signInError) {
        console.error('Error verifying current password:', signInError);
        return { error: 'A senha atual está incorreta.' };
    }

    // Step 2: If verification is successful, update the password.
    const { error: updateError } = await db.auth.updateUser({
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
    const db = await createClient();

    // Usuario comum so pode selecionar a escola a qual esta vinculado;
    // admin pode alternar entre qualquer escola.
    if (perfil.role !== 'admin' && schoolId !== null && String(perfil.ue ?? '') !== String(schoolId)) {
        return { error: 'Você não tem acesso a esta unidade escolar.' };
    }

    const { error } = await db
        .from('profiles')
        .update({ ue: schoolId })
        .eq('id', perfil.id);

    if (error) {
        console.error('Error updating selected school:', error);
        return { error: 'Não foi possível atualizar a escola selecionada.' };
    }

    return { success: true };
}

/**
 * Marca um tutorial de tela como ja apresentado ao usuario da sessao.
 *
 * Chamada no instante em que o tutorial abre, e nao no ultimo passo: cada tela
 * se apresenta uma unica vez por usuario, e dali em diante tanto faz se a pessoa
 * concluiu, pulou ou fechou. O botao de interrogacao continua disponivel para
 * quem quiser rever.
 */
export async function marcarTutorialVisto(tutorialId: string) {
    // Igual a updateSelectedSchool: a sessao e a fonte de verdade, nunca um id
    // vindo do cliente, para ninguem marcar tutorial no perfil de outra pessoa.
    const perfil = await requireAuth();
    const db = await createClient();

    const vistos = perfil.tutoriais_vistos ?? [];
    if (vistos.includes(tutorialId)) return { success: true };

    const { error } = await db
        .from('profiles')
        .update({ tutoriais_vistos: [...vistos, tutorialId] })
        .eq('id', perfil.id);

    if (error) {
        console.error('Error marking tutorial as seen:', error);
        return { error: 'Não foi possível registrar o tutorial como visto.' };
    }

    return { success: true };
}
