-- Permite repetir nome completo e CPF de professor dentro da mesma escola.
--
-- Ate aqui a tabela tinha duas unicidades por escola:
--
--   professores_escola_id_nome_completo_key  UNIQUE (escola_id, nome_completo)
--   unique_cpf_per_school                    UNIQUE (escola_id, cpf)
--
-- Nenhuma das duas veio de migration versionada — elas nasceram no dump
-- original do banco, e por isso nao aparecem no historico deste diretorio.
--
-- Por que sair: a mesma pessoa pode ter mais de um vinculo na mesma unidade
-- (contratos/matriculas distintos, cargas separadas), e a escola precisa de um
-- cadastro para cada vinculo. E homonimos existem. As duas regras obrigavam a
-- inventar variacao no nome ou no CPF para contornar, o que suja justamente o
-- dado que identifica a pessoa.
--
-- O que NAO muda: o motor de geracao continua tratando dois cadastros com o
-- MESMO CPF como a mesma pessoa fisica na hora de detectar conflito de horario
-- (`getTeacherKey` em src/lib/timetabling.ts devolve `cpf:<digitos>` quando ha
-- CPF). Isso e o comportamento desejado — a pessoa nao pode estar em duas salas
-- ao mesmo tempo, tenha um cadastro ou tres. Cada cadastro continua com suas
-- proprias aulas disponiveis e suas proprias restricoes.

ALTER TABLE public.professores
    DROP CONSTRAINT IF EXISTS professores_escola_id_nome_completo_key;

DROP INDEX IF EXISTS public.unique_cpf_per_school;
