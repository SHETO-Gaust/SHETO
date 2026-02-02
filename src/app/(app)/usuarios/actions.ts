'use server';

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { Profile } from '@/lib/types';
import { z } from 'zod';

export async function getUsers(): Promise<Profile[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('profiles')
        .select('*, escolas(id, escolar)')
        .order('name', { ascending: true });

    if (error) {
        console.error('Error fetching users:', error);
        return [];
    }

    return data as Profile[];
}

export async function updateUserPermissions(userId: string, modules: string[], role: 'admin' | 'user', ue: string | null | undefined) {
    const supabase = await createClient();

    const { error } = await supabase
        .from('profiles')
        .update({ modules, role, ue: role === 'admin' ? null : ue })
        .eq('id', userId);

    if (error) {
        console.error('Error updating user permissions:', error);
        return { error: 'Ocorreu um erro ao atualizar as permissões do usuário.' };
    }

    revalidatePath('/usuarios');
    return { success: true };
}


const createUserSchema = z.object({
  name: z.string().optional(),
  email: z.string().email({ message: "Email inválido." }),
  password: z.string().min(6, { message: "A senha deve ter no mínimo 6 caracteres." }),
  role: z.enum(['admin', 'user']),
  modules: z.array(z.string()),
  ue: z.string().nullable().optional(),
});

export async function createUser(formData: z.infer<typeof createUserSchema>) {
    const supabaseAdmin = await createAdminClient();

    const validatedFields = createUserSchema.safeParse(formData);

    if (!validatedFields.success) {
        return {
            error: 'Dados inválidos.',
            errors: validatedFields.error.flatten().fieldErrors,
        };
    }
    
    const { email, password, name, role, modules, ue } = validatedFields.data;

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true, // Auto-confirma o usuário
        user_metadata: { name: name }
    });

    if (authError) {
        console.error('Error creating auth user:', authError);
        if (authError.message.includes('User already registered')) {
            return { error: 'Um usuário com este email já existe.' };
        }
        return { error: `Ocorreu um erro ao criar o usuário: ${authError.message}` };
    }
    
    if (!authData.user) {
        return { error: 'Não foi possível criar o usuário, tente novamente.' };
    }

    // UPDATE a profile ao invés de INSERT, pois um trigger no Supabase já deve ter criado um.
    const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update({
            name: name,
            role: role,
            modules: modules,
            email: email, // Garante que o email esteja na tabela de perfis também
            ue: ue,
        })
        .eq('id', authData.user.id);

    if (profileError) {
        console.error('Error updating profile:', profileError);
        // Desfaz a criação do usuário na autenticação para evitar usuários órfãos
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        return { error: `Ocorreu um erro ao criar o perfil do usuário: ${profileError.message}` };
    }

    revalidatePath('/usuarios');
    return { success: true };
}
