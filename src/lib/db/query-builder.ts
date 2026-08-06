import type { Pool } from 'pg';
import { parseSelect, type SelectField } from './select-parser';
import { buildSelectColumns } from './sql-builder';
import { preloadSchemaMetadata, getPrimaryKeySync, resolveRelationshipSync, getColumnTypeSync } from './relationships';

type FilterOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'is';

type PgResult<TData> = { data: TData | null; error: { message: string; code?: string } | null; count?: number | null };

const BASE_ALIAS = 't0';

function renderIsValue(val: unknown): string {
  if (val === null || val === 'null') return 'NULL';
  if (val === true || val === 'true') return 'TRUE';
  if (val === false || val === 'false') return 'FALSE';
  throw new Error(`.is() so aceita null/true/false, recebido: ${val}`);
}

/** Serializa um valor para envio ao pg: arrays de objetos e objetos simples viram JSON (para colunas jsonb); arrays de primitivos passam direto (viram array literal do Postgres, ok para uuid[]/text[]). */
function serializeParam(val: unknown): unknown {
  if (val === undefined) return null;
  if (val === null) return null;
  if (Array.isArray(val)) {
    if (val.length > 0 && typeof val[0] === 'object' && val[0] !== null && !(val[0] instanceof Date)) {
      return JSON.stringify(val);
    }
    return val;
  }
  if (typeof val === 'object' && !(val instanceof Date)) {
    return JSON.stringify(val);
  }
  return val;
}

/** Lista crua estilo PostgREST sem nenhum elemento, ex: "()" ou "( )". */
function isListaVazia(raw: string): boolean {
  return raw.replace(/[\s()]/g, '') === '';
}

/**
 * Remove as chaves com valor `undefined` do payload.
 *
 * No supabase-js o payload vira JSON antes de ir para o PostgREST, e
 * `JSON.stringify` simplesmente descarta chaves `undefined` - a coluna nem e
 * mencionada no INSERT e o DEFAULT do banco vale. Aqui montamos o SQL direto,
 * entao sem esta limpeza `{ id: undefined }` viraria `INSERT (id) VALUES (NULL)`
 * e estouraria not-null / sobrescreveria gen_random_uuid().
 */
function dropUndefined(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/**
 * TData espelha o comportamento do supabase-js: por padrao um array (select
 * normal), estreitado para um objeto unico por single()/maybeSingle().
 * Sem isso, `data: any` faz o TypeScript perder o tipo contextual dos
 * callbacks (.map(item => ...)) e disparar noImplicitAny nos chamadores.
 */
export class QueryBuilder<TData = any[]> implements PromiseLike<PgResult<TData>> {
  private mode: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
  private selectStr: string | null = null;
  private countOpt: 'exact' | null = null;
  private headOnly = false;
  private wantsSelect = false;
  private whereClauses: string[] = [];
  private deferredFilters: { path: string; op: FilterOp; val: unknown }[] = [];
  private orderBys: { column: string; ascending: boolean }[] = [];
  private limitVal: number | null = null;
  private rangeVal: { from: number; to: number } | null = null;
  private singleMode: 'single' | 'maybeSingle' | null = null;
  private insertPayload: any = null;
  private updatePayload: any = null;
  private upsertOnConflict: string | null = null;
  private deleteCountOpt: 'exact' | null = null;
  private params: unknown[] = [];
  /**
   * Erro detectado ao montar a consulta (encadeamento invalido). Guardado em vez
   * de lancado na hora: os metodos de filtro sao sincronos e ficam FORA do
   * try/catch do execute(), entao um throw ali viraria excecao nao tratada na
   * Server Action. Assim o chamador recebe `{ data: null, error }` como em
   * qualquer outra falha.
   */
  private buildError: Error | null = null;

  constructor(private pool: Pool, private table: string) {}

  private p(val: unknown): string {
    this.params.push(serializeParam(val));
    return `$${this.params.length}`;
  }

  /**
   * Parametro de INSERT/UPDATE serializado conforme o tipo REAL da coluna.
   *
   * Para colunas json/jsonb o valor tem que ir como texto JSON. Deixar o
   * node-postgres serializar um array JS gera o literal de array do Postgres
   * (`{}`, `{a,b}`): `[]` era gravado como `{}` (objeto vazio) silenciosamente
   * e arrays de primitivos estouravam erro de sintaxe json.
   */
  private pCol(col: string, val: unknown): string {
    const tipo = getColumnTypeSync(this.table, col);
    if (tipo === 'json' || tipo === 'jsonb') {
      // null/undefined viram NULL de SQL (e nao o literal JSON "null"),
      // que e o que o PostgREST faz para `{"coluna": null}`.
      this.params.push(val === undefined || val === null ? null : JSON.stringify(val));
      return `$${this.params.length}`;
    }
    return this.p(val);
  }

  private cond(col: string, op: FilterOp, val: unknown, alias: string = BASE_ALIAS): string {
    switch (op) {
      case 'eq': return `"${alias}"."${col}" = ${this.p(val)}`;
      case 'neq': return `"${alias}"."${col}" <> ${this.p(val)}`;
      case 'gt': return `"${alias}"."${col}" > ${this.p(val)}`;
      case 'gte': return `"${alias}"."${col}" >= ${this.p(val)}`;
      case 'lt': return `"${alias}"."${col}" < ${this.p(val)}`;
      case 'lte': return `"${alias}"."${col}" <= ${this.p(val)}`;
      case 'like': return `"${alias}"."${col}" LIKE ${this.p(val)}`;
      case 'ilike': return `"${alias}"."${col}" ILIKE ${this.p(val)}`;
      case 'is': return `"${alias}"."${col}" IS ${renderIsValue(val)}`;
    }
  }

  /**
   * Encaminha um filtro: "coluna" vai direto para o WHERE; "alias.coluna"
   * (recurso embutido) fica pendente ate o buildSql, quando os embeds do
   * select() ja sao conhecidos e viram um EXISTS.
   */
  private pushFilter(path: string, op: FilterOp, val: unknown) {
    if (path.includes('.')) {
      this.deferredFilters.push({ path, op, val });
    } else {
      this.whereClauses.push(this.cond(path, op, val));
    }
    return this;
  }

  /** Resolve os filtros diferidos (alias.coluna) em condicoes EXISTS, usando os embeds declarados no select(). */
  private resolveDeferredFilters(fields: SelectField[]): string[] {
    return this.deferredFilters.map(({ path, op, val }) => {
      const partes = path.split('.');
      if (partes.length !== 2) {
        throw new Error(`filtro em recurso embutido aceita apenas "alias.coluna", recebido: "${path}"`);
      }
      const [aliasName, colName] = partes;
      const isEmbed = (f: SelectField): f is Extract<SelectField, { kind: 'embed' }> => f.kind === 'embed';
      // O PostgREST aceita tanto o apelido do embed quanto o nome da tabela.
      // O app usa os dois: refinodehorario filtra por "horario.status" e
      // gerarhorarios por "horarios.status", ambos sobre horario:horarios!inner.
      const embedField =
        fields.find((f) => isEmbed(f) && f.alias === aliasName) ??
        fields.find((f) => isEmbed(f) && f.table === aliasName);
      if (!embedField || !isEmbed(embedField)) {
        throw new Error(`filtro: nao encontrei o embed "${aliasName}" no select() de "${this.table}"`);
      }
      const rel = resolveRelationshipSync(this.table, embedField.table);
      const embAlias = `f_${aliasName}`;
      const joinCond =
        rel.kind === 'belongs-to'
          ? `"${embAlias}"."${rel.refColumn}" = "${BASE_ALIAS}"."${rel.fkColumn}"`
          : `"${embAlias}"."${rel.fkColumn}" = "${BASE_ALIAS}"."${rel.refColumn}"`;
      const valueCond = this.cond(colName, op, val, embAlias);
      return `EXISTS (SELECT 1 FROM "${embedField.table}" AS "${embAlias}" WHERE ${joinCond} AND ${valueCond})`;
    });
  }

  // --- select / mutation entrypoints ---------------------------------

  select(columns = '*', opts: { count?: 'exact'; head?: boolean } = {}) {
    this.wantsSelect = true;
    this.selectStr = columns;
    this.countOpt = opts.count ?? null;
    this.headOnly = opts.head ?? false;
    return this;
  }

  insert(payload: Record<string, unknown> | Record<string, unknown>[]) {
    this.mode = 'insert';
    this.insertPayload = payload;
    return this;
  }

  update(payload: Record<string, unknown>) {
    this.mode = 'update';
    this.updatePayload = payload;
    return this;
  }

  upsert(payload: Record<string, unknown> | Record<string, unknown>[], opts: { onConflict?: string } = {}) {
    this.mode = 'upsert';
    this.insertPayload = payload;
    this.upsertOnConflict = opts.onConflict ?? null;
    return this;
  }

  delete(opts: { count?: 'exact' } = {}) {
    this.mode = 'delete';
    this.deleteCountOpt = opts.count ?? null;
    return this;
  }

  // --- filtros ----------------------------------------------------------

  // Todos aceitam "coluna" ou "alias.coluna" (recurso embutido), como no PostgREST.
  eq(col: string, val: unknown) { return this.pushFilter(col, 'eq', val); }
  neq(col: string, val: unknown) { return this.pushFilter(col, 'neq', val); }
  gt(col: string, val: unknown) { return this.pushFilter(col, 'gt', val); }
  gte(col: string, val: unknown) { return this.pushFilter(col, 'gte', val); }
  lt(col: string, val: unknown) { return this.pushFilter(col, 'lt', val); }
  lte(col: string, val: unknown) { return this.pushFilter(col, 'lte', val); }
  like(col: string, val: unknown) { return this.pushFilter(col, 'like', val); }
  ilike(col: string, val: unknown) { return this.pushFilter(col, 'ilike', val); }
  is(col: string, val: unknown) { return this.pushFilter(col, 'is', val); }

  /** Registra uma falha de montagem para ser devolvida como erro no await. */
  private fail(msg: string) {
    if (!this.buildError) this.buildError = new Error(msg);
    return this;
  }

  in(col: string, values: unknown[] | string) {
    if (col.includes('.')) {
      // Falha explicita e melhor que gerar SQL quebrado ou, pior, ignorar o filtro.
      return this.fail(`.in() ainda nao suporta filtro em recurso embutido ("${col}")`);
    }
    if (typeof values === 'string') {
      // formato cru estilo postgrest, ex: "(1,2,3)"
      if (isListaVazia(values)) {
        this.whereClauses.push('false');
        return this;
      }
      this.whereClauses.push(`"${BASE_ALIAS}"."${col}" IN ${values}`);
    } else {
      // `IN ()` e sintaxe invalida no Postgres; no PostgREST `in.()` e valido
      // e simplesmente nao casa com nada. Ex.: getSeries() com a escola sem
      // nenhuma serie cai aqui com uma lista de ids vazia.
      if (values.length === 0) {
        this.whereClauses.push('false');
        return this;
      }
      const placeholders = values.map((v) => this.p(v));
      this.whereClauses.push(`"${BASE_ALIAS}"."${col}" IN (${placeholders.join(', ')})`);
    }
    return this;
  }

  not(col: string, op: FilterOp | 'in', val: unknown) {
    if (col.includes('.')) {
      return this.fail(`.not() ainda nao suporta filtro em recurso embutido ("${col}")`);
    }
    if (op === 'in') {
      // Espelho do caso acima: "nao esta em lista vazia" e verdadeiro para todos.
      if (typeof val === 'string') {
        if (isListaVazia(val)) {
          this.whereClauses.push('true');
          return this;
        }
        this.whereClauses.push(`"${BASE_ALIAS}"."${col}" NOT IN ${val}`);
      } else {
        if ((val as unknown[]).length === 0) {
          this.whereClauses.push('true');
          return this;
        }
        const placeholders = (val as unknown[]).map((v) => this.p(v));
        this.whereClauses.push(`"${BASE_ALIAS}"."${col}" NOT IN (${placeholders.join(', ')})`);
      }
      return this;
    }
    this.whereClauses.push(`NOT (${this.cond(col, op, val)})`);
    return this;
  }

  or(filterStr: string) {
    const partes = filterStr.split(',');
    // Uma virgula dentro do valor (busca do usuario, ex.: "PALMAS, TO") parte a
    // string no lugar errado e sobra um trecho sem "coluna.operador". Antes isso
    // virava um OR vazio no SQL ("... OR  OR ..."), erro 42601 na tela.
    const malformada = partes.find((part) => part.split('.').length < 3 || !part.split('.')[0] || !part.split('.')[1]);
    if (malformada !== undefined) {
      return this.fail(`.or(): condicao mal formada "${malformada}" - use o formato "coluna.operador.valor"`);
    }
    if (partes.length === 0) return this;
    const conds = partes.map((part) => {
      const [col, op, ...rest] = part.split('.');
      return this.cond(col, op as FilterOp, rest.join('.'));
    });
    this.whereClauses.push(`(${conds.join(' OR ')})`);
    return this;
  }

  /** Filtro generico estilo PostgREST. Aceita "coluna" (tabela base) ou "alias.coluna" (tabela embutida no select()). */
  filter(path: string, op: FilterOp, val: unknown) {
    return this.pushFilter(path, op, val);
  }

  /** `referencedTable` so afeta ordenacao de relacoes to-many embutidas; para o caso de uso atual (relacao to-one) e um no-op, igual ao comportamento real do PostgREST. */
  order(col: string, opts: { ascending?: boolean; referencedTable?: string } = {}) {
    if (opts.referencedTable) return this;
    this.orderBys.push({ column: col, ascending: opts.ascending !== false });
    return this;
  }

  limit(n: number) { this.limitVal = n; return this; }
  range(from: number, to: number) { this.rangeVal = { from, to }; return this; }
  single(): QueryBuilder<any> { this.singleMode = 'single'; return this as QueryBuilder<any>; }
  maybeSingle(): QueryBuilder<any> { this.singleMode = 'maybeSingle'; return this as QueryBuilder<any>; }

  // --- execucao / thenable ----------------------------------------------

  then<TResult1 = PgResult<TData>, TResult2 = never>(
    onfulfilled?: ((value: PgResult<TData>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<PgResult<TData>> {
    try {
      await preloadSchemaMetadata(this.pool);
      const { sql, wantsReturning } = this.buildSql();
      const result = await this.pool.query(sql, this.params);

      if (this.mode === 'delete' && this.deleteCountOpt === 'exact' && !wantsReturning) {
        return { data: null, error: null, count: result.rowCount ?? 0 };
      }

      if ((this.mode !== 'select') && !wantsReturning) {
        return { data: null, error: null, count: null };
      }

      let rows = result.rows;
      let count: number | null = null;
      if (this.countOpt === 'exact') {
        count = rows.length > 0 ? Number(rows[0].__total_count) : 0;
        rows = rows.map(({ __total_count, ...rest }) => rest);
      }

      if (this.headOnly) {
        return { data: null, error: null, count };
      }

      if (this.singleMode === 'single') {
        if (rows.length !== 1) {
          return {
            data: null,
            error: rows.length === 0
              ? { message: 'Nenhum registro encontrado', code: 'PGRST116' }
              : { message: 'Mais de um registro encontrado' },
            count,
          };
        }
        return { data: rows[0], error: null, count };
      }

      if (this.singleMode === 'maybeSingle') {
        return { data: (rows[0] ?? null) as any, error: null, count };
      }

      return { data: rows as any, error: null, count };
    } catch (err: any) {
      return { data: null, error: { message: err?.message ?? String(err), code: err?.code }, count: null };
    }
  }

  private buildSql(): { sql: string; wantsReturning: boolean } {
    if (this.buildError) throw this.buildError;
    const fields = parseSelect(this.selectStr ?? '*');

    // Filtro em recurso embutido so e resolvido no SELECT. Deixar passar em
    // UPDATE/DELETE significaria descartar o filtro em silencio - ou seja,
    // atualizar/apagar a tabela inteira. Falha alto e cedo.
    if (this.mode !== 'select' && this.deferredFilters.length > 0) {
      throw new Error(
        `filtro em recurso embutido ("${this.deferredFilters[0].path}") nao e suportado em ${this.mode.toUpperCase()}`
      );
    }

    if (this.mode === 'select') {
      const built = buildSelectColumns(BASE_ALIAS, this.table, fields);
      const cols = this.headOnly ? [] : [...built.columns];
      if (this.countOpt === 'exact') cols.push(`count(*) OVER() AS "__total_count"`);
      if (cols.length === 0) cols.push('1');

      let sql = `SELECT ${cols.join(', ')} FROM "${this.table}" AS "${BASE_ALIAS}"`;
      const where = [...built.existsConditions, ...this.whereClauses, ...this.resolveDeferredFilters(fields)];
      if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
      if (this.orderBys.length) {
        sql += ' ORDER BY ' + this.orderBys.map((o) => `"${BASE_ALIAS}"."${o.column}" ${o.ascending ? 'ASC' : 'DESC'}`).join(', ');
      }
      if (this.rangeVal) {
        sql += ` LIMIT ${this.rangeVal.to - this.rangeVal.from + 1} OFFSET ${this.rangeVal.from}`;
      } else if (this.limitVal != null) {
        sql += ` LIMIT ${this.limitVal}`;
      }
      return { sql, wantsReturning: true };
    }

    if (this.mode === 'insert' || this.mode === 'upsert') {
      const rows = (Array.isArray(this.insertPayload) ? this.insertPayload : [this.insertPayload]).map(dropUndefined);
      // insert([]) e no-op no supabase-js. Sem esta saida antecipada o caso
      // "nenhuma linha" cairia no DEFAULT VALUES abaixo e gravaria uma linha fantasma.
      if (Array.isArray(this.insertPayload) && rows.length === 0) {
        this.params = [];
        return { sql: `SELECT 1 WHERE false`, wantsReturning: false };
      }
      const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
      let sql: string;
      if (cols.length === 0) {
        sql = `INSERT INTO "${this.table}" AS "${BASE_ALIAS}" DEFAULT VALUES`;
      } else {
        const valuesSql = rows
          .map((row) => `(${cols.map((c) => this.pCol(c, row[c] !== undefined ? row[c] : null)).join(', ')})`)
          .join(', ');
        sql = `INSERT INTO "${this.table}" AS "${BASE_ALIAS}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES ${valuesSql}`;
      }

      if (this.mode === 'upsert') {
        const conflictCols = this.upsertOnConflict
          ? this.upsertOnConflict.split(',').map((s) => s.trim())
          : getPrimaryKeySync(this.table);
        const updateSet = cols.filter((c) => !conflictCols.includes(c)).map((c) => `"${c}" = EXCLUDED."${c}"`).join(', ');
        sql += ` ON CONFLICT (${conflictCols.map((c) => `"${c}"`).join(', ')}) DO ${updateSet ? `UPDATE SET ${updateSet}` : 'NOTHING'}`;
      }

      if (this.wantsSelect) {
        const built = buildSelectColumns(BASE_ALIAS, this.table, fields);
        sql += ` RETURNING ${built.columns.join(', ')}`;
        return { sql, wantsReturning: true };
      }
      return { sql, wantsReturning: false };
    }

    if (this.mode === 'update') {
      const payload = dropUndefined(this.updatePayload);
      const cols = Object.keys(payload);
      if (cols.length === 0) {
        // Nada a atualizar: o supabase-js aceita e vira no-op, entao nao estouramos SQL invalido.
        // Zeramos os params porque os filtros ja empilhados nao aparecem neste SQL.
        this.params = [];
        return { sql: `SELECT 1 WHERE false`, wantsReturning: false };
      }
      const setSql = cols.map((c) => `"${c}" = ${this.pCol(c, payload[c])}`).join(', ');
      let sql = `UPDATE "${this.table}" AS "${BASE_ALIAS}" SET ${setSql}`;
      if (this.whereClauses.length) sql += ` WHERE ${this.whereClauses.join(' AND ')}`;
      if (this.wantsSelect) {
        const built = buildSelectColumns(BASE_ALIAS, this.table, fields);
        sql += ` RETURNING ${built.columns.join(', ')}`;
        return { sql, wantsReturning: true };
      }
      return { sql, wantsReturning: false };
    }

    // delete
    let sql = `DELETE FROM "${this.table}" AS "${BASE_ALIAS}"`;
    if (this.whereClauses.length) sql += ` WHERE ${this.whereClauses.join(' AND ')}`;
    if (this.wantsSelect) {
      const built = buildSelectColumns(BASE_ALIAS, this.table, fields);
      sql += ` RETURNING ${built.columns.join(', ')}`;
      return { sql, wantsReturning: true };
    }
    return { sql, wantsReturning: false };
  }
}

const fnParamTypesCache = new Map<string, Record<string, string>>();

async function getFunctionParamTypes(pool: Pool, fnName: string): Promise<Record<string, string>> {
  if (fnParamTypesCache.has(fnName)) return fnParamTypesCache.get(fnName)!;
  const { rows } = await pool.query(
    `select p.parameter_name, p.data_type
     from information_schema.parameters p
     join information_schema.routines r
       on r.specific_name = p.specific_name and r.specific_schema = p.specific_schema
     where r.routine_schema = 'public' and r.routine_name = $1`,
    [fnName]
  );
  const map: Record<string, string> = {};
  for (const r of rows) map[r.parameter_name] = r.data_type;
  fnParamTypesCache.set(fnName, map);
  return map;
}

/** Serializa um valor de parametro de RPC sabendo o tipo real do parametro no Postgres (evita ambiguidade de arrays vazios entre jsonb e array nativo). */
function serializeRpcParam(val: unknown, pgType: string | undefined): unknown {
  if (pgType === 'json' || pgType === 'jsonb') {
    return JSON.stringify(val ?? null);
  }
  return serializeParam(val);
}

export async function callRpc(
  pool: Pool,
  fnName: string,
  params: Record<string, unknown> = {}
): Promise<{ data: any; error: { message: string; code?: string } | null }> {
  try {
    const paramTypes = await getFunctionParamTypes(pool, fnName);
    const keys = Object.keys(params);
    const args = keys.map((k, i) => `"${k}" := $${i + 1}`).join(', ');
    const values = keys.map((k) => serializeRpcParam(params[k], paramTypes[k]));
    const sql = `SELECT "${fnName}"(${args})`;
    const result = await pool.query(sql, values);
    return { data: result.rows.length ? result.rows : null, error: null };
  } catch (err: any) {
    // err.code vem do Postgres (ex: 23505 unique_violation, 23503 foreign_key_violation)
    // e e' consumido por quem chama para diferenciar o tipo de falha.
    return { data: null, error: { message: err?.message ?? String(err), code: err?.code } };
  }
}
