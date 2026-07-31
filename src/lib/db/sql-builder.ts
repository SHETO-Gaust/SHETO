import { SelectField } from './select-parser';
import { resolveRelationshipSync } from './relationships';

export interface BuiltSelect {
  /** expressoes de coluna prontas para entrar no SELECT */
  columns: string[];
  /** condicoes EXISTS (de embeds !inner) para entrar no WHERE do nivel pai */
  existsConditions: string[];
}

interface AliasState {
  counter: number;
}

/**
 * Converte a AST de um select() estilo PostgREST em expressoes SQL,
 * usando subqueries correlacionadas (to_jsonb / jsonb_agg) para os embeds.
 * Isso reproduz o comportamento do PostgREST sem precisar de JOIN + flatten.
 */
export function buildSelectColumns(
  baseAlias: string,
  baseTable: string,
  fields: SelectField[],
  state: AliasState = { counter: 0 }
): BuiltSelect {
  const columns: string[] = [];
  const existsConditions: string[] = [];

  for (const f of fields) {
    if (f.kind === 'star') {
      columns.push(`"${baseAlias}".*`);
      continue;
    }
    if (f.kind === 'column') {
      columns.push(`"${baseAlias}"."${f.name}"`);
      continue;
    }

    // embed
    const rel = resolveRelationshipSync(baseTable, f.table);
    state.counter += 1;
    const innerAlias = `e${state.counter}`;
    const inner = buildSelectColumns(innerAlias, f.table, f.fields, state);

    const isCountOnly =
      f.fields.length === 1 && f.fields[0].kind === 'column' && f.fields[0].name === 'count';

    const joinCond =
      rel.kind === 'belongs-to'
        ? `"${innerAlias}"."${rel.refColumn}" = "${baseAlias}"."${rel.fkColumn}"`
        : `"${innerAlias}"."${rel.fkColumn}" = "${baseAlias}"."${rel.refColumn}"`;

    const innerWhere = [joinCond, ...inner.existsConditions].join(' AND ');

    let expr: string;
    if (isCountOnly) {
      expr = `(SELECT jsonb_build_object('count', count(*)) FROM "${f.table}" AS "${innerAlias}" WHERE ${innerWhere})`;
    } else if (rel.kind === 'belongs-to') {
      expr =
        `(SELECT to_jsonb("x") FROM (SELECT ${inner.columns.join(', ')} ` +
        `FROM "${f.table}" AS "${innerAlias}" WHERE ${innerWhere}) "x")`;
    } else {
      expr =
        `(SELECT coalesce(jsonb_agg(to_jsonb("x")), '[]'::jsonb) FROM (SELECT ${inner.columns.join(', ')} ` +
        `FROM "${f.table}" AS "${innerAlias}" WHERE ${innerWhere}) "x")`;
    }

    columns.push(`${expr} AS "${f.alias}"`);

    if (f.inner) {
      existsConditions.push(`EXISTS (SELECT 1 FROM "${f.table}" AS "${innerAlias}" WHERE ${innerWhere})`);
    }
  }

  return { columns, existsConditions };
}
