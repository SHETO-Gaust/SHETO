# Migração Supabase → PostgreSQL local + NextAuth

**Última atualização:** 30/07/2026
**Status:** Fases 0 a 3 concluídas. Faltam Fases 4 e 5.

---

## Por que esta migração existe

A VM do estado onde o SHETO vai rodar **não tem acesso à internet** (política de rede).
O Supabase é um serviço em nuvem — sem internet, o sistema não funciona.
Solução: trazer banco e autenticação para dentro da máquina.

---

## O que já está pronto

### Fase 0 — Backup do Supabase ✅
- 6.897 linhas extraídas (6.838 em `public` + 59 usuários em `auth.users`)
- Conferência exata tabela a tabela, zero divergência
- **Duas cópias:** `Desktop/SHETO-BACKUP/` e `Documentos/SHETO-BACKUP/`

> **Obstáculo contornado:** a rede local bloqueia a porta 5432 (firewall com inspeção
> de pacotes). O `pg_dump` não funcionava. A extração foi feita via conector MCP do
> Supabase, que roda por fora dessa rede.

### Fase 1 — Postgres local ✅
- Banco `sheto` criado e restaurado
- 17/17 tabelas conferem com a origem

### Fase 2 — Camada de dados ✅
- `src/lib/db/` traduz chamadas estilo Supabase para SQL
- 15/15 testes passando: embeds, `!inner` aninhado, RPC, insert/update/delete
- 4 componentes convertidos para Server Actions

### Fase 3 — NextAuth ✅
- 59/59 senhas bcrypt preservadas — **ninguém precisou trocar senha**
- Login validado no navegador
- Zero regressão de tipos (90 erros antes, 90 depois — todos pré-existentes)

---

## O que falta

### Fase 4 — Autorização (~2-4h)

**Contexto:** ao medir, descobri que o RLS do Supabase protegia menos do que parecia.
Quase todas as políticas eram `auth.role() = 'authenticated'` ("basta estar logado").
A separação por escola **sempre** foi responsabilidade da aplicação, nunca do banco.

**Consequência boa:** o achado de segurança original (tabelas `escolas` e `profiles`
sem RLS, expostas à chave pública do Supabase) **deixa de existir** — no Postgres
local não há chave pública, só o servidor acessa o banco.

**Risco a fechar:** 79 Server Actions em 14 arquivos não verificam sessão. Elas
dependiam do RLS exigir login. Como Server Actions são endpoints HTTP, dá para
chamá-las diretamente sem passar pela tela de login.

Trabalho:
1. Criar helpers `requireAuth()`, `requireAdmin()`, `requireEscola()`
2. Aplicar a guarda correta em cada uma das 79 actions
3. **Manter públicas:** `src/app/horarios/actions.ts` e `src/app/restricoes/[token]/`

Distribuição das actions a proteger:
```
13 gerarhorarios     5 turno           3 relatorios
 9 professores       5 turmas          3 refinodehorario
 8 auditoria         4 usuarios        3 ensino
 7 avaliacoes-admin  4 unidades        3 componentes
 6 serie             3 substituicoes   2 profile
                                       1 visualizarhorario
```

### Fase 5 — Validação e corte
- Testar todos os módulos ponta a ponta
- Remover dependências `@supabase/*` do `package.json`
- Limpar variáveis do Supabase do `.env.local`

---

## Mapa dos arquivos

### Código novo
```
src/lib/db/
├── pool.ts             conexão com o Postgres
├── client.ts           monta .from() e .rpc()
├── query-builder.ts    traduz .select().eq() para SQL
├── select-parser.ts    entende "escola:escolas(nome)"
├── sql-builder.ts      monta JOINs embutidos
├── relationships.ts    lê chaves estrangeiras do banco
└── auth-shim.ts        replica supabase.auth.* via NextAuth

src/lib/auth/index.ts                     config do NextAuth
src/app/api/auth/[...nextauth]/route.ts   rota de login/logout
```

### Reescritos (mesma interface, motor novo)
| Arquivo | Mudança |
|---|---|
| `src/lib/supabase/server.ts` | **A peça-chave** — devolve o cliente Postgres |
| `src/lib/supabase/client.ts` | Bloqueia acesso ao banco pelo navegador |
| `src/middleware.ts` | Removida lógica de sessão do Supabase |

> Os outros ~45 arquivos de actions **não foram tocados**: todos importam
> `createClient` de `server.ts`. Trocando só ele, todos passaram a usar o
> Postgres sem saber da mudança.

### Convertidos para Server Actions
- `src/lib/escolas.ts`
- `src/components/school-selector.tsx`
- `src/app/(app)/gerarhorarios/gerador-horario-client.tsx`
- `src/app/(app)/avaliacoes-admin/gerador-horario-client.tsx`

---

## Como retomar

```bash
npm run dev     # sobe em http://localhost:9002
```

O banco local já está populado. Login funciona com as senhas de sempre.

**Recriar o banco do zero** (se precisar):
```powershell
.\migracao\03-restaurar-local.ps1
```

**Variáveis relevantes** (`.env.local`, não versionado):
```
PGHOST / PGPORT / PGUSER / PGPASSWORD / PGDATABASE   → Postgres local
AUTH_SECRET                                          → NextAuth
```

---

## Pendência separada (não bloqueia)

Há uma feature morta no projeto: `FormacaoCard`, `edit-formacao-sheet.tsx` e os
itens de menu `/formacoes`, `/gerenciamento`, `/ensalamentos`. Consultam tabelas
(`formadores`, `inscricoes`, `ensalamentos`) que **não existem** no banco e não
têm páginas correspondentes. Candidatos a remoção — há um card de tarefa aberto.
