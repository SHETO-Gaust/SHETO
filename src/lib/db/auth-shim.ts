import type { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { auth as getNextAuthSession, signIn as nextAuthSignIn, signOut as nextAuthSignOut } from '@/lib/auth';

export type AuthUser = { id: string; email: string; user_metadata?: Record<string, any> };
type AuthResult<T> = { data: T; error: { message: string } | null };

/**
 * O Next sinaliza bailout de render estatico, redirect e notFound lancando
 * erros marcados com `digest`. Engolir esses erros num catch generico faz a
 * pagina seguir o render como "sem usuario" em vez de virar dinamica - era
 * isso que quebrava o build com "Nao autenticado." durante o prerender.
 */
function repassarErroDeControleDoNext(err: unknown): void {
  if (typeof (err as { digest?: unknown } | null)?.digest === 'string') throw err;
}

/** Wrapper de auth compativel com a interface supabase.auth.* usada no restante do app, com NextAuth por baixo. */
export function createAuthShim(pool: Pool) {
  return {
    async getUser(): Promise<AuthResult<{ user: AuthUser | null }>> {
      try {
        const session = await getNextAuthSession();
        const user = session?.user?.id
          ? { id: session.user.id as string, email: session.user.email ?? '' }
          : null;
        return { data: { user }, error: null };
      } catch (err: any) {
        repassarErroDeControleDoNext(err);
        return { data: { user: null }, error: { message: err?.message ?? String(err) } };
      }
    },

    async getSession(): Promise<AuthResult<{ session: { user: AuthUser } | null }>> {
      try {
        const session = await getNextAuthSession();
        const shaped = session?.user?.id
          ? { user: { id: session.user.id as string, email: session.user.email ?? '' } }
          : null;
        return { data: { session: shaped }, error: null };
      } catch (err: any) {
        repassarErroDeControleDoNext(err);
        return { data: { session: null }, error: { message: err?.message ?? String(err) } };
      }
    },

    async signInWithPassword({
      email,
      password,
    }: {
      email: string;
      password: string;
    }): Promise<{ data: { user: AuthUser }; error: null } | { data: { user: null }; error: { message: string } }> {
      try {
        await nextAuthSignIn('credentials', { email, password, redirect: false });
        const { rows } = await pool.query('select id, email from auth.users where lower(email) = lower($1) limit 1', [email]);
        const row = rows[0];
        if (!row) return { data: { user: null }, error: { message: 'Credenciais invalidas' } };
        return { data: { user: { id: row.id, email: row.email } }, error: null };
      } catch (err: any) {
        return { data: { user: null }, error: { message: 'Credenciais invalidas' } };
      }
    },

    async signOut(): Promise<{ error: null }> {
      await nextAuthSignOut({ redirect: false });
      return { error: null };
    },

    async updateUser({ password }: { password: string }): Promise<AuthResult<{ user: AuthUser | null }>> {
      try {
        const session = await getNextAuthSession();
        const userId = session?.user?.id;
        if (!userId) return { data: { user: null }, error: { message: 'Nao autenticado' } };

        const hash = await bcrypt.hash(password, 10);
        const { rows } = await pool.query(
          'update auth.users set encrypted_password = $1, updated_at = now() where id = $2 returning id, email',
          [hash, userId]
        );
        const row = rows[0];
        return { data: { user: row ? { id: row.id, email: row.email } : null }, error: null };
      } catch (err: any) {
        repassarErroDeControleDoNext(err);
        return { data: { user: null }, error: { message: err?.message ?? String(err) } };
      }
    },

    /** Mantido apenas por compatibilidade de interface - nao ha fluxo de magic-link/OAuth nesta aplicacao. */
    async exchangeCodeForSession(_code: string): Promise<AuthResult<null>> {
      return { data: null, error: { message: 'exchangeCodeForSession nao e suportado (sem fluxo OAuth/magic-link nesta app)' } };
    },

    admin: {
      async createUser({
        email,
        password,
        email_confirm,
        user_metadata,
      }: {
        email: string;
        password: string;
        email_confirm?: boolean;
        user_metadata?: Record<string, unknown>;
      }): Promise<AuthResult<{ user: AuthUser | null }>> {
        try {
          const existing = await pool.query('select id from auth.users where lower(email) = lower($1) limit 1', [email]);
          if (existing.rows.length > 0) {
            return { data: { user: null }, error: { message: 'Um usuário com este email já existe.' } };
          }

          const hash = await bcrypt.hash(password, 10);
          const id = randomUUID();
          const { rows } = await pool.query(
            `insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, aud, role, created_at, updated_at)
             values ($1, $2, $3, $4, $5, 'authenticated', 'authenticated', now(), now())
             returning id, email`,
            [id, email, hash, email_confirm ? new Date() : null, JSON.stringify(user_metadata ?? {})]
          );
          const row = rows[0];
          return { data: { user: { id: row.id, email: row.email, user_metadata } }, error: null };
        } catch (err: any) {
          return { data: { user: null }, error: { message: err?.message ?? String(err) } };
        }
      },
    },
  };
}
