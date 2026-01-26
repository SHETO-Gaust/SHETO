'use server';

import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { z } from 'zod';

export const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Senha atual é obrigatória.'),
  newPassword: z.string().min(6, 'A nova senha deve ter no mínimo 6 caracteres.'),
  confirmPassword: z.string().min(6, 'A confirmação da nova senha deve ter no mínimo 6 caracteres.'),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: 'As novas senhas não correspondem.',
  path: ['confirmPassword'],
});

export async function updatePassword(formData: z.infer<typeof updatePasswordSchema>) {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

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
