import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { AuthShell } from '@/components/auth-shell';
import { validarToken } from '@/lib/auth/password-reset';
import { ResetPasswordForm } from './reset-password-form';

export const metadata: Metadata = {
  title: 'Criar nova senha - SHE',
};

const MENSAGENS = {
  invalido: 'Este link de redefinição não é válido. Verifique se você copiou o endereço completo do e-mail.',
  expirado: 'Este link expirou. Por segurança, os links de redefinição valem por tempo limitado.',
  usado: 'Este link já foi utilizado. Se você não redefiniu sua senha, solicite um novo link.',
} as const;

export default async function RedefinirSenhaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const resultado = await validarToken(token);

  if (!resultado.valido) {
    return (
      <AuthShell>
        <div className="grid gap-6 text-center">
          <div className="mx-auto h-14 w-14 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="h-7 w-7 text-destructive" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-gray-800">Link indisponível</h1>
            <p className="text-sm text-gray-500 leading-relaxed">{MENSAGENS[resultado.motivo]}</p>
          </div>
          <Link
            href="/esqueci-senha"
            className="inline-flex h-12 items-center justify-center rounded-full bg-sky-500 px-6 font-semibold text-white hover:bg-sky-600"
          >
            Solicitar novo link
          </Link>
          <Link
            href="/login"
            className="text-sm text-sky-600 hover:text-sky-700 hover:underline underline-offset-2"
          >
            Voltar para o login
          </Link>
        </div>
      </AuthShell>
    );
  }

  const nome = resultado.usuario.nome || resultado.usuario.email.split('@')[0];

  return (
    <AuthShell>
      <ResetPasswordForm token={token} nome={nome} />
    </AuthShell>
  );
}
