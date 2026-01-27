-- Tabela para armazenar os ensalamentos salvos
CREATE TABLE public.ensalamentos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  formacao_id UUID NOT NULL REFERENCES public.formacoes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) DEFAULT auth.uid(),
  name TEXT NOT NULL,
  salas JSONB NOT NULL,
  nao_alocados JSONB,
  stats JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.ensalamentos ENABLE ROW LEVEL SECURITY;

-- Policies para a tabela 'ensalamentos'
-- Permitir que usuários autenticados gerenciem (leiam, criem, atualizem, deletem)
-- apenas seus próprios ensalamentos.
CREATE POLICY "Allow users to manage their own ensalamentos"
ON public.ensalamentos
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);