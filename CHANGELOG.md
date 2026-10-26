# Changelog

Mudanças relevantes do SHE (Sistema de Horário Escolar).

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).
O projeto ainda não tem versões publicadas; esta seção cobre o que a branch
`All_In` acumulou sobre a `main`.

---

## [Não lançado] — `All_In`, rodada de 26/10/2026

Gestão de usuários para o lançamento oficial: regional por usuário, busca e
filtros, exclusão e cadastro em lote por planilha. O e-mail de boas-vindas
deixa de soar como liberação de acesso.

### Adicionado

- **Regional do usuário** (`profiles.regional`). Usuário com escola herda a
  regional da escola (as actions gravam a dela, não a digitada); sem escola —
  admin da sede, equipe de regional — vale a informada no cadastro. Coluna nova
  na lista e campo nas telas de criar e editar, para todas as funções.
- **Busca e filtros na aba Usuários.** Busca por nome, regional, escola ou
  e-mail, sem diferenciar acento nem maiúscula; filtros por regional (inclusive
  "Sem regional"), função e status, com contador e "Limpar filtros".
- **Menu de ações (⋯)** em cada linha: Permissões, Suspender/Ativar e
  **Excluir usuário**. A exclusão pede confirmação e apaga conta (`auth.users`)
  e perfil numa transação só — sem FK entre as duas tabelas, apagar um lado
  deixaria login sem perfil. Horários e cadastros da escola não são tocados.
- **Cadastro em lote por planilha** (.xlsx/.xls/.csv, até 500 linhas).
  Modelo para baixar com aba de instruções e a lista de regionais válidas;
  prévia validada no servidor linha a linha (e-mail duplicado no banco ou na
  própria planilha, escola por INEP ou nome, regional, módulos, senha curta);
  linhas com erro são puladas, as demais importadas. Senha em branco é gerada
  pelo sistema; o envio do e-mail é opcional e o relatório final para baixar
  traz as senhas geradas. Escolas favoritas de admin não entram pela planilha.

### Alterado

- **E-mail de boas-vindas** vira boas-vindas ao SHETO (assunto "Bem-vindo(a) ao
  SHETO - Sistema de Horário Escolar"), com uma linha sobre o que o sistema faz.
  Quem não tem escola não recebe mais o bloco fictício "Administração Central /
  Seduc Sede" — só a regional, se houver. Campos passam a ser escapados no
  HTML, já que agora podem vir de planilha.

### Corrigido

- `createUser` engolia falha ao gravar o perfil e respondia sucesso: a conta
  existia, o usuário logava e não via nada. Agora a conta é desfeita e o erro
  aparece.
- E-mail já cadastrado chegava como "Erro no Auth: …" — o shim responde em
  português e a action só procurava `already registered`.
- O servidor passa a recusar que o admin exclua ou suspenda a própria conta
  (antes só dependia de ninguém clicar).

### ⚠️ Ao atualizar

- **Rodar a migration antes de subir o código:**
  `node scripts/aplicar-migration.js 20261026_profiles_regional.sql`.
  Sem a coluna, criar e editar usuário falham (o `update`/`upsert` grava
  `regional`). A migration já preenche a regional de quem tem escola.

### Verificação

- Leitura e validação da planilha testadas contra cabeçalhos variados
  ("E-mail", "Perfil", "INEP"), linha de título acima do cabeçalho, INEP como
  número, acento/caixa na regional e no nome da escola, duplicata no banco e
  dentro do arquivo, linha vazia, admin com escola e módulos.
- Select do shim conferido no banco local: `regional` e o join
  `escolas(id, escolar, regional)` voltam preenchidos.
- Build de produção (`scripts/build-check.js`) compila. Typecheck em 33 erros,
  todos pré-existentes e fora dos arquivos tocados (eram 37).
- **Não testado no navegador** — sem conta de teste local para logar.

---

## [Não lançado] — `All_In`, rodada de 14/09/2026

Commit `f776ff5`. Aula Não Presencial passa a poder ficar dentro do próprio
turno da série, e o Noturno destrava contraturno.

### Adicionado

- **Aula Não Presencial no próprio turno.** `series.restricoes` ganha um
  segundo valor ao lado de `proibido`: `nao_presencial`. A aba Restrições da
  série vira paleta de etiquetas (Bloqueio / Aula Não Presencial / Limpar),
  igual à tela de professores. Slot marcado sai da capacidade presencial e
  entra na NP — não é uma aula a mais, é uma presencial a menos que virou vaga
  de NP. Série sem marca nenhuma continua indo para o contraturno, então nada
  do que já está cadastrado muda de lugar.
- No motor, o modo novo é só `turno_np_id = turno.id` (o turno físico do
  próprio bloco) em vez do turno oposto. Restrições duras do professor e
  choque de horário passam a valer sobre o turno certo automaticamente. Essas
  aulas ignoram geminação, dias preferidos, sequência, espaçamento, teto
  diário e o teto do professor na turma (decisão do usuário) — mas continuam
  respeitando indisponibilidade, livre docência, planejamento coletivo e
  choque de professor, inclusive contra grades publicadas.
- Visualizador, exportação `.xlsx`, PDF e portal público passam a decidir a
  tabela pela grade do `turno_id` físico da aula, não mais pelo `tipo` — evita
  desenhar a mesma NP duas vezes (presencial e contraturno) quando ela mora no
  próprio turno.
- Sétimo cenário na suíte do motor: 5 NP emendadas na mesma sexta sem rigor de
  geminação/espaçamento, professor indisponível continua bloqueando, NP
  travada fica no próprio turno.

### Corrigido

- **O Noturno nunca teve contraturno.** `carga-horaria-sheet.tsx` só
  reconhecia "matutino"/"vespertino" ao detectar o turno oposto; qualquer
  outro nome (Noturno, ou escola que chama os turnos de "Manhã"/"Tarde") caía
  num `else` que zerava `hasContraturno` e desabilitava os dois campos de NP.
  Passa a usar `resolverTurnoOposto`, a mesma regra canônica que o resto do
  sistema já usava.
- `preencher-vagas` enumerava todo slot vazio como buraco sem consultar
  `series.restricoes` — preenchia horário que a série tinha fechado, e
  preenchia também os slots reservados para NP. `calcularAlocacao` aceitava
  qualquer slot vindo da tela sem essa checagem. Os dois passam pela mesma
  regra do motor agora.
- `contextoDaTurma` não trazia `restricoes` no select — sem a coluna, a
  validação de NP-no-próprio-turno respondia sempre "não" e liberava slot
  errado em silêncio.

### ⚠️ Ao atualizar

- Sem migration nova (a coluna `series.restricoes` já era jsonb). Dados
  existentes não mudam: hoje só há marcas `proibido` no banco, e as aulas NP
  já geradas continuam todas no contraturno.
- **Refino por drag-and-drop ainda não checa `series.restricoes`** — dá para
  arrastar uma NP para fora do slot marcado, do mesmo jeito que já dava para
  arrastar uma presencial para dentro de um `proibido`. Fica para depois.

### Verificação

- Sete cenários contra o motor compilado (geminação, indisponibilidade,
  travamento, regressão do contraturno).
- Conferido contra o banco de produção: `restricoes` só tinha `proibido` (336
  slots), `horario_aulas.turno_id` é `NOT NULL` sem nulos, e as 499 aulas NP
  existentes estão todas no contraturno — a troca de critério (tipo →
  turno_id) não move nenhuma delas.
- `bancada-motor`: 1344 fecha 3/3 com geminação 88/88; 1120 não fecha
  (melhor=2) — igual à linha de base do próprio script.
- `typecheck` com 33 erros, igual ao pré-existente antes da mudança.

---

## [Não lançado] — `All_In`, rodada de 11/09/2026 (Setembro V2)

Ainda sem commit. O teto diário da geminação personalizada passa a ser teto de
verdade, e o controle ganhou 1x nos dois lados.

### Adicionado

- **1x nos dois controles do acordo de geminação personalizada.** Em "Máximo de
  aulas consecutivas", 1x passa a existir e significa **sem geminação** para
  aquele professor naquela matéria — vence a tela mesmo quando ela pede
  dobradinha para os demais professores da disciplina. Em "Máximo de aulas no
  mesmo dia" o intervalo passa a ser 1x–4x (**5x saiu**, não fazia sentido para
  nenhum turno da rede).
- **Avisos discretos quando um lado trava o outro.** "No mesmo dia" em 1x
  desabilita e trava "consecutivas" em 1x (bloco de 2 já estoura um teto
  diário de 1); "consecutivas" acima de 1x desabilita o 1x de "no mesmo dia".
  As duas travas já existiam de um lado (`disabled` em "no mesmo dia"); o que
  faltava era a volta, e o texto explicando o motivo em ambas.
- Cenário 8 em `verificar-geminacao.js`: prova que o teto pessoal vence o piso
  aritmético da carga semanal — inclusive numa carga que torna a semana
  inevitavelmente incompleta sob aquele teto, o que o motor agora prefere a
  furar o combinado.

### Corrigido

- **"Máximo de aulas no mesmo dia" era piso, não teto.** `tetoDeAulasNoDia`
  deixava o piso aritmético (carga semanal ÷ dias do turno) e o default de dia
  longo (4 aulas/dia em turnos de 7+ aulas) **levantarem** o teto que o
  professor combinou — um acordo de "no máximo 3 de Matemática por dia" podia
  sair da geração com 4, em silêncio. Agora, quando o professor personaliza,
  o valor dele é absoluto: só uma aula já travada (Aula Fixa) naquele dia
  continua podendo superá-lo — é a única das quatro fontes que o motor de fato
  não pode desfazer. Relatado por uma escola: professora de Matemática, turno
  Integral, combinado 3x/dia, grade publicada com 4.

### ⚠️ Ao atualizar

- **Regere as grades de turmas com professor em geminação personalizada.**
  Grades publicadas antes desta correção podem ter mais aulas por dia daquela
  disciplina do que o professor combinou; a correção só age em geração nova.

### Verificação

- `npm run verificar:geminacao` — cenário 8 novo, os outros sete continuam
  passando. Revertido o motor a propósito para confirmar que o cenário 8
  reprova sem a correção (terça com 4 aulas de MAT) antes de restaurá-la.

---

## [Não lançado] — `All_In`, rodada de 04/09/2026

Nove commits (`a7c83f1`..`4ab85e7`). Geminação combinada com cada professor,
regeração de uma grade a partir de outra, e a saída do que restava do Supabase.

### ⚠️ Ao atualizar

- **Uma migration nova**: `20260903_professor_geminacao_personalizada.sql` —
  coluna `professores.geminacao_personalizada` (jsonb, nula por padrão). **Sem
  ela a geminação personalizada some em silêncio**: o campo volta `undefined`,
  o motor não vê acordo nenhum e a tela grava num lugar que não existe.
- **Duas migrations antigas estavam pendentes** e foram aplicadas nesta rodada:
  `20260820_add_tutoriais_vistos.sql` (sem ela o tutorial de tela reaparece a
  cada F5) e `20260827_professor_nome_cpf_repetidos.sql` (sem ela, cadastrar
  homônimo ou um segundo vínculo com o mesmo CPF estoura com mensagem errada).
  O código já as dava como feitas.
- **A pasta das migrations mudou de lugar**: `supabase/migrations/` →
  `migrations/`. Quem tiver script apontando para o caminho antigo precisa
  ajustar; `scripts/aplicar-migration.js` já foi.
- **Não rode `20260521_add_pre_producao_status.sql` de novo.** Ela termina com
  um `UPDATE` que rebaixa para rascunho todo horário em pré-produção. Já está
  aplicada.
- **A política de privacidade foi corrigida** e agora não afirma onde os dados
  são hospedados — dizia "plataforma Supabase", o que é falso há tempos. Vale
  uma revisão de quem sabe a resposta.

### Adicionado

**Geminação combinada por professor**

- Cada professor pode ter, **por matéria**, um acordo próprio de geminação:
  máximo de aulas seguidas (2x ou 3x) e máximo no mesmo dia (2x a 5x). Onde
  houver acordo, ele **vence** a configuração da tela de gerar horário nas
  turmas daquele docente — inclusive para ligar geminação que a tela deixou
  desligada.
- O alcance é o par professor+matéria: dois professores de Matemática saem com
  regras diferentes na mesma grade, e o mesmo professor pode aceitar dobradinha
  em Matemática e recusar em Projeto de Vida.
- Um pedido maior que a carga vira o maior bloco possível, não pendência:
  acordo de 3 numa disciplina de 2 aulas sai como par.
- A seção "Disciplinas Habilitadas" do cadastro ganhou uma seta. Fechada, lista
  as disciplinas marcadas com o resumo do acordo de cada uma; aberta, traz uma
  linha de configuração por disciplina que o professor leciona.

**Regerar uma grade a partir de outra**

- O botão de duplicar do card virou um modal com **duas ações**: Duplicar ou
  Regerar. Regerar abre a configuração da geração com aquela grade como ponto
  de partida.
- O resultado é uma grade **nova** — a original continua na lista, intacta, e a
  nova nasce como rascunho, com nome derivado da base ("Horário V1 (regerado)")
  e sem colidir com o `UNIQUE (escola_id, turno_id, nome)`.
- A grade sai o mais parecida possível com a base, já aplicando o que mudou no
  cadastro: professor novo, restrição nova, travamento novo. Medido na Escola
  Estadual Professora Elizângela Glória Cardoso, regerando depois de cadastrar
  livre docência e indisponibilidades: **80% das aulas no mesmo slot**, contra
  ~10% de uma geração do zero, e as 12 aulas em horário bloqueado da grade
  antiga caíram para 2 — as duas que o próprio usuário havia travado ali.

### Alterado

- **PDF do professor sai em paisagem**, como o de turmas. Em retrato as colunas
  dos dias ficavam estreitas demais para o nome da turma caber inteiro.
- **"Folga" virou "L.d."** na grade de restrições.
- **"Reunião de Fluxo" virou "Planejamento Coletivo"** em toda a interface:
  ferramenta, célula, relatório de gargalos e mensagens do motor. A chave
  gravada no banco continua `reuniao_fluxo` — as marcações já existentes seguem
  valendo.
- A opção "permitir mais de 2 aulas no mesmo dia para a mesma turma" **saiu da
  tela** de geração. O motor mantém o comportamento permissivo, que é o que ele
  sempre fez.
- **Saída do Supabase.** Não havia mais dependência nem import; restava o nome.
  `src/lib/supabase/server.ts` virou `src/lib/db/server.ts`, a variável
  `supabase` virou `db` em 45 arquivos, o cliente de browser (um stub que só
  lançava erro) foi apagado, e README, CLAUDE.md e a política de privacidade
  passaram a descrever o que o projeto é hoje.

### Corrigido

- **Destravar aula deixou de ser proibido quando já existe horário gerado.** A
  recusa não tinha lastro: a FK de `horario_aulas.aula_fixa_id` é
  `ON DELETE SET NULL`, e a aula apenas deixa de ser imóvel — continua onde
  está. Na prática a regra prendia o usuário: bastava gerar uma vez para o
  travamento virar permanente.
- **Salvar o cadastro do professor invalida o cache da geração.** Havia uma
  janela de 30 segundos em que salvar e clicar em "gerar" logo em seguida — o
  fluxo natural — rodava sobre o retrato de antes da edição. A regra recém-salva
  não valia naquela geração, sem erro e sem aviso. Vale para restrições, livre
  docência e disciplinas também, não só para a geminação.
- **O motor passou a de fato preservar a grade de referência.** Herdar uma grade
  já existia, mas era só um empurrão inicial: a semelhança ao fim do orçamento
  era 11%, contra 10% de uma geração do zero. A distância até a base entrou na
  função de custo como desempate estrito (abaixo de pendência e de geminação),
  as posições da base viraram preferência na remontagem, quem já está no lugar
  certo escapa da ruína, e a primeira grade perfeita deixou de encerrar a busca
  quando há referência — a resposta certa é a mais parecida, não a primeira.

### Verificação

- `npx tsx scripts/verificar-features.ts` — 40 verificações desta rodada contra
  o banco e o motor, gravando apenas dentro de transações que sofrem ROLLBACK.
- `npm run verificar:geminacao` (guarda do contrato de geminação e da regra do
  dia) continua passando inteiro após as mudanças no motor.

---

## [Não lançado] — branch `All_In` (rodadas anteriores)

55 commits, de 31/07/2026 a 31/08/2026. A `main` está inteiramente contida
nesta branch.

### ⚠️ Ao atualizar

- **Regere as grades.** As restrições da série não estavam sendo respeitadas
  (ver *Corrigido → Motor*). Grades geradas antes desta correção podem ter aula
  em horários que a série fechou; a correção só age em geração nova.
- **Uma migration nova**: `20260902_aplicar_rota_refino_colunas_completas.sql`,
  que acerta a função `aplicar_rota_refino` versionada com as 12 colunas de
  `horario_aulas` (o banco de produção já pratica isso; a migration é que estava
  para trás). Nenhuma coluna nova.
- **Confira o refino depois de atualizar.** Ele passou a enxergar as grades em
  rascunho dos outros turnos, então choques que antes ficavam invisíveis agora
  aparecem — e movimentos que antes eram aceitos podem ser recusados, com o
  motivo escrito na tela.
- Um **backup das branches** foi marcado em `backup/20260828-1023/*`.

### Adicionado

**Geração de horário**

- Geração roda em *worker thread*, com `log.txt` próprio do motor — fechar a
  aba não mata mais a geração, e o proxy da SEDUC não corta a requisição.
- Geração que **aprende** entre execuções, travamento por turma e **prova de
  inviabilidade** (certificado): quando não existe grade possível, o sistema
  diz qual cadastro impede, em vez de "não consegui em N tentativas".
- **Alocar com trocas** as aulas que a geração deixou de fora, e **um clique**
  que preenche as vagas restantes.
- Refino de horário ganhou os eixos de **turma** e de **horário**.
- Aulas da mesma matéria podem repetir no dia, desde que respeitem o
  espaçamento configurado.
- Capacidade real da série passa a descontar os slots proibidos.

**Relatórios e telas**

- **Relatório de Professores (Individual)** em PDF: a semana inteira do docente
  numa folha, com os turnos fundidos numa régua de horários única.
- **Moldura comum a todos os PDFs** — logo do sistema, nome da unidade, brasão
  do Estado e o mesmo rodapé das telas.
- Exportação passa a mostrar o que a grade escondia (choques e aulas fora da
  grade) e ganhou seleção em lote.
- **Tutorial guiado** por tela.
- Botão de acesso aos horários públicos na tela de login.
- Professor pode repetir nome e CPF dentro da mesma escola.
- Recuperação de senha ("esqueci minha senha").

**Infraestrutura**

- Migração de **Supabase para PostgreSQL local + NextAuth** (Fases 0–5), com
  autorização nas Server Actions no lugar do RLS.
- Bancada de medição do motor e script de comparação entre ambientes.
- `npm run build:check`: build de verificação numa pasta isolada, que não
  derruba o `npm run dev`.

### Corrigido

**Motor de geração**

- **Restrições da série voltam a valer.** O carregador da geração não pedia
  `series.restricoes` ao banco; o campo virava `undefined`, toda comparação com
  `proibido` dava falso, e a regra não era violada — ela não existia. O
  certificado tinha o mesmo furo em outra forma: calculava a capacidade pela
  grade bruta do turno, ignorando os slots fechados, e por isso não conseguia
  provar impossibilidades reais.
- Recompilar o motor não trocava o motor que estava rodando.
- Geminação entrega exatamente o bloco pedido na tela; grade lembrada não é mais
  devolvida fora do contrato de geminação.
- Reparo não cola mais aulas em sequência sem ninguém ter pedido geminação.
- Duas aulas geminadas mais uma solta deixaram de virar três aulas da mesma
  matéria no dia.
- O motor não acredita mais na memória quando ela diz que a grade está completa.

**Diagnóstico**

- Certificado não acusa mais professor por causa de grade salva em outro turno.
- Turmas de mesmo nome não colapsam no grafo do certificado.
- Mapa de disponibilidade não conta mais professor que o motor não pode usar.
- Pendência resolvida some da tela, e o painel para de se repetir.
- Grade completa não pode mais ser salva como "Com Pendências".
- **Dispensar** o painel de resultado passa a durar entre visitas.

**Telas**

- A grade do professor mostrava meia restrição e inventava um turno.
- Grade do **contraturno** só aparece quando a turma tem aula não presencial —
  antes, uma escola sem contraturno via uma tabela inteira vazia.
- Diálogo de impressão dos PDFs volta a abrir (a aba abria sem ele).
- Nome da escola no cabeçalho não aparece mais cortado.
- Coluna "Turnos Ativos" mostrava zero para escola com horário publicado.
- Tela "Alocar Professores" abria em branco sem explicar o motivo.

**Banco e integração**

- Quatro divergências do shim PostgREST que quebravam consultas e mutações:
  agregado `count` nos embeds, lista vazia em `.in()`/`.not(in)`, filtro em
  tabela relacionada descartado, e mutações que falhavam em silêncio.
- Timeouts no pool do Postgres — consulta pendurada travava o sistema inteiro.
- `escolas.id` sem *default* impedia cadastrar unidade.
- Auditoria zerava publicados por comparar `bigint` com tipos diferentes.
- `trustHost` no Auth.js para o deploy atrás do proxy da SEDUC.
- Nodemailer atualizado de 6.9.13 para 8.0.5.

### Alterado

- **Geração 3× mais rápida** na escola grande (22 turmas).
- Modo claro passa a ser o padrão; o modo escuro fica em `Ctrl+Shift+N`.
- Brasão do Estado do Tocantins no lugar da logo da SEDUC na tela de login.
- Imagem de fundo removida da área logada.

### Removido

- Dependências do Supabase (corte final da migração).
- Módulos de formações/inscrições, fora do escopo do build da VM.
