# Changelog

Mudanças relevantes do SHE (Sistema de Horário Escolar).

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).
O projeto ainda não tem versões publicadas; esta seção cobre o que a branch
`All_In` acumulou sobre a `main`.

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
