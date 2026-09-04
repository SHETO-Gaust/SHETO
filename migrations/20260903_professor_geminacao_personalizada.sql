-- Geminação personalizada por professor, POR MATÉRIA.
--
-- Até aqui a geminação era decidida uma única vez, por COMPONENTE, na tela de
-- gerar horário: "Matemática geminada 2x" valia para todos os professores de
-- Matemática. Na prática a escola negocia isso com cada docente, e disciplina
-- por disciplina — um aceita dobradinha em Matemática, e o mesmo recusa em
-- Projeto de Vida.
--
-- Este campo é o veredito daquele professor NAQUELA matéria: onde houver
-- entrada, ela vence a configuração da tela de geração em todas as turmas em
-- que ele dá aquela disciplina. Matéria sem entrada (ou professor com o campo
-- nulo) continua seguindo a tela.
--
-- Formato:
--   { "<componente_id>": { "max_consecutivas": 2|3, "max_no_dia": 2..5 }, ... }
--   NULL = sem personalização nenhuma.
--
-- `src/lib/geminacao-professor.ts` é a única leitura deste campo, e aceita
-- também o formato da primeira versão (regra única na raiz do objeto), que
-- passa a valer para todas as matérias do professor.
ALTER TABLE professores
  ADD COLUMN IF NOT EXISTS geminacao_personalizada jsonb;

COMMENT ON COLUMN professores.geminacao_personalizada IS
  'Geminação combinada por matéria: {componente_id: {max_consecutivas:2|3, max_no_dia:2..5}}. NULL = segue a configuração da tela de geração.';
