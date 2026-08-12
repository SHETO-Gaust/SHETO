-- ============================================================================
--  horarios.pendencias — o que o motor NÃO conseguiu alocar
-- ============================================================================
--  Uma grade salva com pendências guardava só as aulas que couberam. As que
--  ficaram de fora simplesmente não viram linha em `horario_aulas`, e a tela
--  mostrava uma célula vazia — sem dizer qual componente faltou nem por quê.
--  Quem abria o horário depois não tinha como saber se aquele buraco era um
--  intervalo previsto ou uma aula que o gerador não fechou.
--
--  O motor conhece cada pendência em detalhe (turma, componente, professor e o
--  motivo real da rejeição), mas isso vivia só no diagnóstico do job e morria
--  junto com ele. Aqui a lista passa a acompanhar o horário.
--
--  Formato: array de PendenciaDetalhada (ver src/lib/types.ts)
--    [{ turma_nome, disciplina_nome, professor_nome, tipo_aula, motivo_real }]
--  NULL = grade completa (nenhuma pendência). Grades salvas antes desta
--  migration ficam NULL, e a tela apenas não mostra o aviso.
-- ============================================================================

ALTER TABLE public.horarios
    ADD COLUMN IF NOT EXISTS pendencias jsonb;

COMMENT ON COLUMN public.horarios.pendencias IS
    'Aulas que o gerador não conseguiu alocar nesta grade (array de PendenciaDetalhada). NULL = grade completa.';
