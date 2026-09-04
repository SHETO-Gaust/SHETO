-- =============================================================================
-- Migration: public.aplicar_rota_refino (v2 — 12 colunas)
--
-- `supabase/migrations/aplicar_rota_refino.sql` cria a função com 9 das 12
-- colunas de `horario_aulas`. Como ela é DELETE + INSERT, o que não está na
-- lista é APAGADO da linha a cada rota aplicada: `aula_fixa_id`,
-- `compartilhada` e `aula_compartilhada_id`.
--
-- A perda de `aula_compartilhada_id` é a que morde: é por ela que o refino sabe
-- que duas metades de uma aula coletiva são a MESMA aula, e não o mesmo
-- professor em duas salas ao mesmo tempo. Sem a marca, o refino seguinte passa
-- a acusar choque onde não há.
--
-- O banco de produção JÁ tem a versão certa — `migracao/dumps/01-schema.sql`
-- mostra as 12 colunas —, mas a migration versionada ficou para trás. Quem
-- montar um ambiente a partir de `supabase/migrations/` recebia a função velha.
-- Esta migration acerta o versionado com o que o banco pratica. (O outro
-- caminho de gravação, o fallback bulk da server action quando a RPC não está no
-- schema cache, era o que de fato apagava as colunas em qualquer ambiente; isso
-- foi corrigido alargando o SELECT em `refinodehorario/actions.ts`.)
--
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
    -- É também o que permite TROCAR duas aulas de lugar: as duas somem antes de
    -- qualquer uma voltar, então nenhuma colide com a outra no índice único.
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
            turno_id,
            aula_fixa_id,
            compartilhada,
            aula_compartilhada_id
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
            (reg->>'turno_id')::uuid,
            CASE
                WHEN reg->>'aula_fixa_id' IS NULL OR reg->>'aula_fixa_id' = 'null'
                THEN NULL
                ELSE (reg->>'aula_fixa_id')::uuid
            END,
            -- NOT NULL DEFAULT false: rota antiga (sem a chave) não pode virar NULL.
            coalesce((reg->>'compartilhada')::boolean, false),
            CASE
                WHEN reg->>'aula_compartilhada_id' IS NULL OR reg->>'aula_compartilhada_id' = 'null'
                THEN NULL
                ELSE (reg->>'aula_compartilhada_id')::uuid
            END
        );
    END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- Grants: expõe a função para os roles que o Supabase usa via REST/PostgREST
-- -----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.aplicar_rota_refino(uuid[], jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_rota_refino(uuid[], jsonb) TO service_role;

-- -----------------------------------------------------------------------------
-- Força o PostgREST a recarregar o schema cache imediatamente.
-- -----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
