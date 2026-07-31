import { getPool } from '@/lib/db/pool';
import { createDbClient } from '@/lib/db/client';
import { createAuthShim } from '@/lib/db/auth-shim';

/**
 * Cliente para uso em Server Components / Server Actions.
 * Mantem a mesma interface do supabase-js (from/rpc/auth) mas roda contra
 * o Postgres local via node-postgres, sem depender do Supabase.
 */
export async function createClient() {
  const pool = getPool();
  return {
    ...createDbClient(pool),
    auth: createAuthShim(pool),
  };
}

/**
 * Antigamente usava a service role key para contornar RLS. No Postgres
 * local nao ha essa distincao de papel - a mesma conexao e usada aqui.
 * A autorizacao (quem pode ver/editar o que) e responsabilidade da
 * camada de aplicacao (ver Fase 4 da migracao).
 */
export async function createAdminClient() {
  return createClient();
}
