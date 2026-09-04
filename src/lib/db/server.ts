import { getPool } from '@/lib/db/pool';
import { createDbClient } from '@/lib/db/client';
import { createAuthShim } from '@/lib/db/auth-shim';

/**
 * Cliente para uso em Server Components / Server Actions.
 *
 * Fala com o Postgres direto, via node-postgres. A interface (from/rpc/auth) e'
 * a do PostgREST porque o app inteiro foi escrito contra ela: manter a forma foi
 * o que permitiu trocar o backend sem reescrever 45 modulos de acesso a dados.
 * Quem estranhar `.from('x').select('y')` aqui, o tradutor mora em src/lib/db/.
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
