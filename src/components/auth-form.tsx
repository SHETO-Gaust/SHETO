'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
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
      // Errors are handled by redirecting with a search param
    } finally {
      // This may not be reached if a redirect happens
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
        <div className="space-y-2">
          <Label htmlFor="email-signin">Email</Label>
          <Input
            id="email-signin"
            name="email"
            type="email"
            placeholder="admin@seduc.to.gov.br"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password-signin">Senha</Label>
          <Input id="password-signin" name="password" type="password" required placeholder="••••••••"/>
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Entrar
        </Button>
      </form>
    </div>
  );
}
