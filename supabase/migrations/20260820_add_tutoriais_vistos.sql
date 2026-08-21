-- Guarda quais tutoriais de tela ja foram apresentados ao usuario.
--
-- Um booleano unico nao resolve: cada pagina se apresenta uma vez, entao
-- precisamos saber QUAIS ja apareceram, e nao apenas se alguma apareceu. Cada
-- elemento e o `id` de um tutorial de `src/lib/tutoriais/` ('turno',
-- 'professores', 'gerarhorarios'...).
--
-- Todo mundo comeca com o array vazio: nenhum tutorial visto, logo ele abre
-- sozinho na primeira visita de cada tela e nunca mais.
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS tutoriais_vistos text[] DEFAULT '{}';

COMMENT ON COLUMN public.profiles.tutoriais_vistos IS 'IDs dos tutoriais de tela ja apresentados ao usuario (marcados na abertura, independentemente de concluir ou pular). Vazio = nenhum apresentado ainda.';

-- Perfis criados antes desta migration ficariam com NULL em vez de '{}';
-- normalizamos para o codigo poder tratar a coluna sempre como array.
UPDATE public.profiles
SET tutoriais_vistos = '{}'
WHERE tutoriais_vistos IS NULL;
