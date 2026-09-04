-- ============================================================================
--  Geracao de horario em segundo plano
-- ============================================================================
--  Ate aqui o laco de tentativas vivia no NAVEGADOR: a tela chamava a Server
--  Action `gerarLoteHorario` uma vez por lote, centenas de vezes seguidas.
--  Fechar a aba matava a geracao e jogava fora todo o processamento -- e, na
--  geracao multi-turno, deixava os turnos ja concluidos presos em
--  'pre_producao', porque a conversao para 'em_rascunho' so acontecia no fim.
--
--  Esta tabela e' o estado da geracao. O laco passa a rodar no servidor e a
--  tela vira um observador: ela le esta linha para saber o que esta
--  acontecendo, e grava `cancelamento_solicitado` para pedir a parada.
--
--  Por que o estado mora no banco e nao na memoria do processo:
--    1. a tela precisa reencontrar a geracao depois de o usuario fechar a aba;
--    2. se o pm2 estiver em modo cluster, o poll pode cair em outra instancia
--       -- que nao teria nada em memoria para responder;
--    3. o `heartbeat` e' o que permite descobrir que o processo dono do job
--       morreu (ver o status 'interrompido' abaixo).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.geracao_jobs (
  id                      uuid PRIMARY KEY,
  escola_id               bigint NOT NULL REFERENCES public.escolas(id) ON DELETE CASCADE,
  criado_por              uuid,

  -- Turnos a gerar, na ordem. Um unico job cobre a opcao "Todos os Turnos".
  turno_ids               uuid[] NOT NULL,

  -- nome base do horario, configuracao de geminacao e demais flags da tela.
  config                  jsonb NOT NULL DEFAULT '{}'::jsonb,

  status                  text NOT NULL DEFAULT 'executando',

  -- Progresso, atualizado a cada rodada de tentativas (~11s).
  turno_atual_id          uuid,
  turno_atual_nome        text,
  turnos_concluidos       integer NOT NULL DEFAULT 0,
  tentativas              integer NOT NULL DEFAULT 0,
  orcamento               integer NOT NULL DEFAULT 100000,

  -- Menor numero de blocos nao alocados ja visto nesta geracao. E' o sinal que
  -- alimenta a parada por estagnacao: quando ele para de cair, insistir nao
  -- adianta e o job encerra com o diagnostico em vez de moer o orcamento todo.
  melhor_pendentes        integer,

  -- Pedido de parada vindo da tela. O orquestrador le na virada da rodada.
  cancelamento_solicitado boolean NOT NULL DEFAULT false,

  horarios_gerados        uuid[] NOT NULL DEFAULT '{}',

  -- Melhor grade incompleta encontrada, para o botao "Forcar Salvamento" da
  -- tela. Antes ela voltava junto da resposta do lote e vivia no estado do
  -- componente; com o laco no servidor, e' aqui que ela tem de esperar o
  -- usuario decidir. Nao entra na consulta de progresso -- sao centenas de
  -- aulas, e o poll roda a cada 3 segundos.
  aulas_parciais          jsonb,
  turno_parcial_id        uuid,
  turno_parcial_nome      text,

  erro                    text,
  diagnostico             jsonb,

  -- Renovado a cada rodada pelo processo que esta executando o job.
  heartbeat               timestamptz NOT NULL DEFAULT now(),
  created_at              timestamptz NOT NULL DEFAULT now(),
  concluido_em            timestamptz,

  CONSTRAINT geracao_jobs_status_check CHECK (
    status = ANY (ARRAY['executando', 'concluido', 'falhou', 'cancelado', 'interrompido'])
  )
);

-- Uma geracao por unidade de cada vez.
--
-- A regra e' do banco, e nao da aplicacao, de proposito: dois cliques rapidos
-- no botao (ou dois usuarios da mesma escola) chegariam em duas requisicoes
-- concorrentes, e uma checagem "select depois insert" nao segura isso. Aqui a
-- segunda insercao falha com 23505 e a action traduz a mensagem.
CREATE UNIQUE INDEX IF NOT EXISTS geracao_jobs_um_ativo_por_escola
  ON public.geracao_jobs (escola_id)
  WHERE status = 'executando';

-- Usado pela tela ("qual foi a ultima geracao desta unidade?").
CREATE INDEX IF NOT EXISTS idx_geracao_jobs_escola
  ON public.geracao_jobs (escola_id, created_at DESC);

COMMENT ON TABLE  public.geracao_jobs IS 'Estado das geracoes de horario executadas em segundo plano.';
COMMENT ON COLUMN public.geracao_jobs.status IS 'executando | concluido | falhou | cancelado | interrompido (processo morreu no meio).';
COMMENT ON COLUMN public.geracao_jobs.heartbeat IS 'Renovado a cada rodada. Job executando com heartbeat velho = processo morto.';
COMMENT ON COLUMN public.geracao_jobs.melhor_pendentes IS 'Menor numero de blocos nao alocados ja visto. Alimenta a parada por estagnacao.';
COMMENT ON COLUMN public.geracao_jobs.cancelamento_solicitado IS 'Pedido de parada da tela; o orquestrador le na virada da rodada.';
