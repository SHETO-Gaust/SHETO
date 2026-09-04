
import { createClient } from '@/lib/db/server';
import { redirect } from 'next/navigation';

export default async function Home() {
  const db = await createClient();

  const {
    data: { user },
  } = await db.auth.getUser();

  if (user) {
    redirect('/dashboard');
  } else {
    redirect('/login');
  }
}
