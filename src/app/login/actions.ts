
'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export async function signIn(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return redirect(`/login?error=${error.message}`);
  }

  // Verificar se o usuário está ativo no perfil
  const { data: profile } = await supabase
    .from('profiles')
    .select('active')
    .eq('id', data.user.id)
    .single();

  if (profile && profile.active === false) {
    await supabase.auth.signOut();
    return redirect('/login?error=Este usuário está desativado. Entre em contato com o administrador.');
  }

  return redirect('/dashboard');
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return redirect('/login');
};
