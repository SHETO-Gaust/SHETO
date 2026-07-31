import type { Pool } from 'pg';
import { QueryBuilder } from './query-builder';
import { callRpc } from './query-builder';

/** Cliente de dados compativel com a interface usada pelo restante do app (from/rpc). O namespace `auth` e' adicionado por cima em src/lib/supabase/*.ts */
export function createDbClient(pool: Pool) {
  return {
    from(table: string) {
      return new QueryBuilder(pool, table);
    },
    rpc(fnName: string, params: Record<string, unknown> = {}) {
      return callRpc(pool, fnName, params);
    },
  };
}
