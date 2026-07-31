import { Pool } from 'pg';

declare global {
  // eslint-disable-next-line no-var
  var __shetoPgPool: Pool | undefined;
}

/**
 * Pool singleton para o Postgres local. Le PGHOST/PGPORT/PGUSER/PGPASSWORD/
 * PGDATABASE do ambiente (convencao nativa do node-postgres) ou DATABASE_URL
 * se definida.
 */
export function getPool(): Pool {
  if (!global.__shetoPgPool) {
    global.__shetoPgPool = process.env.DATABASE_URL
      ? new Pool({ connectionString: process.env.DATABASE_URL })
      : new Pool();
  }
  return global.__shetoPgPool;
}
