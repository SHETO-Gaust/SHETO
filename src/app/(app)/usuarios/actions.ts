'use server';

import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import type { Profile } from '@/lib/types';
import { z } from 'zod';

export async function getUsers(): Promise<Profile[]> {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('name', { ascending: true });

    if (error) {
        console.error('Error fetching users:', error);
        return [];
    }

    return data;
}

export async function updateUserPermissions(userId: string, modules: string[], role: 'admin' | 'user') {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    const { error } = await supabase
        .from('profiles')
        .update({ modules, role })
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
});

export async function createUser(formData: z.infer<typeof createUserSchema>) {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    const validatedFields = createUserSchema.safeParse(formData);

    if (!validatedFields.success) {
        return {
            error: 'Dados inválidos.',
            errors: validatedFields.error.flatten().fieldErrors,
        };
    }
    
    const { email, password, name, role, modules } = validatedFields.data;

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
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

    const { error: profileError } = await supabase
        .from('profiles')
        .insert({
            id: authData.user.id,
            email: email,
            name: name,
            role: role,
            modules: modules,
        });

    if (profileError) {
        console.error('Error creating profile:', profileError);
        // Desfaz a criação do usuário na autenticação para evitar usuários órfãos
        await supabase.auth.admin.deleteUser(authData.user.id);
        return { error: `Ocorreu um erro ao criar o perfil do usuário: ${profileError.message}` };
    }

    revalidatePath('/usuarios');
    return { success: true };
}
