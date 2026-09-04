
'use server';

import { createClient } from '@/lib/db/server';
import { redirect } from 'next/navigation';

export async function signIn(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const db = await createClient();

  const { data, error } = await db.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return redirect(`/login?error=${error.message}`);
  }

  // Verificar se o usuário está ativo no perfil
  const { data: profile } = await db
    .from('profiles')
    .select('active')
    .eq('id', data.user.id)
    .single();

  if (profile && profile.active === false) {
    await db.auth.signOut();
    return redirect('/login?error=Este usuário está desativado. Entre em contato com o administrador.');
  }

  return redirect('/dashboard');
}

export async function signInGetResult(formData: FormData): Promise<{ url: string }> {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const db = await createClient();

  const { data, error } = await db.auth.signInWithPassword({ email, password });

  if (error) {
    return { url: `/login?error=${encodeURIComponent(error.message)}` };
  }

  const { data: profile } = await db
    .from('profiles')
    .select('active')
    .eq('id', data.user.id)
    .single();

  if (profile && profile.active === false) {
    await db.auth.signOut();
    return { url: `/login?error=${encodeURIComponent('Este usuário está desativado. Entre em contato com o administrador.')}` };
  }

  return { url: '/dashboard' };
}

export async function signOut() {
  const db = await createClient();
  await db.auth.signOut();
  return redirect('/login');
};
