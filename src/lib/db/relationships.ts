import type { Pool } from 'pg';

export type Relationship = {
  /** tabela que possui a coluna de FK ("lado N" da relacao) */
  childTable: string;
  /** coluna de FK na tabela filha */
  childColumn: string;
  /** tabela referenciada (o "lado 1") */
  parentTable: string;
  /** coluna referenciada na tabela pai (normalmente "id") */
  parentColumn: string;
};

let cache: Relationship[] | null = null;
let pkCache: Map<string, string[]> | null = null;

async function loadPrimaryKeys(pool: Pool): Promise<Map<string, string[]>> {
  const { rows } = await pool.query(`
    select tc.table_name, kcu.column_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
    where tc.constraint_type = 'PRIMARY KEY' and tc.table_schema = 'public'
    order by tc.table_name, kcu.ordinal_position
  `);
  const map = new Map<string, string[]>();
  for (const r of rows) {
    const list = map.get(r.table_name) ?? [];
    list.push(r.column_name);
    map.set(r.table_name, list);
  }
  return map;
}

async function loadRelationships(pool: Pool): Promise<Relationship[]> {
  const { rows } = await pool.query(`
    select
      kcu.table_name as child_table,
      kcu.column_name as child_column,
      ccu.table_name as parent_table,
      ccu.column_name as parent_column
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
    join information_schema.constraint_column_usage ccu
      on tc.constraint_name = ccu.constraint_name and tc.table_schema = ccu.table_schema
    where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
  `);
  return rows.map((r) => ({
    childTable: r.child_table,
    childColumn: r.child_column,
    parentTable: r.parent_table,
    parentColumn: r.parent_column,
  }));
}

/**
 * Garante que os caches de relacionamento/PK estao carregados, usando o
 * MESMO pool passado pelo chamador (nunca cria um pool proprio - isso
 * causava conexao com credenciais erradas quando havia mais de um pool
 * na aplicacao).
 */
export async function preloadSchemaMetadata(pool: Pool): Promise<void> {
  if (!cache) cache = await loadRelationships(pool);
  if (!pkCache) pkCache = await loadPrimaryKeys(pool);
}

export function getPrimaryKeySync(table: string): string[] {
  if (!pkCache) throw new Error('preloadSchemaMetadata() precisa ser chamado antes de getPrimaryKeySync()');
  return pkCache.get(table) ?? ['id'];
}

export function resolveRelationshipSync(
  baseTable: string,
  embedTable: string
): { kind: 'belongs-to'; fkColumn: string; refColumn: string } | { kind: 'has-many'; fkColumn: string; refColumn: string } {
  if (!cache) throw new Error('preloadSchemaMetadata() precisa ser chamado antes de resolveRelationshipSync()');

  const belongsTo = cache.find((r) => r.childTable === baseTable && r.parentTable === embedTable);
  if (belongsTo) return { kind: 'belongs-to', fkColumn: belongsTo.childColumn, refColumn: belongsTo.parentColumn };

  const hasMany = cache.find((r) => r.childTable === embedTable && r.parentTable === baseTable);
  if (hasMany) return { kind: 'has-many', fkColumn: hasMany.childColumn, refColumn: hasMany.parentColumn };

  throw new Error(
    `Nao encontrei relacionamento de FK entre "${baseTable}" e "${embedTable}". Confira o nome da tabela no select embutido.`
  );
}
