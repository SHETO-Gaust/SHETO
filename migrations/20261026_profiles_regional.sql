-- Regional do usuario.
--
-- Ate aqui a regional so existia na escola (escolas.regional), e o usuario a
-- herdava pelo `ue`. Isso nao cobre quem nao tem escola vinculada - admin da
-- sede e equipe de regional -, que agora precisa aparecer na lista e no
-- filtro da aba Usuarios, e entrar pelo cadastro em lote.
--
-- Regra aplicada pelas actions de src/app/(app)/usuarios: com escola, a
-- regional e a da escola; sem escola, e a informada no cadastro (ou nula).
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS regional text;

COMMENT ON COLUMN public.profiles.regional IS 'Regional do usuario. Com escola vinculada (ue), espelha escolas.regional; sem escola, e a informada no cadastro.';

-- Perfis existentes com escola herdam a regional dela.
UPDATE public.profiles p
SET regional = e.regional
FROM public.escolas e
WHERE p.ue = e.id
  AND p.regional IS NULL;
