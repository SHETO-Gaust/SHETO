
'use server';

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { Profile, Escola } from '@/lib/types';
import { z } from 'zod';
import { sendWelcomeEmail } from '@/lib/mail';

export async function getUsers(): Promise<Profile[]> {
    const supabaseAdmin = await createAdminClient();

    // Usamos o Admin Client para ver todos os perfis ignorando RLS de usuário comum
    const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('*, escolas(id, escolar)')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching users:', error);
        return [];
    }

    return (data || []) as Profile[];
}

export async function updateUserPermissions(userId: string, modules: string[], role: 'admin' | 'user', ue: string | null | undefined) {
    const supabaseAdmin = await createAdminClient();

    const { error } = await supabaseAdmin
        .from('profiles')
        .update({ 
            modules, 
            role, 
            ue: role === 'admin' ? null : (ue === 'null' ? null : ue) 
        })
        .eq('id', userId);

    if (error) {
        console.error('Error updating user permissions:', error);
        return { error: 'Ocorreu um erro ao atualizar as permissões do usuário.' };
    }

    revalidatePath('/usuarios');
    return { success: true };
}

export async function toggleUserStatus(userId: string, currentStatus: boolean) {
    const supabaseAdmin = await createAdminClient();
    const { error } = await supabaseAdmin
        .from('profiles')
        .update({ active: !currentStatus })
        .eq('id', userId);

    if (error) {
        console.error('Error toggling status:', error);
        return { error: 'Erro ao alterar status do usuário.' };
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

    // 1. Criar no Authentication
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true,
        user_metadata: { name: name }
    });

    if (authError) {
        console.error('Error creating auth user:', authError);
        if (authError.message.includes('already registered')) {
            return { error: 'Um usuário com este email já existe.' };
        }
        return { error: `Erro no Auth: ${authError.message}` };
    }
    
    if (!authData.user) {
        return { error: 'Não foi possível criar o usuário no Auth.' };
    }

    // 2. Criar explicitamente na tabela Profiles para garantir que ele apareça na lista
    const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .upsert({
            id: authData.user.id,
            name: name,
            role: role,
            modules: modules,
            email: email,
            ue: ue === 'null' ? null : ue,
            active: true,
        }, { onConflict: 'id' });

    if (profileError) {
        console.error('Error explicitly creating profile:', profileError);
        // Reportamos o erro mas não cancelamos pois o usuário no Auth já existe
    }

    // 3. Envio de email
    try {
        let schoolData = { escolar: 'Administração Central', regional: 'Seduc Sede', cidade: 'Palmas', inep: 'Global' };
        
        if (ue && ue !== 'null') {
            const { data: escola } = await supabaseAdmin
                .from('escolas')
                .select('*')
                .eq('id', ue)
                .maybeSingle();
            if (escola) schoolData = escola;
        }

        await sendWelcomeEmail({
            to: email,
            name: name || 'Usuário(a)',
            password: password,
            schoolName: schoolData.escolar,
            regional: schoolData.regional || 'Não informada',
            city: schoolData.cidade || 'Não informada',
            inep: schoolData.inep || 'N/A'
        });
    } catch (mailErr) {
        console.warn('Erro ao enviar email:', mailErr);
    }

    revalidatePath('/usuarios');
    return { success: true };
}
