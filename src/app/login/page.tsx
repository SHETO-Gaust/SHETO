import { AuthForm } from '@/components/auth-form';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Image from 'next/image';
import { Clock } from 'lucide-react';

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    redirect('/dashboard');
  }

  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-2">
      <div className="flex flex-col items-center justify-center p-8 bg-background">
        <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
          <div className="flex flex-col space-y-2 text-center">
             <div className="flex items-center justify-center gap-2 text-2xl font-bold">
                <Clock className="h-6 w-6 text-primary" />
                <h1 className="font-bold">SHE</h1>
            </div>
            <p className="text-muted-foreground">
              Entre com seu email para acessar o Sistema de Horário Escolar.
            </p>
          </div>
          <AuthForm />
        </div>
      </div>
      <div className="relative hidden bg-muted md:block">
        <Image
          src="/img/estudantes.jpeg"
          alt="Estudantes estudando"
          fill
          className="object-cover"
          data-ai-hint="students studying"
        />
        <div className="absolute inset-0 bg-blue-950/60" />
        <div className="absolute bottom-10 left-10 text-white bg-black/30 p-6 rounded-lg backdrop-blur-sm max-w-md">
          <h2 className="text-3xl font-bold">SHE - Sistema de Horário Escolar</h2>
          <p className="mt-2 text-white/90">
            Inovando a gestão educacional no Tocantins com tecnologia e inteligência.
          </p>
        </div>
      </div>
    </div>
  );
}
