'use server';

import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import type { Profile } from '@/lib/types';

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
