# SHE — Sistema de Horário Escolar

> Plataforma web para gestão acadêmica e geração automática de quadros de horários escolares da rede estadual de ensino do Tocantins.

Desenvolvido pela **Gerência de Apoio ao Usuário e Suporte Técnico — SEDUC/TO**, com aprovação da Superintendência Regional.

---

## Visão Geral

O SHE automatiza a montagem do quadro de horários escolar, respeitando:

- Conflitos de professor entre turmas e turnos
- Indisponibilidades e restrições individuais de cada professor
- Livre docência e dias preferidos
- Carga horária semanal por componente curricular
- Aulas fixas definidas pela coordenação

O sistema oferece ainda refino manual por drag-and-drop com sugestão automática de cadeias de permutação sem conflito.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 15 (App Router) + TypeScript |
| UI | Tailwind CSS + shadcn/ui (Radix UI) |
| Backend / BaaS | Supabase (PostgreSQL + Auth + RLS) |
| IA (opcional) | Google Genkit + GenAI |
| E-mail | Nodemailer / Gmail |
| Exportação | xlsx (Excel) |

---

## Funcionalidades

- **Gestão de Turnos** — cadastro de turnos com horários de cada aula
- **Componentes Curriculares** — cadastro de disciplinas com siglas
- **Professores** — cadastro com restrições de horário; envio de link tokenizado para o professor preencher as próprias preferências
- **Séries e Turmas** — grade-molde e instâncias reais com vínculo professor ↔ disciplina
- **Geração Automática** — motor heurístico estocástico com relaxamento progressivo de constraints
- **Refino Manual** — drag-and-drop com busca DFS de cadeias de permutação sem conflito
- **Publicação e Exportação** — horários publicados exportáveis em Excel
- **Substituições** — gestão de substituições de professores ausentes
- **Auditoria** — visão geral de todas as escolas, limpeza em lote de rascunhos, comunicados em massa
- **Gestão de Usuários** — controle de acesso por módulos; admins com escolas favoritas; usuários vinculados a uma unidade escolar

---

## Fluxo de Uso

```
Turnos → Ensino → Componentes → Professores → Séries → Turmas → Gerar Horário → Refino → Publicar
```

---

## Instalação e Execução

### Pré-requisitos

- Node.js 18+
- Conta no [Supabase](https://supabase.com)

### Configuração

1. Clone o repositório:
```bash
git clone https://github.com/SHETO-Gaust/SHETO.git
cd SHETO
```

2. Instale as dependências:
```bash
npm install
```

3. Crie o arquivo `.env.local` na raiz com as variáveis:
```env
NEXT_PUBLIC_SUPABASE_URL=sua_url_supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_anon_key
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key
GMAIL_EMAIL=seu_email@gmail.com
GMAIL_APP_PASSWORD=sua_senha_de_app
NEXT_PUBLIC_SITE_URL=https://seu-dominio.com
```

4. Execute as migrations no Supabase (`supabase/migrations/`)

5. Inicie o servidor de desenvolvimento:
```bash
npm run dev
```

Acesse em: [http://localhost:9002](http://localhost:9002)

---

## Comandos Disponíveis

```bash
npm run dev          # Servidor de desenvolvimento (Turbopack, porta 9002)
npm run build        # Build de produção
npm run start        # Serve o build de produção
npm run lint         # Verificação de lint
npm run typecheck    # Verificação de tipos TypeScript
npm run genkit:dev   # Interface de desenvolvimento Genkit (IA)
```

---

## Estrutura do Projeto

```
src/
├── app/
│   ├── (app)/               # Área logada (protegida por layout.tsx)
│   │   ├── dashboard/
│   │   ├── turno/
│   │   ├── ensino/
│   │   ├── componentes/
│   │   ├── professores/
│   │   ├── serie/
│   │   ├── turmas/
│   │   ├── gerarhorarios/
│   │   ├── visualizarhorario/
│   │   ├── refinodehorario/
│   │   ├── substituicoes/
│   │   ├── relatorios/
│   │   ├── auditoria/
│   │   ├── usuarios/
│   │   └── unidades/
│   ├── login/
│   ├── auth/callback/
│   └── restricoes/[token]/  # Rota pública para professores
├── lib/
│   ├── timetabling.ts       # Motor de geração de horários
│   ├── refino-horario.ts    # Algoritmo DFS de refino
│   ├── types.ts             # Tipos globais
│   ├── mail.ts              # Envio de e-mail
│   ├── export-horario.ts    # Exportação Excel
│   └── supabase/            # Clientes Supabase (browser, server, middleware)
├── ai/
│   └── flows/               # Fluxos Genkit (IA opcional)
└── components/
    └── ui/                  # Componentes shadcn/ui
```

---

## Arquitetura de Autorização

- **Admin** — acesso total a todos os módulos e escolas; pode definir escolas favoritas para acompanhamento rápido
- **Usuário** — acesso apenas aos módulos liberados pelo admin; vinculado a uma unidade escolar
- **Professor** — sem conta no sistema; preenche restrições via link tokenizado (válido por 48h)

RLS (Row Level Security) no Supabase isola os dados por `escola_id`, garantindo que cada escola só acesse seus próprios dados.

---

## Deploy

O sistema está disponível em produção em: **https://sheto.vercel.app**

Para deploy próprio, recomendamos a [Vercel](https://vercel.com) com as variáveis de ambiente configuradas no painel.

---

## Licença

Projeto de uso interno — Secretaria da Educação do Estado do Tocantins © 2026.
