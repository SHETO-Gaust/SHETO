'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Mail, ArrowLeft, MailCheck } from 'lucide-react';
import { solicitarRedefinicaoSenha } from './actions';

export function ForgotPasswordForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const resultado = await solicitarRedefinicaoSenha(formData);

    if ('error' in resultado) {
      setError(resultado.error);
    } else {
      setEnviado(resultado.message);
    }
    setLoading(false);
  };

  if (enviado) {
    return (
      <div className="grid gap-6 text-center">
        <div className="mx-auto h-14 w-14 rounded-full bg-sky-100 flex items-center justify-center">
          <MailCheck className="h-7 w-7 text-sky-600" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-bold text-gray-800">Verifique seu e-mail</h1>
          <p className="text-sm text-gray-500 leading-relaxed">{enviado}</p>
        </div>
        <Link
          href="/login"
          className="inline-flex items-center justify-center gap-2 text-sm text-sky-600 hover:text-sky-700 hover:underline underline-offset-2"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar para o login
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="space-y-2 text-center">
        <h1 className="text-xl font-bold text-gray-800">Esqueceu sua senha?</h1>
        <p className="text-sm text-gray-500 leading-relaxed">
          Informe o e-mail cadastrado e enviaremos um link para você criar uma nova senha.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-center text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <Input
            id="email-reset"
            name="email"
            type="email"
            placeholder="E-mail cadastrado"
            required
            autoComplete="email"
            className="pl-10 bg-gray-100 border-0 rounded-xl h-12 text-gray-700 placeholder:text-gray-400 focus-visible:ring-sky-400"
          />
        </div>
        <Button
          type="submit"
          className="w-full h-12 rounded-full bg-sky-500 hover:bg-sky-600 text-white font-semibold text-base"
          disabled={loading}
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Enviar link de recuperação
        </Button>
      </form>

      <Link
        href="/login"
        className="inline-flex items-center justify-center gap-2 text-sm text-sky-600 hover:text-sky-700 hover:underline underline-offset-2"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para o login
      </Link>
    </div>
  );
}
