'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Mail, Lock } from 'lucide-react';
import { signIn } from '@/app/login/actions';
import { useSearchParams } from 'next/navigation';

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
        <Button
          type="submit"
          className="w-full h-12 rounded-full bg-sky-500 hover:bg-sky-600 text-white font-semibold text-base"
          disabled={loading}
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Entrar
        </Button>
      </form>
    </div>
  );
}
