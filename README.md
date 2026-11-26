# SHE - Sistema de Horário Escolar

Sistema web da SEDUC/TO para montar o quadro de horários das escolas estaduais do Tocantins. A escola cadastra turnos, disciplinas, professores, séries e turmas; o sistema monta a grade sem choque de horário, respeitando a disponibilidade de cada professor. A coordenação ajusta o que precisar e publica.

- Produção: https://sheto.seduc.to.gov.br
- Consulta pública de horários (sem login): botão na tela de entrada, ou `/horarios`
- Desenvolvido pela Gerência de Apoio ao Usuário e Suporte Técnico - SEDUC/TO

Este documento tem duas partes. A primeira é para quem usa o sistema (escolas e administradores). A segunda é para quem mantém o servidor e o código.

## Sumário

**Uso**
1. [Perfis de acesso](#1-perfis-de-acesso)
2. [Entrar no sistema](#2-entrar-no-sistema)
3. [Montando o horário de uma escola](#3-montando-o-horário-de-uma-escola)
4. [Depois de publicar](#4-depois-de-publicar)
5. [Gestão (somente administradores)](#5-gestão-somente-administradores)
6. [Problemas comuns](#6-problemas-comuns)

**Operação e manutenção**

7. [Como o sistema é montado](#7-como-o-sistema-é-montado)
8. [Variáveis de ambiente](#8-variáveis-de-ambiente)
9. [Atualizar a produção](#9-atualizar-a-produção)
10. [Banco de dados e migrations](#10-banco-de-dados-e-migrations)
11. [Logs e scripts de diagnóstico](#11-logs-e-scripts-de-diagnóstico)
12. [Ambiente de desenvolvimento](#12-ambiente-de-desenvolvimento)

---

# Parte 1 - Uso

## 1. Perfis de acesso

| Perfil | Quem é | O que acessa |
|---|---|---|
| **Administrador** | Equipe da SEDUC sede e das regionais | Tudo, em qualquer escola. Escolhe a escola de trabalho no seletor do topo. Único que vê o menu **Gestão**. |
| **Usuário** | Coordenação ou secretaria da escola | Tudo da própria escola, menos o menu Gestão. Fica preso à escola em que foi cadastrado. |
| **Professor** | Docente | Não tem conta. Recebe um link por e-mail para informar os próprios horários indisponíveis. |
| **Público** | Alunos, pais, qualquer pessoa | Apenas a consulta de horários publicados, sem login. |

Contas só são criadas por um administrador (ver [Gestão de usuários](#51-usuários)). Não existe cadastro aberto.

## 2. Entrar no sistema

- O login é o e-mail institucional. A senha inicial vem no e-mail de boas-vindas; nas contas de escola, é o INEP da escola.
- **Esqueci minha senha**, na tela de entrada, envia um link de redefinição. O link vale por 60 minutos e só pode ser usado uma vez.
- Para trocar a senha estando logado: menu do usuário, **Perfil**, **Alterar Senha** (mínimo de 6 caracteres; pelo link de redefinição, mínimo de 8).
- O nome da escola em que se está trabalhando aparece sempre no alto da tela. O administrador troca de escola pelo seletor ali mesmo, e pode marcar escolas favoritas para encontrá-las mais rápido.
- Cada tela tem um tutorial curto que abre na primeira visita e pode ser reaberto pelo botão de ajuda no topo. O botão **Suporte**, ao lado, abre um chat que tira dúvidas sobre o uso e, se não resolver, abre um chamado para a equipe técnica (até 3 fotos; Ctrl+V cola um print).

## 3. Montando o horário de uma escola

Os itens do menu são numerados na ordem em que o trabalho deve ser feito. Cada etapa usa o que foi cadastrado na anterior, então não vale pular. O **Painel** mostra o mesmo caminho e o que já está pronto.

```
1 Turno > 2 Ensino > 3 Componentes > 4 Professores > 5 Série > 6 Turmas > 7 Gerar Horário
```

### Passo 1 - Turno

O turno é o período em que a escola funciona (Matutino, Vespertino, Noturno). A escola já começa com os três criados.

1. Nos três pontinhos do turno, escolha **Horários**.
2. Preencha início e fim de cada aula. Onde houver recreio, ligue a chave **Intervalo** na aula anterior a ele.
3. Clique em **Salvar Configuração**.
4. Use a chave **Status** para deixar ativos só os turnos que a escola usa.

Os horários precisam estar certos ao minuto. É com eles que o sistema impede que um professor que trabalha em dois turnos, ou em duas escolas, tenha aulas que se sobrepõem.

### Passo 2 - Ensino

As etapas de ensino que a escola oferece (Ensino Fundamental, Ensino Médio, EJA...). Cadastre só as que a escola tem, com nome e sigla.

### Passo 3 - Componentes

As disciplinas. A lista já traz as mais comuns. A **sigla** é o que aparece no quadro, então vale conferir. Cadastre todas antes de seguir, porque professores e séries dependem delas.

### Passo 4 - Professores

**Adicionar Professor** abre a ficha:

- CPF, nome completo, **nome para o horário** (versão curta que aparece na grade) e e-mail institucional;
- **Aulas Semanais**: quantas aulas o professor pode dar por semana nesta escola;
- **Turnos de Atuação** e **disciplinas** que ele leciona;
- opcionalmente, limites por matéria: máximo de aulas no mesmo dia e máximo de aulas seguidas.

Na lista, os ícones de cada professor servem para: enviar o link de restrições por e-mail, editar a ficha, abrir as restrições e excluir.

**Restrições de horário.** Escolha uma ferramenta no topo e clique nos horários da grade:

| Marcação | Efeito na geração |
|---|---|
| Indisponível | Nunca recebe aula. |
| Planejamento Coletivo | Nunca recebe aula (reunião da escola). |
| Livre Docência | Nunca recebe aula. São os períodos da semana reservados para estudo e planejamento; o contador no rodapé mostra quantos já foram marcados. |
| Planejamento | O sistema evita, mas usa se não houver outra saída. |
| Dias preferidos | O sistema tenta concentrar as aulas nesses dias, mas pode ajustar. |

**Link para o professor.** Em vez de preencher as restrições pela escola, dá para enviar um link por e-mail. O professor abre sem precisar de senha, marca os horários e envia. O link vale por 48 horas e só pode ser respondido uma vez; depois disso, envie outro.

### Passo 5 - Série

A série é o modelo de grade de um ano: quantas aulas de cada disciplina as turmas daquele ano têm por semana.

1. **Adicionar Série**: nome (ex.: 6º Ano), etapa de ensino e turno.
2. Nos três pontinhos do cartão, **Carga Horária**. Informe as aulas semanais de cada disciplina. O **Total** é quantas aulas cabem na semana do turno; o **Saldo** é quanto falta distribuir. O normal é o saldo chegar a zero, e aí o cartão mostra **C. H. Presencial OK**.
3. Se a série tiver horários em que não pode haver aula, ou aulas não presenciais, marque-os na aba **Restrições** da série (Bloqueio ou Aula Não Presencial). Sem nenhuma marcação, as aulas não presenciais vão para o contraturno.

### Passo 6 - Turmas

A turma é a turma de verdade (6º Ano A) e segue a série.

1. **Adicionar Turma**: escolha a série e a letra.
2. **Alocar Professores**: para cada disciplina, escolha quem dá a aula. Ao lado do nome aparece quantas aulas o professor já tem e o limite dele.
3. Todas as disciplinas precisam ter professor. A turma fica com **Alocação completa** quando estiver tudo certo.

O botão do cadeado trava uma aula num dia e horário fixos. Use só quando for realmente obrigatório: cada aula travada reduz as opções do sistema e pode impedir que a grade feche.

### Passo 7 - Gerar Horário

1. Escolha o turno, ou **Todos os Turnos**.
2. Antes de gerar, abra **Checklist de Dados**. Ele confere turnos, carga horária das séries e alocação dos professores. Resolva o que estiver em vermelho.
3. **Gerar Nova Grade** e dê um nome à versão (ex.: Horário V1).
4. Escolha a **geminação**: quais disciplinas podem ter aula dupla. Por padrão vem ligada para disciplinas com 3 aulas ou mais na semana.
5. **Começar Processamento.**

A geração pode levar de segundos a alguns minutos, e roda no servidor: dá para fechar a página e voltar depois. Ela pode ser interrompida pelo botão **Interromper**. Se a grade estiver difícil de fechar, a tela explica o motivo (**Por que está difícil**), em geral professor sem horário livre suficiente.

A grade gerada entra no histórico como **Rascunho**, visível só para a equipe da escola. Gere quantas versões quiser. Também é possível **duplicar** uma versão ou **regerar** a partir de outra, mantendo o que já estava bom.

Se alguma aula ficar de fora, a grade mostra as pendências e a opção de **alocar com trocas**, que procura uma combinação de trocas para encaixá-la sem criar choque.

Em **Ver Grade** dá para ver turma por turma, todas as turmas ou o dia inteiro da escola lado a lado.

### Refino de Horário (ajuste manual)

Para mexer numa grade em rascunho:

1. Abra **Refino de Horário**, escolha a grade e a turma (ou o professor, ou o horário).
2. Clique em uma aula para selecioná-la. Clique em outra para trocar as duas, ou num espaço vazio para mover.
3. O **Painel de Impacto**, à direita, mostra antes de confirmar se a mudança gera choque de turma, choque de professor ou fere alguma restrição. Mudanças que quebram regra são bloqueadas.

### Publicar

Com a grade pronta, abra-a em Gerar Horário e clique em **Publicar Grade Oficial**. O status passa a **Oficializado** e o horário aparece no Painel e na consulta pública. Para corrigir algo depois, use **Reverter para Rascunho**, ajuste e publique de novo.

Na mesma tela: exportar para Excel, gerar PDF ou imprimir.

## 4. Depois de publicar

- **Visualizar Horário**: consulta do horário oficial por turma ou por professor. Na visão por professor aparecem também os horários bloqueados e de livre docência.
- **Relatórios**:
  - *Checklist*: situação dos dados cadastrados;
  - *Carga horária docente*: aulas atribuídas x carga disponível de cada professor;
  - *Mapa de disponibilidade docente*: em cada horário, quantos professores estão impedidos e por quê. É o primeiro lugar a olhar quando uma grade não fecha.
- **Substituições**: informe o professor ausente, o dia e o turno. O sistema lista as aulas dele naquele dia e os professores da escola que estão livres (sem aula e sem planejamento) em cada horário. Funciona só com grade publicada.

### Situação das grades

| Status | Significado |
|---|---|
| Rascunho | Versão de trabalho. Só a equipe vê. |
| Oficializado | Publicada. Aparece na consulta pública. |
| Pré-produção | Estado temporário durante a geração de vários turnos. Se ficar parada assim, a geração foi interrompida no meio; pode ser excluída. |

## 5. Gestão (somente administradores)

### 5.1 Usuários

**Gestão > Usuários.** Lista com busca por nome, e-mail, escola ou regional (ignora acento e maiúscula) e filtros por regional, função e status.

**Criar um usuário:** nome, e-mail, senha, função (Administrador ou Usuário) e regional. Para *Usuário*, vincule a escola; a regional passa a ser a da escola. Para *Administrador*, a escola é opcional e é possível marcar escolas favoritas. A pessoa recebe um e-mail de boas-vindas com o login e a senha.

**Senha inicial.** Quem define é o administrador que cria a conta, seja na tela ou na planilha:
- usuário vinculado a uma escola: o INEP da escola;
- usuário sem escola (sede, regional): uma senha criada pelo administrador.

A senha é temporária. O e-mail recomenda trocá-la pelo Perfil, mas a troca não é obrigatória.

**Cadastro em lote:** botão de importação na mesma tela. Baixe o modelo (traz uma aba de instruções e a lista de regionais válidas), preencha e envie um `.xlsx`, `.xls` ou `.csv` com até 500 linhas. A escola pode ser informada pelo INEP ou pelo nome. O sistema mostra uma prévia linha a linha antes de gravar; linhas com erro (e-mail repetido, escola não encontrada, senha curta) são puladas e as demais são importadas. A coluna de senha segue a mesma regra: INEP para usuários de escola, senha definida pelo administrador para os demais. Se ficar em branco, o sistema gera uma aleatória, que aparece no relatório final para baixar. O envio de e-mail é opcional.

**Menu de cada linha (...):**
- *Permissões*: trocar função, escola, regional e favoritas;
- *Suspender / Ativar*: o usuário suspenso vê uma tela de bloqueio ao entrar;
- *Excluir usuário*: apaga a conta e o perfil. Horários e cadastros da escola não são afetados. Não tem volta.

O sistema não deixa o administrador suspender ou excluir a própria conta.

### 5.2 Unidades

**Gestão > Unidades.** Cadastro das escolas: nome, INEP, regional e cidade (obrigatórios), classificação e localização. Uma escola com usuários vinculados não pode ser excluída; remova os vínculos antes.

### 5.3 Auditoria

**Gestão > Auditoria.** Visão da rede inteira:

- quantas unidades já publicaram horário, quantas só têm rascunho e quantas nunca geraram grade, com taxa de implantação por regional;
- lista de escolas com situação por turno, filtro por nome, regional e situação;
- grades presas em pré-produção (geração interrompida);
- **limpeza de rascunhos**: de uma escola, ou em lote para todos os rascunhos com mais de N dias. O sistema mostra o resumo do que será apagado antes de confirmar. Grades publicadas não são tocadas.
- **Comunicado por e-mail**: envia uma mensagem institucional para todos os usuários ou para uma seleção. Cabeçalho e rodapé da SEDUC são incluídos automaticamente; há uma etapa de revisão antes do envio.

### 5.4 Chamados

**Gestão > Chamados.** Chamados abertos pelo botão Suporte, separados em abertos e respondidos. Cada chamado novo também chega por e-mail (para o endereço em `SUPORTE_EMAIL`) com um botão que leva direto à página de resposta. A resposta aparece para quem abriu o chamado na próxima vez que entrar, e também segue por e-mail.

## 6. Problemas comuns

**O usuário não consegue entrar.** Confira em Gestão > Usuários se ele existe, com o e-mail certo, e se não está suspenso. Se estiver tudo certo, peça para usar *Esqueci minha senha*. No servidor, `node scripts/diagnostico-login.js email@seduc.to.gov.br` diz exatamente qual é o problema (conta inexistente, sem senha ou senha errada).

**Usuário entra e não vê nada / vê "selecione uma escola".** Usuário comum precisa estar vinculado a uma escola. Ajuste em Permissões.

**A grade não fecha (aulas ficam de fora).** Quase sempre é cadastro, não o sistema. Nesta ordem:
1. Checklist de Dados sem pendências;
2. Relatório *Mapa de disponibilidade*: procure horários em que sobram poucos professores livres;
3. professores com carga semanal próxima do limite e muitas restrições, ou com livre docência no mesmo dia que outros da mesma área;
4. aulas travadas com cadeado;
5. geminação ligada em disciplina que não precisa.

Depois de gerar, a opção *alocar com trocas* e o Refino costumam resolver as últimas aulas.

**O professor diz que o link expirou.** O link vale 48 horas e uma resposta. Envie outro pela lista de professores.

**E-mails não chegam.** Verifique a pasta de spam e as variáveis `SMTP_*` do servidor. Erros de envio aparecem no log do processo (ver [seção 11](#11-logs-e-scripts-de-diagnóstico)).

**Uma tela nova dá erro ou não salva depois de uma atualização.** Provavelmente falta aplicar uma migration no banco. Ver [seção 10](#10-banco-de-dados-e-migrations).

---

# Parte 2 - Operação e manutenção

## 7. Como o sistema é montado

| Camada | Tecnologia |
|---|---|
| Aplicação | Next.js 15 (App Router) + TypeScript, React 19 |
| Interface | Tailwind CSS + shadcn/ui (Radix) |
| Banco | PostgreSQL, acessado direto pelo servidor (node-postgres) |
| Autenticação | NextAuth (Auth.js), senhas em bcrypt |
| Geração de horário | Motor próprio (`src/lib/timetabling.ts`) rodando em worker threads |
| E-mail | Nodemailer via SMTP |
| Chat de suporte | Google Gemini (opcional) |
| Exportação | xlsx (Excel) e PDF |

Em produção o sistema roda numa VM do Estado, atrás do proxy da SEDUC, com o PostgreSQL na mesma máquina e o processo Node gerenciado pelo pm2. A VM não depende de serviços de nuvem para funcionar; só o chat de suporte (Gemini) e o envio de e-mail precisam de saída de rede.

O navegador nunca fala com o banco. Toda leitura e gravação passa por Server Actions (`actions.ts` de cada tela), e cada uma checa sessão, perfil e escola em `src/lib/auth/guards.ts` antes de tocar no banco. A separação entre escolas é feita nessa camada, não no banco.

A geração de horário roda em threads separadas (`workers/`, compiladas de `src/lib/timetabling*.ts` por `npm run build:worker`). Um trabalho de geração fica registrado na tabela `geracao_jobs`, por isso continua mesmo que o usuário feche a página.

## 8. Variáveis de ambiente

Ficam em `.env.local`, na raiz do projeto. Esse arquivo não é versionado e nunca deve ser. O modelo, sem valores, é o [.env.example](.env.example).

**Obrigatórias**

| Variável | Para quê |
|---|---|
| `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` | Conexão com o PostgreSQL. Alternativa: `DATABASE_URL`. |
| `AUTH_SECRET` | Chave do NextAuth para assinar as sessões. Trocar desloga todo mundo. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Servidor de e-mail. Sem elas, nenhum e-mail sai (boas-vindas, senha, link do professor, chamados). `SMTP_PORT` padrão: 465. |

**Opcionais**

| Variável | Padrão | Para quê |
|---|---|---|
| `SMTP_FROM` | `"SHETO" <no-reply@seduc.to.gov.br>` | Remetente dos e-mails. |
| `APP_BASE_URL` | `https://sheto.seduc.to.gov.br` | Endereço usado nos links dos e-mails. Lida em tempo de execução: basta editar e reiniciar. |
| `SUPORTE_EMAIL` | `sheto@seduc.to.gov.br` | Quem recebe os chamados. |
| `GEMINI_API_KEY_1`, `_2`, `_3` | - | Chaves do chat de suporte, usadas em rodízio. Sem nenhuma, o chat vai direto para a abertura de chamado. |
| `GEMINI_MODELOS` | lista interna | Modelos do Gemini, separados por vírgula, em ordem de preferência. |
| `PG_POOL_MAX` | 10 | Conexões simultâneas com o banco. |
| `SHETO_WORKERS` | nº de CPUs - 2 (máx. 6) | Threads de geração de horário. |
| `SHETO_TEMPO_MAX_TURNO_S` | 7200 | Tempo máximo de geração por turno, em segundos. |
| `SHETO_WORKER_TIMEOUT_MS` | 600000 | Tempo máximo de uma rodada de um worker. |
| `SHETO_LOG_PATH` | `./log.txt` | Arquivo de log do motor. |
| `SHETO_LOG_MAX_MB` | 20 | Tamanho do log antes de girar para `log.txt.1`. |

As demais `SHETO_*` que aparecem no código são ajustes finos do motor para testes e medição; não precisam ser definidas em produção.

## 9. Atualizar a produção

Na VM, a partir da pasta do projeto:

```bash
git pull
npm ci
# aplique as migrations novas ANTES de reiniciar (ver seção 10)
npm run build
pm2 restart <nome-do-processo>   # pm2 list mostra o nome
```

- `npm run build` também recompila os workers da geração. Não pule.
- Leia a seção **Ao atualizar** do [CHANGELOG.md](CHANGELOG.md) antes de subir: ali estão as migrations obrigatórias de cada entrega. Subir código que espera uma coluna que ainda não existe quebra a tela correspondente.
- Para conferir o build sem derrubar um servidor de desenvolvimento em execução, use `npm run build:check`.

## 10. Banco de dados e migrations

As alterações de estrutura do banco ficam em `migrations/`, uma por arquivo, com a data no nome. **Elas não são aplicadas sozinhas.** Um arquivo estar no repositório não quer dizer que a mudança está no banco.

Para aplicar (usa o `.env.local`, não precisa de `psql`):

```bash
node scripts/aplicar-migration.js 20261026_profiles_regional.sql --simular   # roda e desfaz
node scripts/aplicar-migration.js 20261026_profiles_regional.sql             # grava
```

O script roda tudo dentro de uma transação: ou aplica inteiro, ou não aplica nada. Sempre rode primeiro com `--simular`.

Para saber se uma migration já foi aplicada, confira se a coluna ou tabela que ela cria existe:

```sql
select column_name from information_schema.columns
 where table_name = 'profiles' and column_name = 'regional';
```

Regras:
- nunca edite uma migration já aplicada; crie outra;
- o repositório não contém o esquema completo do banco, só as alterações. Para montar um ambiente novo é preciso partir de um dump do banco de produção (`pg_dump`). Os scripts em `migracao/` documentam como isso foi feito na saída do Supabase;
- faça backup antes de qualquer migration em produção:

```bash
pg_dump -Fc -h localhost -U <usuario> -d sheto -f sheto-AAAAMMDD.dump
```

**Tabelas principais**

| Tabela | Conteúdo |
|---|---|
| `escolas` | Unidades escolares (INEP, nome, regional, cidade) |
| `profiles` / `auth.users` | Perfil (função, escola, regional, ativo) e credenciais. Não há chave estrangeira entre as duas; apague sempre pelas telas. |
| `turnos` | Turnos e horários de cada aula (JSON) |
| `niveis_ensino`, `componentes_curriculares` | Etapas de ensino e disciplinas |
| `professores`, `professores_componentes` | Professores (com `restricoes` e `livre_docencia` em JSON) e as disciplinas de cada um |
| `series`, `series_componentes` | Séries e carga horária por disciplina |
| `turmas`, `turmas_professores`, `turmas_aulas_fixas` | Turmas, alocação e aulas travadas |
| `horarios`, `horario_aulas` | Versões de grade (status) e suas aulas |
| `geracao_jobs` | Gerações em andamento ou concluídas |
| `chamados`, `chamados_anexos` | Chamados abertos pelo Suporte e suas fotos |

## 11. Logs e scripts de diagnóstico

- **Log do processo:** `pm2 logs <nome-do-processo>`. Erros das Server Actions, de e-mail e de banco aparecem aqui.
- **Log do motor de geração:** `log.txt` na raiz (ou `SHETO_LOG_PATH`). Registra cada geração e, quando falha, o diagnóstico completo do lote. Gira sozinho ao atingir 20 MB.

Scripts em `scripts/`. Os `.js` rodam com `node`, os `.ts` com `npx tsx`. Todos leem o `.env.local`.

| Script | Uso |
|---|---|
| `aplicar-migration.js` | Aplica uma migration (ver seção 10). |
| `diagnostico-login.js [email] [senha]` | Explica por que um login falha. Não grava nada. |
| `verificar-jsonb.js [--reparar]` | Confere colunas JSON gravadas com formato errado. Só altera com `--reparar`. |
| `testar-refino.ts <horario_id>` | Lista choques de professor numa grade salva. |
| `testar-preenchimento.ts <horario_id>` | Testa o preenchimento automático de vagas numa grade, sem gravar. |
| `verificar-sequencias.ts <horario_id>` | Aponta aulas seguidas demais da mesma disciplina numa grade. |
| `diagnostico-export.ts [horario_id]` | Gera a exportação em Excel e confere o conteúdo. |
| `verificar-geminacao.js` (`npm run verificar:geminacao`) | Testa as regras de aula dupla do motor, sem banco. |
| `verificar-certificado.ts` | Testa o diagnóstico de "grade impossível", sem banco. |
| `verificar-features.ts` | Testa as funções recentes contra o banco, tudo desfeito no final. |
| `bancada-motor.ts` | Mede o desempenho do motor em escolas de referência. |
| `comparar-ambientes.sql` | Compara a disponibilidade de professores entre dois bancos (via `psql`). |

## 12. Ambiente de desenvolvimento

**Requisitos:** Node.js 20 ou superior, PostgreSQL 14 ou superior com uma cópia do banco.

```bash
git clone https://github.com/SHETO-Gaust/SHETO.git
cd SHETO
npm install
cp .env.example .env.local   # e preencha (seção 8)
npm run dev        # http://localhost:9002
```

| Comando | O que faz |
|---|---|
| `npm run dev` | Compila os workers e sobe o servidor de desenvolvimento na porta 9002 |
| `npm run build` | Build de produção |
| `npm run build:check` | Build de verificação numa pasta separada, sem afetar o `dev` |
| `npm run start` | Serve o build de produção |
| `npm run typecheck` | Checagem de tipos |
| `npm run lint` | Lint |

O build não falha por erro de tipo nem de lint (está configurado assim em `next.config.ts`). Rode `typecheck` e `lint` antes de entregar. Não há suíte de testes automatizados; os scripts da seção 11 cumprem parte desse papel.

**Estrutura**

```
src/
  app/
    (app)/            telas com login, uma pasta por módulo
      <modulo>/
        page.tsx              busca os dados no servidor
        <modulo>-client.tsx   parte interativa
        actions.ts            todas as gravações (Server Actions)
    horarios/         consulta pública
    restricoes/[token]/  formulário do professor (sem login)
    login/, esqueci-senha/, redefinir-senha/
  lib/
    timetabling.ts        motor de geração
    geracao/              orquestração, gravação e diagnóstico da geração
    refino-horario.ts     busca de trocas no refino
    auth/                 NextAuth, guards e regras de senha
    permissoes.ts         o que cada função pode acessar
    db/                   conexão e tradutor de consultas para SQL
    mail.ts               todos os e-mails do sistema
  components/ui/          componentes shadcn/ui
migrations/               alterações do banco (aplicação manual)
scripts/                  manutenção e diagnóstico
workers/                  motor compilado (gerado pelo build)
```

**Convenções que evitam retrabalho**

- Toda Server Action nova precisa chamar um guard de `src/lib/auth/guards.ts`. Sem isso, ela fica acessível sem login.
- Um módulo novo precisa entrar em `src/lib/permissoes.ts` para usuários comuns o verem; se esquecer, ele fica restrito a administradores.
- A camada `src/lib/db/` imita a sintaxe `.from().select()` do Supabase. Coluna que não está no `.select()` chega como `undefined` sem erro nenhum. Quando uma regra parecer ignorada, confira o select primeiro.
- Leia sempre o `error` que volta das consultas. Várias falhas silenciosas do passado vieram de `const { data } = await ...` sem checar o erro.
- Registre mudanças relevantes no [CHANGELOG.md](CHANGELOG.md), incluindo as migrations necessárias em **Ao atualizar**.

---

Projeto de uso interno da Secretaria da Educação do Estado do Tocantins.
