-- =================================================================================
-- MIGRAÇÃO: Adiciona status 'pre_producao' à tabela horarios
-- =================================================================================
-- O status pre_producao é um estado provisório utilizado durante a geração
-- sequencial de horários (opção "Todos os Turnos"). Ele permite que o motor
-- de geração detecte conflitos entre turnos ainda não publicados, evitando
-- que aulas NP de um turno colidam com aulas presenciais do turno seguinte.
-- Após a geração completa, os registros pre_producao são convertidos para
-- em_rascunho automaticamente pelo sistema.
-- =================================================================================

-- Remove a constraint existente (se houver) e recria com o novo valor
ALTER TABLE public.horarios
    DROP CONSTRAINT IF EXISTS horarios_status_check;

ALTER TABLE public.horarios
    ADD CONSTRAINT horarios_status_check
    CHECK (status IN ('em_rascunho', 'publicado', 'pre_producao'));

-- Garante que nenhum registro fique preso em pre_producao por falha de sessão
-- (converte qualquer pre_producao órfão para em_rascunho de forma segura)
UPDATE public.horarios
SET status = 'em_rascunho'
WHERE status = 'pre_producao';
