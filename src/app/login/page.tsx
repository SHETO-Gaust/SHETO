
import { AuthForm } from '@/components/auth-form';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect('/dashboard');
  }

  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-2">
      <div className="relative flex flex-col items-center justify-between py-10 px-8 overflow-hidden">
        <Image
          src="/img/elements/03.png"
          alt=""
          fill
          className="object-cover object-center pointer-events-none select-none"
          priority
        />

        <div className="relative z-10 flex justify-center w-full">
          <Image
            src="/img/elements/01.png"
            alt="Sistema de Horário Escolar do Tocantins"
            width={520}
            height={90}
            className="object-contain"
            priority
          />
        </div>

        <div className="relative z-10 w-full max-w-sm">
          <div className="bg-white rounded-3xl shadow-2xl px-8 py-10">
            <AuthForm />
          </div>
        </div>

        <div className="relative z-10 flex flex-col items-center gap-3">
          <Link href="/politica-de-privacidade" target="_blank" rel="noopener noreferrer" className="text-white/80 text-sm hover:text-white underline underline-offset-2">
            Política de Privacidade
          </Link>
          <Image
            src="/img/seduc.png"
            alt="SEDUC Tocantins"
            width={180}
            height={40}
            className="object-contain brightness-0 invert opacity-70"
          />
        </div>
      </div>

      <div className="relative hidden bg-muted md:block">
        <Image
          src="/img/ALFPC.png"
          alt="Fachada Escola"
          fill
          className="object-cover"
          data-ai-hint="school building"
        />
        <div className="absolute inset-0 bg-blue-950/60" />
<div className="absolute bottom-10 left-10 z-30 text-white bg-black/30 p-6 rounded-lg backdrop-blur-sm max-w-md">
          <h2 className="text-3xl font-bold">SHE - Sistema de Horário Escolar</h2>
          <p className="mt-2 text-white/90">
            Inovando a gestão educacional no Tocantins com tecnologia e inteligência.
          </p>
        </div>
      </div>
    </div>
  );
}
