# Changelog

Mudanças relevantes do SHE (Sistema de Horário Escolar).

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).
O projeto ainda não tem versões publicadas; esta seção cobre o que a branch
`All_In` acumulou sobre a `main`.

---

## [Não lançado] — branch `All_In`

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
