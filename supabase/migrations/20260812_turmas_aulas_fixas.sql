-- Travamento de aulas passa de SERIE para TURMA.
--
-- Antes, uma fixacao valia para todas as turmas da serie ao mesmo tempo: fixar
-- "MAT na terca, 3a aula" obrigava todas as turmas ao mesmo slot. Na pratica
-- cada turma tem a sua realidade (sala, laboratorio, professor), e essa amarra
-- e' uma das causas de grade que nao fecha.
--
-- A tabela e' renomeada em vez de recriada para que a FK
-- horario_aulas.aula_fixa_id continue valendo (102 linhas apontam para ela hoje).
--
-- O conceito de "aula coletiva" (compartilhada + professor_responsavel_id) sai
-- junto: quando as turmas tinham professores diferentes e nenhum responsavel
-- definido, o motor gravava professor_id NULL e a tela mostrava "SEM PROFESSOR"
-- numa escola em que todos os vinculos estavam corretos. Cada turma passa a ter
-- a sua aula, com o professor que ela ja tem alocado.
--
-- horario_aulas.compartilhada e horario_aulas.aula_compartilhada_id NAO sao
-- tocadas: as grades ja publicadas as usam e o refino continua movendo esses
-- grupos historicos juntos. O codigo novo apenas deixa de escreve-las.

BEGIN;

-- ── 1. Coluna nova ──────────────────────────────────────────────────────────
ALTER TABLE public.series_aulas_fixas
    ADD COLUMN IF NOT EXISTS turma_id uuid;

-- As restricoes unicas do escopo antigo saem AGORA, nao no fim: elas sao por
-- (serie_id, ...) e barrariam a propria expansao do passo 2, em que a mesma
-- fixacao aparece uma vez por turma da serie.
ALTER TABLE public.series_aulas_fixas
    DROP CONSTRAINT IF EXISTS uq_serie_slot_unico,
    DROP CONSTRAINT IF EXISTS uq_serie_componente_slot;

-- ── 2. Backfill por expansao ────────────────────────────────────────────────
-- Cada fixacao da serie vira uma fixacao por turma daquela serie.
--
-- A primeira turma (por nome) reaproveita a LINHA ORIGINAL, preservando o id.
-- E' isso que mantem horario_aulas.aula_fixa_id apontando para algo valido nas
-- grades ja geradas. As demais turmas recebem copias novas.
WITH numerada AS (
    SELECT f.id AS fixa_id,
           t.id AS turma_id,
           row_number() OVER (PARTITION BY f.id ORDER BY t.nome) AS n
      FROM public.series_aulas_fixas f
      JOIN public.turmas t ON t.serie_id = f.serie_id
)
UPDATE public.series_aulas_fixas f
   SET turma_id = n.turma_id
  FROM numerada n
 WHERE n.fixa_id = f.id
   AND n.n = 1;

-- As copias. Roda depois do UPDATE e antes de qualquer insercao, entao o
-- row_number enxerga exatamente o mesmo conjunto de linhas de cima.
WITH numerada AS (
    SELECT f.id AS fixa_id,
           t.id AS turma_id,
           row_number() OVER (PARTITION BY f.id ORDER BY t.nome) AS n
      FROM public.series_aulas_fixas f
      JOIN public.turmas t ON t.serie_id = f.serie_id
)
INSERT INTO public.series_aulas_fixas
    (serie_id, componente_id, tipo_aula, dia_semana, aula_index,
     compartilhada, professor_responsavel_id, turma_id)
SELECT f.serie_id, f.componente_id, f.tipo_aula, f.dia_semana, f.aula_index,
       f.compartilhada, f.professor_responsavel_id, n.turma_id
  FROM numerada n
  JOIN public.series_aulas_fixas f ON f.id = n.fixa_id
 WHERE n.n > 1;

-- Fixacao de serie que nao tem turma alguma deixou de ter significado.
DELETE FROM public.series_aulas_fixas WHERE turma_id IS NULL;

-- ── 3. turma_id vira a chave do registro ────────────────────────────────────
ALTER TABLE public.series_aulas_fixas
    ALTER COLUMN turma_id SET NOT NULL;

ALTER TABLE public.series_aulas_fixas
    ADD CONSTRAINT series_aulas_fixas_turma_id_fkey
    FOREIGN KEY (turma_id) REFERENCES public.turmas(id) ON DELETE CASCADE;

-- ── 4. Sai o que era da serie ───────────────────────────────────────────────
DROP INDEX IF EXISTS public.idx_saf_serie_id;

ALTER TABLE public.series_aulas_fixas
    DROP COLUMN serie_id,
    DROP COLUMN compartilhada,
    DROP COLUMN professor_responsavel_id;

-- ── 5. Renomear e reindexar no escopo da turma ──────────────────────────────
ALTER TABLE public.series_aulas_fixas RENAME TO turmas_aulas_fixas;

ALTER TABLE public.turmas_aulas_fixas
    ADD CONSTRAINT uq_turma_slot_unico
    UNIQUE (turma_id, tipo_aula, dia_semana, aula_index);

CREATE INDEX IF NOT EXISTS idx_taf_turma_id
    ON public.turmas_aulas_fixas USING btree (turma_id);

COMMENT ON TABLE public.turmas_aulas_fixas IS
    'Aulas travadas em dia/horario fixo, por turma. A Fase 0 do gerador pre-aloca estes slots antes da busca aleatoria.';

-- RENAME TABLE nao renomeia indices nem constraints. Sem isto, quem for ler o
-- schema daqui a um ano encontra "series_aulas_fixas_pkey" numa tabela que se
-- chama turmas_aulas_fixas e perde tempo procurando a tabela que sumiu.
ALTER INDEX public.series_aulas_fixas_pkey RENAME TO turmas_aulas_fixas_pkey;
ALTER INDEX public.idx_saf_componente_id  RENAME TO idx_taf_componente_id;
ALTER TABLE public.turmas_aulas_fixas
    RENAME CONSTRAINT series_aulas_fixas_aula_index_check TO turmas_aulas_fixas_aula_index_check;
ALTER TABLE public.turmas_aulas_fixas
    RENAME CONSTRAINT series_aulas_fixas_tipo_aula_check TO turmas_aulas_fixas_tipo_aula_check;
ALTER TABLE public.turmas_aulas_fixas
    RENAME CONSTRAINT series_aulas_fixas_componente_id_fkey TO turmas_aulas_fixas_componente_id_fkey;
ALTER TABLE public.turmas_aulas_fixas
    RENAME CONSTRAINT series_aulas_fixas_turma_id_fkey TO turmas_aulas_fixas_turma_id_fkey;

COMMIT;
