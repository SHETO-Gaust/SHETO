-- Chamados de suporte.
--
-- O botao "Suporte" do cabecalho abre um chat com o Gemini. Quando a IA nao
-- resolve (ou o relato e de erro), a pessoa abre um chamado: mensagem,
-- prioridade e ate 3 fotos. O chamado vai por e-mail para a equipe do SHETO,
-- que responde em /chamados/[id]. A resposta aparece uma unica vez, num modal,
-- para quem abriu - `resposta_vista_em` marca que ja apareceu.
--
-- Nome, e-mail e escola sao copiados no momento da abertura (e nao so
-- referenciados): o chamado continua legivel mesmo se o usuario for excluido
-- ou trocar de escola. Por isso tambem nao ha FK para auth.users.

CREATE TABLE IF NOT EXISTS public.chamados (
  id                  uuid PRIMARY KEY,
  protocolo           bigserial UNIQUE,
  user_id             uuid NOT NULL,
  user_nome           text,
  user_email          text NOT NULL,
  escola_id           bigint,
  escola_nome         text,
  tipo                text NOT NULL CHECK (tipo IN ('duvida', 'erro')),
  prioridade          text NOT NULL CHECK (prioridade IN ('alta', 'media', 'baixa')),
  mensagem            text NOT NULL,
  conversa            jsonb NOT NULL DEFAULT '[]'::jsonb,
  rota                text,
  status              text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'respondido')),
  resposta            text,
  correcao            text,
  respondido_por      uuid,
  respondido_por_nome text,
  respondido_em       timestamptz,
  resposta_vista_em   timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chamados_status
  ON public.chamados (status, created_at DESC);

-- Consulta feita a cada navegacao: "tenho resposta que ainda nao vi?"
CREATE INDEX IF NOT EXISTS idx_chamados_resposta_pendente
  ON public.chamados (user_id)
  WHERE status = 'respondido' AND resposta_vista_em IS NULL;

COMMENT ON TABLE  public.chamados IS 'Chamados de suporte abertos pelo botao Suporte do cabecalho.';
COMMENT ON COLUMN public.chamados.conversa IS 'Historico do chat com a IA antes da abertura: [{ papel: "usuario" | "ia", texto }].';
COMMENT ON COLUMN public.chamados.rota IS 'Tela em que a pessoa estava ao abrir o chamado.';
COMMENT ON COLUMN public.chamados.correcao IS 'O que foi corrigido no sistema, quando o chamado era um erro. Opcional.';
COMMENT ON COLUMN public.chamados.resposta_vista_em IS 'Quando o modal com a resposta foi fechado por quem abriu. Nulo = ainda vai aparecer.';

CREATE TABLE IF NOT EXISTS public.chamados_anexos (
  id          uuid PRIMARY KEY,
  chamado_id  uuid NOT NULL REFERENCES public.chamados(id) ON DELETE CASCADE,
  nome        text NOT NULL,
  mime        text NOT NULL,
  tamanho     integer NOT NULL,
  dados       bytea NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chamados_anexos_chamado
  ON public.chamados_anexos (chamado_id);

COMMENT ON TABLE public.chamados_anexos IS 'Fotos anexadas ao chamado (ate 3). Ficam no proprio banco: o SHE nao tem storage de arquivos desde a saida do Supabase.';
