# Documentação Técnica - SHE (Sistema de Horário Escolar)

O **SHE (Sistema de Horário Escolar)** é uma aplicação web moderna voltada para a gestão e automação da geração de quadros de horários escolares. O sistema gerencia toda a estrutura acadêmica (turnos, disciplinas, professores, turmas) e utiliza algoritmos de otimização combinatória para resolver o problema de timetabling, além de oferecer ferramentas de refino manual e relatórios operacionais.

## 1. Arquitetura e Stack Tecnológico

A aplicação adota uma arquitetura Serverless/Edge utilizando os paradigmas mais recentes do ecossistema React.

- **Framework:** Next.js 15 (App Router).
- **Linguagem:** TypeScript.
- **Estilização:** Tailwind CSS acoplado à biblioteca de componentes Shadcn/ui.
- **Ícones:** Lucide React.
- **Banco de Dados e Backend as a Service (BaaS):** Supabase (PostgreSQL).
- **Autenticação:** Supabase Auth (Integrado com Server Actions do Next.js).
- **Hospedagem/Deploy:** Projetado para ambientes modernos como Vercel.

## 2. Estrutura de Diretórios (Destaques)

- `src/app/(app)/`: Contém todas as rotas da área logada da aplicação. Organizado por módulos de negócio (`turno`, `professores`, `turmas`, `gerarhorarios`, `refinodehorario`, `auditoria`, etc.).
- `src/components/`: Componentes reutilizáveis de interface (botões, cards, navegação lateral `main-nav.tsx`, layout, etc).
- `src/lib/`: Código central da lógica de negócio e configurações.
  - `types.ts`: Definições globais de tipos do TypeScript e interfaces espelhando o banco de dados.
  - `timetabling.ts`: Motor algorítmico principal de geração automática de horários.
  - `refino-horario.ts`: Algoritmo baseado em grafos para análise de impacto e sugestão de cadeias de refino manual pós-geração.
- `supabase/migrations/`: Scripts SQL versionados para estrutura e políticas de segurança (RLS - Row Level Security) do banco de dados.

## 3. Modelo de Dados Principal (PostgreSQL / Supabase)

O banco de dados é puramente relacional. As principais entidades mapeadas incluem:

- **Profiles & Escolas:** Gerenciam o controle de acesso, perfis (`admin`, `user`), permissões granulares por módulo (`modules[]`) e o vínculo do usuário com unidades escolares (`ue`).
- **Turnos:** Períodos de funcionamento da escola. Eles guardam um array de "slots" de tempo (representados por strings de minutos de início e fim).
- **Séries:** O "molde" ou matriz para as turmas. Define a grade curricular quantitativa (ex: quantas aulas presenciais e não presenciais de Matemática a 1ª Série possui).
  - *Aulas Fixas:* Sub-entidade para agendamento rígido que o gerador não pode alterar (ex: uso de laboratórios).
- **Turmas:** A instância real de uma Série. É na Turma que ocorre a relação entre o "Componente Curricular" e o "Professor" encarregado de ministrá-lo.
- **Professores:** Cadastro dos docentes. A entidade possui colunas do tipo JSONB para guardar de forma flexível configurações matriciais pesadas:
  - `restricoes`: Mapa de disponibilidade indicando onde o professor está `indisponivel` ou prefere `planejamento`.
  - `livre_docencia`: Dias e turnos de folga garantida (hard constraint).
- **Horarios & Aulas Geradas:** Tabelas de registro de estado. Guardam os resultados produzidos pelo motor de geração, separando horários "em rascunho" (para análise) dos "publicados" (oficiais e visíveis nos visualizadores e relatórios).

## 4. Algoritmos Core e Inteligência

O coração do sistema reside em dois arquivos na pasta `src/lib`.

### 4.1. Motor de Geração (Timetabling Engine) - `lib/timetabling.ts`
O sistema resolve o problema NP-Difícil de alocação de horários utilizando um algoritmo heurístico estocástico com sistema progressivo de relaxamento de restrições (constraints).

- **Resolução de Conflito Absoluto:** Para prevenir choques inter-turnos (professores em escolas com grades de turnos desalinhadas), o sistema não compara apenas índices de aula (ex: "Aula 1"), mas converte o HH:MM para "minutos desde a meia-noite" (`timeToMinutes`), calculando a sobreposição temporal real.
- **Hard Constraints (Restrições Fortes):**
  - Evitar sobreposição de professor (choque de horário em minutos).
  - Respeitar bloqueios do tipo `indisponivel`.
  - Respeitar períodos marcados como `livre_docencia`.
- **Soft Constraints (Restrições Fracas):**
  - O sistema tenta seguir preferências de "dias preferidos" do professor, favorecendo a concentração da carga horária.
  - Tenta evitar o uso de slots de `planejamento`.
  - Busca geminar blocos de 2 aulas para a mesma turma/disciplina baseando-se em `ConfiguracaoGerminacao`.
- **Relaxamento Progressivo:** Conforme o número de tentativas aumenta durante a geração, o sistema começa a ignorar Soft Constraints (ex: permitir aulas soltas ao invés de geminadas, ignorar dias preferidos ou utilizar slots de planejamento) para garantir o encaixe final, se for a única alternativa matemática possível.

### 4.2. Módulo de Refino Inteligente - `lib/refino-horario.ts`
Atua no pós-geração. Permite ajustes em uma interface gráfica drag-and-drop.
- **Motor de Impacto:** Ao tentar arrastar uma aula A para um slot X já ocupado pela aula B, a inteligência simula qual seria o efeito cascata.
- **Busca em Grafos (DFS):** O algoritmo `calcularCadeiaDeRefinoDFS` navega por ramificações tentando encontrar um caminho onde B possa ir para Y, e assim por diante, até encontrar um "slot vazio", criando um loop de permutações viáveis sem quebrar hard constraints do professor.

## 5. Segurança, Autenticação e Perfis de Acesso

A segurança baseia-se em profunda integração com as features nativas do Supabase:

- **Autenticação:** Baseada no Supabase Auth via tokens de sessão gerenciados via cookies. A leitura é protegida no Next.js Middleware.
- **Políticas de Banco de Dados (RLS):** Múltiplas tabelas possuem políticas SQL rigorosas. Por exemplo, horários "em rascunho" não são expostos a usuários comuns fora do processo de geração; regras isolam os dados entre diferentes instâncias de `escola_id`.
- **Autorização (Application Level):** O `layout.tsx` principal da área logada verifica o campo `role` e o array `modules` no perfil do usuário (`Profile`). Dependendo do grupo de funcionalidades (ex: módulo de usuários vs. módulo de turnos), o layout bloqueia a renderização e exibe um componente de `AccessDenied`. Usuários com role `admin` contam com bypass dinâmico para acesso root global à aplicação e auditoria.

## 6. Fluxo de Execução e Boas Práticas Adotadas

1. **Server Actions (Mutações):** Para máxima segurança e performance (eliminação de chamadas API pesadas do lado do cliente), inserções, atualizações de professores, e acionamento do gerador de horários são expostos puramente via Next.js Server Actions nos arquivos `actions.ts`.
2. **Server Components:** Sempre que possível, o fetch inicial de dados nas páginas (arquivos `page.tsx`) é feito via componentes de servidor (RSC). Isso provê rápido Time-To-First-Byte (TTFB).
3. **Client Components isolados:** Componentes que exigem estado React (ex: Drag and Drop, Formulários complexos) são colocados em arquivos terminados em `-client.tsx` com a diretiva `"use client"`. O servidor injeta os dados neles através das `props`.
