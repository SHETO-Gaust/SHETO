import { Pool, type PoolConfig } from 'pg';

declare global {
  // eslint-disable-next-line no-var
  var __shetoPgPool: Pool | undefined;
}

/**
 * Sem estes limites o pool espera para sempre. Uma consulta pendurada segura
 * a requisição indefinidamente e, com o `max` esgotado, todas as seguintes
 * ficam na fila — o sintoma é "o sistema caiu", e só o restart resolve.
 * Falhar com erro visível é melhor do que pendurar em silêncio.
 */
const TIMEOUTS: PoolConfig = {
  /** Espera por uma conexão livre do pool. Default do pg: 0 = infinito. */
  connectionTimeoutMillis: Number(process.env.PG_CONNECTION_TIMEOUT_MS) || 10_000,

  /** Aborta a consulta no servidor. Nenhuma consulta legítima desta app chega perto disso. */
  statement_timeout: Number(process.env.PG_STATEMENT_TIMEOUT_MS) || 30_000,

  /** Rede de segurança do lado do cliente, caso o servidor não responda. */
  query_timeout: Number(process.env.PG_QUERY_TIMEOUT_MS) || 35_000,

  /** Devolve conexões ociosas ao sistema operacional. */
  idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS) || 30_000,

  max: Number(process.env.PG_POOL_MAX) || 10,
};

/**
 * Pool singleton para o Postgres local. Le PGHOST/PGPORT/PGUSER/PGPASSWORD/
 * PGDATABASE do ambiente (convencao nativa do node-postgres) ou DATABASE_URL
 * se definida.
 */
export function getPool(): Pool {
  if (!global.__shetoPgPool) {
    const pool = process.env.DATABASE_URL
      ? new Pool({ ...TIMEOUTS, connectionString: process.env.DATABASE_URL })
      : new Pool(TIMEOUTS);

    /**
     * OBRIGATÓRIO, não é zelo extra: o Pool emite 'error' quando uma conexão
     * ociosa morre (Postgres reiniciado, rede caindo, idle_session_timeout do
     * servidor). Um evento 'error' sem listener num EventEmitter derruba o
     * processo Node inteiro. Aqui ele vira log — o pg já descarta a conexão
     * ruim e cria outra sozinho.
     */
    pool.on('error', (err) => {
      console.error('[pg] Erro em conexão ociosa do pool (a conexão foi descartada):', err.message);
    });

    global.__shetoPgPool = pool;
  }
  return global.__shetoPgPool;
}
