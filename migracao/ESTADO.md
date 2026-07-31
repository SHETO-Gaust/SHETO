# Migração Supabase → PostgreSQL local + NextAuth

**Última atualização:** 31/07/2026
**Status:** ✅ MIGRAÇÃO CONCLUÍDA — todas as 6 fases.

O sistema roda inteiramente sem internet, sem os pacotes `@supabase/*` e
sem nenhuma variável de ambiente do Supabase.

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

### Fase 4 — Autorização ✅

**Contexto:** ao medir, descobri que o RLS do Supabase protegia menos do que parecia.
Quase todas as políticas eram `auth.role() = 'authenticated'` ("basta estar logado").
A separação por escola **sempre** foi responsabilidade da aplicação, nunca do banco.

**Consequência boa:** o achado de segurança original (tabelas `escolas` e `profiles`
sem RLS, expostas à chave pública do Supabase) **deixa de existir** — no Postgres
local não há chave pública, só o servidor acessa o banco.

**Risco fechado:** Server Actions são endpoints HTTP — podiam ser chamadas
diretamente, sem passar pela tela de login.

Guardas criadas em `src/lib/auth/guards.ts`:

| Guarda | Uso |
|---|---|
| `requireAuth()` | sessão válida + perfil ativo |
| `requireAdmin()` | apenas administradores |
| `requireEscola(id)` | admin, ou usuário da própria escola |
| `requireModulo(mod)` | respeita grupos `dados-horario` / `usuarios` |
| `requireEscolaDoRecurso(tabela, id, mod)` | resolve a escola dona do registro |
| `requireEscolaDosRecursos(tabela, ids[], mod)` | versão em lote |
| `requireEscolaDaSolicitacao(id, mod)` | dois saltos (solicitação → professor → escola) |

**77 guardas aplicadas.** Auditoria automatizada confirma: nenhuma action sem
guarda além das 8 intencionalmente públicas.

> **Falha encontrada pelo próprio teste:** ao chamar as Server Actions sem sessão,
> descobri que `updateSelectedSchool` (criada por mim na Fase 2) **executava e
> chegava ao banco**. Pior: recebia `userId` do cliente, então dava para trocar a
> escola de outro usuário. Corrigida — agora ignora o parâmetro e usa a sessão
> como fonte de verdade.

**Permanecem públicas por design:**
- `login/actions.ts` — signIn, signInGetResult, signOut
- `horarios/actions.ts` — consulta pública de horários por INEP
- `professores/actions.ts` — `getSolicitacaoByToken`, `responderSolicitacao`
  (o professor não tem login; o token tokenizado **é** a credencial)

### Fase 5 — Validação e corte ✅

Percorridos com login real e dados de produção (Escola Elizângela Glória
Cardoso, INEP 17056438):

| Módulo | Resultado |
|---|---|
| Login | sessão criada, senha original funcionando |
| Dashboard | escola vinculada e horário publicado |
| Turnos | 4 turnos, grade de 9 aulas + intervalos (JSONB intacto) |
| Professores | lista com disciplinas (N:N), turnos (array UUID), carga |
| Séries | 3 séries, C.H. 45/45, contagem de turmas correta |
| Turmas | 22 turmas, "alocação completa" |
| Gerar Horário | histórico V1 publicado / V2 rascunho |
| Grade completa | **990 aulas** com disciplina, professor e intervalos |
| Refino | carrega e lista horários publicados |
| Relatórios | Carga Horária (28/28 = 100%) e Mapa (22 turmas) |
| Usuários | 58 perfis com join de escolas |
| Auditoria | **486 unidades**, gráfico por regional, paginação |
| Consulta pública | busca por INEP sem login retorna a grade |

**Corte:** `@supabase/ssr` e `@supabase/supabase-js` desinstalados,
variáveis `NEXT_PUBLIC_SUPABASE_*` e `SUPABASE_SERVICE_ROLE_KEY` removidas
do `.env.local`. Servidor reiniciado sem elas — tudo segue funcionando.

> **Bug encontrado nesta fase:** a tela de Séries mostrava "0 turmas" em
> todas, sendo que o banco tinha 8, 8 e 6. Causa: o PostgREST devolve
> `tabela(count)` como **array** (`[{count: N}]`) e o app lê
> `serie.turmas[0].count`; o shim devolvia objeto, então `[0]` era
> `undefined` e o `?? 0` mascarava tudo como zero.
>
> O smoke test da Fase 2 não pegou porque só verificava
> `typeof count === 'number'` — e `0` é um número válido. Só apareceu ao
> olhar dados reais na tela.

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
