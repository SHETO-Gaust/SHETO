'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Mail, Lock, CalendarDays } from 'lucide-react';
import { signIn } from '@/app/login/actions';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

export function AuthForm() {
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    const formData = new FormData(event.currentTarget);
    try {
      await signIn(formData);
    } catch (e) {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-6">
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-center text-sm text-destructive">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <Input
            id="email-signin"
            name="email"
            type="email"
            placeholder="Usuário"
            required
            className="pl-10 bg-gray-100 border-0 rounded-xl h-12 text-gray-700 placeholder:text-gray-400 focus-visible:ring-sky-400"
          />
        </div>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <Input
            id="password-signin"
            name="password"
            type="password"
            required
            placeholder="Senha"
            className="pl-10 bg-gray-100 border-0 rounded-xl h-12 text-gray-700 placeholder:text-gray-400 focus-visible:ring-sky-400"
          />
        </div>
        <div className="flex justify-end">
          <Link
            href="/esqueci-senha"
            className="text-sm text-sky-600 hover:text-sky-700 hover:underline underline-offset-2"
          >
            Esqueci minha senha
          </Link>
        </div>
        <Button
          type="submit"
          className="w-full h-12 rounded-full bg-sky-500 hover:bg-sky-600 text-white font-semibold text-base"
          disabled={loading}
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Entrar
        </Button>
      </form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <span className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-white px-3 text-xs uppercase tracking-wider text-gray-400">ou</span>
        </div>
      </div>

      <Button
        asChild
        variant="outline"
        className="w-full h-12 rounded-full border-sky-500 bg-white text-sky-600 font-semibold text-base hover:bg-sky-50 hover:text-sky-700"
      >
        <Link href="/horarios">
          <CalendarDays className="h-4 w-4" />
          Acessar horários
        </Link>
      </Button>
    </div>
  );
}
