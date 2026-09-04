
import { Suspense } from 'react';
import { AuthForm } from '@/components/auth-form';
import { AuthShell } from '@/components/auth-shell';
import { createClient } from '@/lib/db/server';
import { redirect } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default async function LoginPage() {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();

  if (user) {
    redirect('/dashboard');
  }

  return (
    <AuthShell>
      <Suspense
        fallback={
          <div className="flex h-[340px] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-sky-500" />
          </div>
        }
      >
        <AuthForm />
      </Suspense>
    </AuthShell>
  );
}
