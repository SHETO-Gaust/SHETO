'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Lock, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { redefinirSenha } from '@/app/esqueci-senha/actions';
import { SENHA_MINIMA } from '@/lib/auth/password-rules';

export function ResetPasswordForm({ token, nome }: { token: string; nome: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [concluido, setConcluido] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const resultado = await redefinirSenha(token, formData);

    if ('error' in resultado) {
      setError(resultado.error);
      setLoading(false);
      return;
    }

    setConcluido(true);
    setLoading(false);
    // Dá tempo de ler a confirmação antes de mandar para o login.
    setTimeout(() => router.push('/login'), 3000);
  };

  if (concluido) {
    return (
      <div className="grid gap-6 text-center">
        <div className="mx-auto h-14 w-14 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle2 className="h-7 w-7 text-green-600" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-bold text-gray-800">Senha redefinida!</h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            Sua nova senha já está valendo. Redirecionando para a tela de login...
          </p>
        </div>
        <Link
          href="/login"
          className="text-sm text-sky-600 hover:text-sky-700 hover:underline underline-offset-2"
        >
          Ir agora para o login
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="space-y-2 text-center">
        <h1 className="text-xl font-bold text-gray-800">Criar nova senha</h1>
        <p className="text-sm text-gray-500 leading-relaxed">
          Olá, <strong className="text-gray-700">{nome}</strong>. Defina abaixo a senha que você
          usará para acessar o SHE.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-center text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <Input
            id="new-password"
            name="password"
            type={mostrarSenha ? 'text' : 'password'}
            placeholder="Nova senha"
            required
            minLength={SENHA_MINIMA}
            autoComplete="new-password"
            className="pl-10 pr-10 bg-gray-100 border-0 rounded-xl h-12 text-gray-700 placeholder:text-gray-400 focus-visible:ring-sky-400"
          />
          <button
            type="button"
            onClick={() => setMostrarSenha((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
          >
            {mostrarSenha ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>

        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <Input
            id="confirm-password"
            name="confirmPassword"
            type={mostrarSenha ? 'text' : 'password'}
            placeholder="Confirme a nova senha"
            required
            minLength={SENHA_MINIMA}
            autoComplete="new-password"
            className="pl-10 bg-gray-100 border-0 rounded-xl h-12 text-gray-700 placeholder:text-gray-400 focus-visible:ring-sky-400"
          />
        </div>

        <p className="text-xs text-gray-400 px-1">
          Mínimo de {SENHA_MINIMA} caracteres.
        </p>

        <Button
          type="submit"
          className="w-full h-12 rounded-full bg-sky-500 hover:bg-sky-600 text-white font-semibold text-base"
          disabled={loading}
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar nova senha
        </Button>
      </form>
    </div>
  );
}
