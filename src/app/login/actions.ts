
'use server';

import { createClient } from '@/lib/db/server';
import { redirect } from 'next/navigation';

/**
 * Para onde ir depois do login. So caminho interno: `//site.com` e `/\site.com`
 * seriam lidos pelo navegador como outro dominio (open redirect).
 */
function destinoSeguro(valor: FormDataEntryValue | null): string {
  if (typeof valor !== 'string' || !valor.startsWith('/') || valor.startsWith('//') || valor.startsWith('/\\')) {
    return '/dashboard';
  }
  return valor;
}

export async function signIn(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const destino = destinoSeguro(formData.get('next'));
  const db = await createClient();

  const { data, error } = await db.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // Mantem o destino: quem chegou pelo link de um e-mail nao perde o caminho ao errar a senha.
    const next = destino === '/dashboard' ? '' : `&next=${encodeURIComponent(destino)}`;
    return redirect(`/login?error=${error.message}${next}`);
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

  return redirect(destino);
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
