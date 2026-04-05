
'use server';

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { Profile, Escola } from '@/lib/types';
import { z } from 'zod';
import { sendWelcomeEmail } from '@/lib/mail';

export async function getUsers(): Promise<Profile[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('profiles')
        .select('*, escolas(id, escolar)')
        .order('created_at', { ascending: false });

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

export async function toggleUserStatus(userId: string, currentStatus: boolean) {
    const supabase = await createClient();
    const { error } = await supabase
        .from('profiles')
        .update({ active: !currentStatus })
        .eq('id', userId);

    if (error) return { error: 'Erro ao alterar status do usuário.' };
    
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
        email_confirm: true,
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

    // Usar UPSERT para garantir que o perfil exista mesmo se o trigger falhar
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
        });

    if (profileError) {
        console.error('Error creating/updating profile:', profileError);
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        return { error: `Ocorreu um erro ao criar o perfil do usuário: ${profileError.message}` };
    }

    // Envio de email
    try {
        if (ue && ue !== 'null') {
            const { data: escola } = await supabaseAdmin
                .from('escolas')
                .select('*')
                .eq('id', ue)
                .single();

            if (escola) {
                await sendWelcomeEmail({
                    to: email,
                    name: name || 'Usuário(a)',
                    password: password,
                    schoolName: escola.escolar,
                    regional: escola.regional || 'Não informada',
                    city: escola.cidade || 'Não informada',
                    inep: escola.inep || 'N/A'
                });
            }
        } else if (role === 'admin') {
            await sendWelcomeEmail({
                to: email,
                name: name || 'Administrador(a)',
                password: password,
                schoolName: 'Administração Central',
                regional: 'Seduc Sede',
                city: 'Palmas',
                inep: 'Global'
            });
        }
    } catch (mailErr) {
        console.warn('Usuário criado mas erro ao enviar email:', mailErr);
    }

    revalidatePath('/usuarios');
    return { success: true };
}
