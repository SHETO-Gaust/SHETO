-- Adiciona coluna escolas_favoritas ao profiles para admins
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS escolas_favoritas text[] DEFAULT '{}';

COMMENT ON COLUMN public.profiles.escolas_favoritas IS 'Array de IDs de escolas favoritas (usado por admins para acesso rápido)';
