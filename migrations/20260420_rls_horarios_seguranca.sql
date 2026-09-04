-- =================================================================================
-- SCRIPT DE SEGURANÇA: ROW LEVEL SECURITY (RLS) PARA TABELA DE HORÁRIOS E RASCUNHOS
-- =================================================================================
-- Este script protege o seu banco contra Exclusões, Inserções ou Fetchs diretos 
-- via API anonima, exigindo que o usuário seja um "admin".

-- 1. Habilitando RLS na tabela (Ela passará a negar tudo por padrão)
ALTER TABLE public.horarios ENABLE ROW LEVEL SECURITY;

-- 2. Criando uma função super-rápida (STABLE) que retorna a Módulo/Role do usuário atual
-- Isso evita Queries (Joins) demorados em todas as Rows durante paginações grandes.
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- 3. CRIANDO AS POLÍTICAS (Policies)

-- [LEITURA] Admin pode ler tudo. (Remova ou edite se quiser que usuários leiam os deles)
CREATE POLICY "Select_Admin_Ou_Dono" 
ON public.horarios 
FOR SELECT 
TO authenticated 
USING (
  public.get_my_role() = 'admin'
  -- OR (se houver campo de escola_id no profile: escola_id = (SELECT escola_id FROM profiles...))
);

-- [INSERÇÃO]
CREATE POLICY "Insert_Admin" 
ON public.horarios 
FOR INSERT 
TO authenticated 
WITH CHECK (
  public.get_my_role() = 'admin'
);

-- [ATUALIZAÇÃO]
CREATE POLICY "Update_Admin" 
ON public.horarios 
FOR UPDATE 
TO authenticated 
USING (
  public.get_my_role() = 'admin'
)
WITH CHECK (
  public.get_my_role() = 'admin'
);

-- [EXCLUSÃO] (A mais crítica, que impede a Limpeza em Lote por hackers)
CREATE POLICY "Delete_Admin" 
ON public.horarios 
FOR DELETE 
TO authenticated 
USING (
  public.get_my_role() = 'admin'
);

-- OBSERVAÇÃO:
-- Cole e rode este script na página "SQL Editor" no painel do Supabase.
-- Se um usuário não for 'admin', qualquer requisição dele ao banco sobre 'horarios' retornará matriz vazia ou permissão negada.
