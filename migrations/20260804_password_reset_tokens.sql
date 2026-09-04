-- Tokens de redefinicao de senha ("esqueci minha senha").
--
-- O token nunca e' gravado em claro: guardamos apenas o SHA-256. Quem tiver
-- acesso de leitura ao banco (dump, backup, log) nao consegue redefinir a
-- senha de ninguem a partir desta tabela.

CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id          uuid PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user
  ON public.password_reset_tokens (user_id, created_at DESC);

COMMENT ON TABLE  public.password_reset_tokens IS 'Tokens de uso unico para redefinicao de senha via e-mail.';
COMMENT ON COLUMN public.password_reset_tokens.token_hash IS 'SHA-256 hex do token enviado por e-mail. O valor em claro so existe no link.';
COMMENT ON COLUMN public.password_reset_tokens.used_at IS 'Preenchido no momento do uso. Token com used_at nao vale mais.';
