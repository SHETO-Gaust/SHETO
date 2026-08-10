import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { getPool } from '@/lib/db/pool';

/**
 * Registra por que um login foi recusado.
 *
 * O Auth.js emite um `CredentialsSignin` idêntico para toda recusa — nada
 * distingue "usuário não existe" de "senha errada" — e o auth-shim ainda
 * reescreve tudo como "Credenciais invalidas". Num incidente em produção isso
 * deixa cego quem investiga; foi exatamente o que aconteceu.
 *
 * O e-mail vai no log porque sem ele a linha não serve para nada: é preciso
 * saber DE QUEM é a falha. A senha nunca é registrada, nem seu tamanho.
 *
 * O `JSON.stringify` é proposital: as aspas revelam espaço em branco colado
 * pelo autofill do celular ("fulano@x.com "), que derruba o `lower(email) =`
 * sem deixar rastro visível.
 */
function recusar(motivo: string, email?: string): void {
  console.warn(`[auth] Login recusado (${motivo}): ${JSON.stringify(email ?? null)}`);
}

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
        if (!email || !password) {
          recusar('credenciais ausentes no formulário', email);
          return null;
        }

        const pool = getPool();
        const { rows } = await pool.query(
          'select id, email, encrypted_password from auth.users where lower(email) = lower($1) limit 1',
          [email]
        );
        const row = rows[0];

        if (!row) {
          recusar('nenhum usuário com este e-mail', email);
          return null;
        }
        if (!row.encrypted_password) {
          recusar('usuário existe mas está sem senha cadastrada', email);
          return null;
        }

        const ok = await bcrypt.compare(password, row.encrypted_password);
        if (!ok) {
          recusar('senha não confere com o hash', email);
          return null;
        }

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
