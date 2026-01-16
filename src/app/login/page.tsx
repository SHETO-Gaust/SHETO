import { AuthForm } from '@/components/auth-form';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function LoginPage() {
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    redirect('/dashboard');
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex flex-1 flex-col items-center justify-center p-4">
        <div className="w-full max-w-md">
          <AuthForm />
        </div>
      </main>
      <footer className="border-t p-4 text-center text-xs text-muted-foreground">
        Desenvolvido pela Gerência de Apoio ao Usuário e Suporte Técnico da Seduc Tocantins - Todos os direitos reservados © 2026
      </footer>
    </div>
  );
}
