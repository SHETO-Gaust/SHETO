# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Visão geral

SHE (Sistema de Horário Escolar) é uma aplicação Next.js 15 (App Router) + TypeScript para gestão acadêmica e geração automática de quadros de horários escolares, com Supabase (PostgreSQL) como backend/BaaS. Veja [documentacao.md](documentacao.md) para a documentação técnica completa de arquitetura e modelo de dados, e [manual.md](manual.md) para o fluxo de uso funcional (Turnos → Ensino → Componentes → Professores → Série → Turmas → Gerar Horário → Refino).

## Comandos

```bash
npm run dev          # dev server com Turbopack, porta 9002
npm run build         # build de produção (cross-env NODE_ENV=production next build)
npm run start         # serve o build de produção
npm run lint          # next lint
npm run typecheck     # tsc --noEmit
npm run genkit:dev     # inicia o Genkit dev UI carregando src/ai/dev.ts
npm run genkit:watch   # idem, em modo watch
```

Não há suíte de testes configurada neste repositório.

Notas importantes:
- `next.config.ts` define `typescript.ignoreBuildErrors: true` e `eslint.ignoreDuringBuilds: true` — o build do Next **não falha** por erros de tipo ou lint. Rode `npm run typecheck` e `npm run lint` manualmente antes de considerar uma alteração concluída.
- Variáveis de ambiente esperadas (`.env.local`, não versionado): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, credenciais `ergon_*` (integração externa), `GMAIL_EMAIL`/`GMAIL_APP_PASSWORD` (envio de e-mail via `src/lib/mail.ts`).

## Arquitetura

### Stack
Next.js 15 (App Router) + TypeScript, Tailwind CSS + shadcn/ui (Radix), Supabase (Postgres + Auth + RLS), Genkit (`@genkit-ai/google-genai`) para o fluxo de IA opcional de geração de horário.

### Estrutura de rotas
- `src/app/(app)/` — área logada, protegida por `src/app/(app)/layout.tsx`. Organizada por módulo de negócio: `turno`, `ensino`, `componentes`, `professores`, `serie`, `turmas`, `gerarhorarios`, `visualizarhorario`, `relatorios`, `refinodehorario`, `substituicoes`, `auditoria`, `usuarios`, `unidades`, `dashboard`, `profile`, `avaliacoes-admin`.
- `src/app/login`, `src/app/auth/callback` — autenticação.
- `src/app/restricoes/[token]` — rota pública (sem login) usada para professores preencherem suas restrições de horário via link tokenizado.
- `src/middleware.ts` — refresca a sessão Supabase em cada request e injeta o path atual no header `x-next-url` para o layout.

### Padrão de cada módulo (`src/app/(app)/<modulo>/`)
- `page.tsx` — Server Component: faz o fetch inicial via Supabase (RSC) e passa os dados como props.
- `<modulo>-client.tsx` — Client Component (`"use client"`) com o estado interativo (formulários, drag-and-drop, etc.), recebendo dados do `page.tsx`.
- `actions.ts` — Server Actions: toda mutação (insert/update/delete, disparo do gerador de horários) passa por aqui, nunca por API routes client-side.
- Sheets/dialogs auxiliares ficam em arquivos próprios (ex.: `professores/restricoes-professor-sheet.tsx`, `professores/edit-professor-sheet.tsx`).

### Autorização
`src/app/(app)/layout.tsx` carrega o `Profile` do usuário (tabela `profiles`, join com `escolas`) e checa o array `modules[]` contra um `moduleMap` (rota → nome do módulo) para decidir se renderiza a página ou um `AccessDenied`. Usuários com `role: 'admin'` têm bypass total. Usuários com `active: false` veem uma tela de bloqueio em vez de serem redirecionados (evita loop de redirect).

### Núcleo algorítmico (`src/lib/`)
- `timetabling.ts` — motor de geração automática de horários (problema NP-difícil de timetabling), heurística estocástica com relaxamento progressivo de constraints. Hard constraints: conflito de professor (comparado por sobreposição real em minutos via `timeToMinutes`, não por índice de aula — importante para turnos desalinhados entre escolas), bloqueios `indisponivel`, períodos de `livre_docencia`. Soft constraints: dias preferidos, evitar slots de `planejamento`, geminação de aulas (`ConfiguracaoGerminacao`).
- `refino-horario.ts` — módulo de refino pós-geração. `calcularCadeiaDeRefinoDFS` faz busca em grafo (DFS) para encontrar cadeias de permutação de aulas que resolvam um conflito de drag-and-drop sem violar hard constraints.
- `types.ts` — tipos/interfaces globais que espelham o schema do banco.
- `supabase/{client,server,middleware}.ts` — três clientes Supabase distintos por contexto de execução (browser, RSC/Server Action, middleware).
- `export-horario.ts` — exportação de horários (Excel via `xlsx`).
- `mail.ts` — envio de e-mail via Nodemailer/Gmail (usado para o fluxo de restrições por link tokenizado).

### IA (opcional)
`src/ai/flows/gerar-horario-flow.ts` expõe um fluxo Genkit alternativo de geração de horário via LLM (Google GenAI), separado do motor heurístico de `timetabling.ts`. Novos flows devem ser importados em `src/ai/dev.ts` para aparecerem no Genkit dev UI.

### Banco de dados
`supabase/migrations/` contém os scripts SQL versionados (schema + políticas RLS). RLS isola dados por `escola_id` e restringe a visibilidade de horários em rascunho a usuários fora do fluxo de geração. Ao alterar schema, adicione uma nova migration em vez de editar as existentes.

### Modelo de dados (resumo)
`Profiles`/`Escolas` (acesso e vínculo a unidades) → `Turnos` (slots de horário) → `Séries` (grade curricular-molde, com `Aulas Fixas`) → `Turmas` (instância real de uma Série, liga Componente Curricular ↔ Professor) → `Professores` (com `restricoes` e `livre_docencia` em JSONB) → `Horarios`/`Aulas Geradas` (estado rascunho vs. publicado). Detalhes completos em [documentacao.md](documentacao.md).
