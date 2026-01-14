'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
      // The redirect in the server action will handle success, so we only need to handle the case where it throws an error.
      // We can let the server action handle redirects and error messages in the URL.
    } finally {
      // In many cases, a redirect will happen, so this might not be reached.
      setLoading(false);
    }
  };

  return (
    <Card className="mx-auto max-w-sm">
      <CardHeader className="text-center">
        <div className="mb-4 inline-flex justify-center">
          <Image
            src="/img/logogforms.png"
            alt="GForms Logo"
            width={200}
            height={50}
            className="h-auto"
          />
        </div>
        <CardTitle className="sr-only text-2xl font-bold font-headline">
          GForms
        </CardTitle>
        <CardDescription>
          Gerenciamento de Formações
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-center text-sm text-destructive">
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
              placeholder="seu@email.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password-signin">Senha</Label>
            <Input id="password-signin" name="password" type="password" required />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Entrar
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
