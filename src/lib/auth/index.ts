import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { getPool } from '@/lib/db/pool';

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  /**
   * Fora da Vercel o Auth.js nao confia no cabecalho Host por padrao (defesa
   * contra host header injection) e derruba o login com UntrustedHost. Aqui a
   * aplicacao roda atras do proxy da SEDUC, entao o host precisa ser aceito.
   * Defina AUTH_URL no .env para fixar a URL canonica - o proxy e' quem deve
   * garantir que o Host chegue correto.
   */
  trustHost: true,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (credentials) => {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const pool = getPool();
        const { rows } = await pool.query(
          'select id, email, encrypted_password from auth.users where lower(email) = lower($1) limit 1',
          [email]
        );
        const row = rows[0];
        if (!row || !row.encrypted_password) return null;

        const ok = await bcrypt.compare(password, row.encrypted_password);
        if (!ok) return null;

        return { id: row.id, email: row.email };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.id = (user as { id: string }).id;
      return token;
    },
    session({ session, token }) {
      if (session.user) (session.user as { id?: string }).id = token.id as string;
      return session;
    },
  },
});
