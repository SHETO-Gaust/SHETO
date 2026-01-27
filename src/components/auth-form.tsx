'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
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
import { Loader2, GraduationCap, CheckCircle, Star } from 'lucide-react';
import { signIn } from '@/app/login/actions';
import { useSearchParams } from 'next/navigation';
import { Separator } from './ui/separator';

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
            priority
          />
        </div>
        <CardTitle className="text-2xl font-bold font-headline">
          GForms 2.0
        </CardTitle>
        <CardDescription>
          Sistema de Gerenciamento de Formações
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
              placeholder="seu-email@seduc.to.gov.br"
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

        <Separator className="my-6" />

        <div className="space-y-3">
          <p className="text-center text-sm font-medium text-muted-foreground">
              Acesso Rápido
          </p>
          <div className="flex flex-col gap-2">
              <Button variant="outline" className="w-full" asChild>
                <Link href="/inscricoes">
                    <GraduationCap className="mr-2 h-4 w-4" />
                    Inscrições em Aberto 
                </Link>
              </Button>
              <Button variant="outline" className="w-full" asChild>
                <Link href="/frequencia">
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Registrar Frequência
                </Link>
              </Button>
              <Button variant="outline" className="w-full" asChild>
                <Link href="/avaliacoes">
                    <Star className="mr-2 h-4 w-4" />
                    Avaliar Formação
                </Link>
              </Button>
          </div>
        </div>

      </CardContent>
    </Card>
  );
}
