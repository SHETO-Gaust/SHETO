import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth-shell';
import { ForgotPasswordForm } from './forgot-password-form';

export const metadata: Metadata = {
  title: 'Esqueci minha senha - SHE',
};

export default function EsqueciSenhaPage() {
  return (
    <AuthShell>
      <ForgotPasswordForm />
    </AuthShell>
  );
}
