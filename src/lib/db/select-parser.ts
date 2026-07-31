export type SelectField =
  | { kind: 'column'; name: string }
  | { kind: 'star' }
  | {
      kind: 'embed';
      alias: string;
      table: string;
      inner: boolean;
      fields: SelectField[];
    };

/**
 * Faz o parse de uma string de select estilo PostgREST/supabase-js, ex:
 *   "*, escola:escolas(id, escolar), professores(count)"
 * Suporta aninhamento recursivo e o modificador "!inner".
 */
export function parseSelect(input: string): SelectField[] {
  const src = input.replace(/\s+/g, ' ').trim();
  let i = 0;

  function peekChar() {
    return src[i];
  }

  function parseFieldList(): SelectField[] {
    const fields: SelectField[] = [];
    while (i < src.length) {
      skipComma();
      if (peekChar() === ')' || i >= src.length) break;
      fields.push(parseField());
      skipSpaces();
      if (peekChar() === ',') {
        i++;
        continue;
      }
      break;
    }
    return fields;
  }

  function skipSpaces() {
    while (src[i] === ' ') i++;
  }

  function skipComma() {
    skipSpaces();
  }

  function parseIdentifier(): string {
    skipSpaces();
    const start = i;
    while (i < src.length && /[a-zA-Z0-9_]/.test(src[i])) i++;
    return src.slice(start, i);
  }

  function parseField(): SelectField {
    skipSpaces();
    if (peekChar() === '*') {
      i++;
      return { kind: 'star' };
    }

    const first = parseIdentifier();
    skipSpaces();

    // alias:table(...)
    if (peekChar() === ':') {
      i++;
      const tableOrCol = parseIdentifier();
      return parseMaybeEmbed(first, tableOrCol);
    }

    return parseMaybeEmbed(first, first);
  }

  function parseMaybeEmbed(alias: string, tableName: string): SelectField {
    skipSpaces();
    let inner = false;
    if (src.slice(i, i + 6) === '!inner') {
      inner = true;
      i += 6;
      skipSpaces();
    }
    if (peekChar() === '(') {
      i++;
      const fields = parseFieldList();
      skipSpaces();
      if (peekChar() === ')') i++;
      return { kind: 'embed', alias, table: tableName, inner, fields };
    }
    return { kind: 'column', name: tableName };
  }

  return parseFieldList();
}
