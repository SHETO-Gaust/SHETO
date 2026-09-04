-- =============================================================================
-- Migration: public.aplicar_rota_refino
-- Função atômica de DELETE + INSERT para o módulo de Refino de Horário.
-- Idempotente via CREATE OR REPLACE.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.aplicar_rota_refino(
    p_ids      uuid[],
    p_registros jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public       -- obrigatório em funções SECURITY DEFINER
AS $$
DECLARE
    reg jsonb;
BEGIN
    -- Fase 1: remove TODOS os registros da cadeia de uma vez.
    -- Isso libera os slots antes de qualquer INSERT, evitando
    -- violação da unique constraint durante a reordenação.
    DELETE FROM public.horario_aulas
    WHERE id = ANY(p_ids);

    -- Fase 2: re-insere cada registro no seu slot final.
    -- Como os conflitos foram liberados na fase anterior, nenhum
    -- INSERT vai collider com outro da mesma cadeia.
    FOR reg IN SELECT value FROM jsonb_array_elements(p_registros)
    LOOP
        INSERT INTO public.horario_aulas (
            id,
            horario_id,
            turma_id,
            componente_id,
            professor_id,
            dia_semana,
            aula_index,
            tipo,
            turno_id
        ) VALUES (
            (reg->>'id')::uuid,
            (reg->>'horario_id')::uuid,
            (reg->>'turma_id')::uuid,
            (reg->>'componente_id')::uuid,
            CASE
                WHEN reg->>'professor_id' IS NULL OR reg->>'professor_id' = 'null'
                THEN NULL
                ELSE (reg->>'professor_id')::uuid
            END,
            reg->>'dia_semana',
            (reg->>'aula_index')::integer,
            (reg->>'tipo')::text,
            (reg->>'turno_id')::uuid
        );
    END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- Grants: expõe a função para os roles que o Supabase usa via REST/PostgREST
-- -----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.aplicar_rota_refino(uuid[], jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_rota_refino(uuid[], jsonb) TO service_role;
-- Se o projeto ainda usa o role anon para chamar server actions autenticadas:
-- GRANT EXECUTE ON FUNCTION public.aplicar_rota_refino(uuid[], jsonb) TO anon;

-- -----------------------------------------------------------------------------
-- Força o PostgREST a recarregar o schema cache imediatamente.
-- Sem este NOTIFY, a função existe no banco mas o PostgREST continua
-- retornando PGRST202 até o próximo reload automático (por padrão a cada 5s).
-- -----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
