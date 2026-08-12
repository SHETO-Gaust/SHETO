-- Memoria do gerador de horario.
--
-- Ate aqui cada geracao comecava do nada, mesmo quando a anterior tinha
-- terminado numa grade quase pronta e nada tinha mudado no cadastro. Estas duas
-- tabelas guardam o que a busca aprendeu para que a proxima execucao ja comece
-- adiantada.
--
-- Nenhuma das duas e' fonte de verdade: sao dicas. O motor revalida cada aula
-- herdada contra as restricoes atuais antes de aceita-la, e o que nao passa e'
-- simplesmente descartado. Apagar as duas tabelas nao quebra nada — so faz o
-- sistema voltar a comecar do zero.

BEGIN;

-- ── Memoria por escola e turno ──────────────────────────────────────────────
--
-- `impressao` e' o hash dos dados de entrada (turmas, cargas, vinculos de
-- professor, restricoes, travamentos e a configuracao do turno). Igual =
-- nada mudou desde a ultima geracao e a grade guardada vale inteira. Diferente
-- = a grade e' reparada, nao descartada: as aulas que continuam validas entram,
-- o resto vira pendencia e a busca recoloca.
CREATE TABLE IF NOT EXISTS public.geracao_memoria (
    escola_id     bigint      NOT NULL REFERENCES public.escolas(id) ON DELETE CASCADE,
    turno_id      uuid        NOT NULL REFERENCES public.turnos(id)  ON DELETE CASCADE,
    impressao     text        NOT NULL,
    melhor_grade  jsonb       NOT NULL,
    -- Quantos blocos faltavam nesta grade. 0 = fechou.
    pendentes     integer     NOT NULL DEFAULT 0,
    -- Pesos aprendidos por bloco: quantas vezes cada aula ficou de fora.
    -- Chave 'turma_id|componente_id|tipo'.
    pesos         jsonb       NOT NULL DEFAULT '{}'::jsonb,
    geracoes      integer     NOT NULL DEFAULT 1,
    atualizado_em timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (escola_id, turno_id)
);

COMMENT ON TABLE public.geracao_memoria IS
    'Melhor grade e pesos aprendidos por escola/turno. Ponto de partida da proxima geracao; sempre revalidada antes do uso.';

-- ── Padroes agregados da rede ───────────────────────────────────────────────
--
-- Serve para uma escola nova comecar menos cega. Entra APENAS como criterio de
-- desempate na ordenacao, depois de todas as restricoes e dos pesos locais —
-- nunca bloqueia nem forca nada.
--
-- REGRA DE PROJETO, nao negociavel: so contadores agregados. Nada de nome, id ou
-- CPF de professor, nada de nome de turma, nada de escola_id, nem na chave nem
-- no valor. O sistema isola dados por escola, e uma tabela que cruza unidades e'
-- exatamente onde vazamento acontece. As chaves sao categorias genericas, do
-- tipo 'componente=EDFIS|aula=8'.
CREATE TABLE IF NOT EXISTS public.geracao_padroes (
    chave         text        PRIMARY KEY,
    sucessos      bigint      NOT NULL DEFAULT 0,
    tentativas    bigint      NOT NULL DEFAULT 0,
    atualizado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.geracao_padroes IS
    'Contadores agregados entre todas as unidades. Somente categorias genericas: nunca professor, turma ou escola. Desligavel por SHETO_USAR_PADROES_GLOBAIS=0.';

COMMIT;
