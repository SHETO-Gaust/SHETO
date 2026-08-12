-- ============================================================================
--  horario_aulas.professor_id passa a aceitar NULL
-- ============================================================================
--  Sintoma: o botao "Salvar Grade Incompleta" sempre falhou com
--      null value in column "professor_id" of relation "horario_aulas"
--      violates not-null constraint
--
--  Causa: `salvarGrade` grava NULL de proposito quando a aula nao tem professor
--  definido (`professor_id` ausente ou o sentinela 'none' que vem da tela de
--  turmas) -- mas a coluna era `not null`. Ou seja, a opcao de salvar a grade
--  incompleta nunca pode funcionar em unidade nenhuma que tivesse ao menos um
--  componente sem professor vinculado, que e' justamente a situacao em que
--  alguem precisa dela.
--
--  O resto do sistema JA' foi escrito esperando o nulo: a grade e a exportacao
--  imprimem "SEM PROF.", o relatorio de conflitos filtra
--  `.not('professor_id', 'is', null)` e o refino testa `if (a.professor_id)`.
--  A restricao do banco era o unico ponto que discordava.
--
--  A chave estrangeira continua valendo: quando ha' professor, ele precisa
--  existir. NULL apenas passa a significar "aula sem professor definido".
-- ============================================================================

ALTER TABLE public.horario_aulas
    ALTER COLUMN professor_id DROP NOT NULL;

COMMENT ON COLUMN public.horario_aulas.professor_id IS
    'NULL = aula sem professor definido (componente sem vinculo na turma). A tela marca como "SEM PROFESSOR".';

-- O indice de conflito de professor passa a ignorar as aulas sem professor:
-- elas nao podem chocar com ninguem, e mante-las no indice so o engorda.
DROP INDEX IF EXISTS public.idx_horario_aulas_professor_turno_dia_aula;
CREATE INDEX IF NOT EXISTS idx_horario_aulas_professor_turno_dia_aula
    ON public.horario_aulas USING btree (professor_id, turno_id, dia_semana, aula_index)
    WHERE professor_id IS NOT NULL;
