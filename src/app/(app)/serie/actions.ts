
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { SerieComDados, NivelEnsino, Turno, ComponenteCurricular, SerieAulaFixa } from '@/lib/types';


/* -------------------------------------------------------------------------- */
/*                                 GET SERIES                                 */
/* -------------------------------------------------------------------------- */
export async function getSeries(escolaId: string): Promise<{ data?: SerieComDados[], error?: string }> {
  const supabase = await createClient();
  try {
    const { data: series, error: seriesError } = await supabase
      .from('series')
      .select('*, nivel_ensino:niveis_ensino(*), turno:turnos(*), turmas(count)')
      .eq('escola_id', escolaId)
      .order('nome', { ascending: true });

    if (seriesError) throw seriesError;
    if (!series) return { data: [] };

    const seriesIds = series.map(s => s.id);

    const { data: seriesComponentes, error: componentesError } = await supabase
        .from('series_componentes')
        .select('*, componente:componentes_curriculares(*)')
        .in('serie_id', seriesIds);
    
    if (componentesError) throw componentesError;

    // Buscar fixações de todas as séries de uma vez
    const { data: seriesAulasFixas, error: fixasError } = await supabase
        .from('series_aulas_fixas')
        .select('*')
        .in('serie_id', seriesIds);
    if (fixasError) throw fixasError;

    const seriesComDados: SerieComDados[] = series.map(serie => {
        const componentesDaSerie = seriesComponentes?.filter(sc => sc.serie_id === serie.id) || [];
        const total_aulas_presenciais_distribuidas = componentesDaSerie.reduce((sum, item) => sum + item.aulas_presenciais, 0);
        const total_aulas_nao_presenciais_distribuidas = componentesDaSerie.reduce((sum, item) => sum + item.aulas_nao_presenciais, 0);
        const total_aulas_presenciais_semanais = (serie.turno?.aulas_por_dia || 0) * (serie.turno?.dias_semana?.length || 0);
        const aulasFixasDaSerie = (seriesAulasFixas?.filter(af => af.serie_id === serie.id) || []) as SerieAulaFixa[];

        return {
            ...serie,
            nivel_ensino: serie.nivel_ensino as any,
            turno: serie.turno as any,
            componentes: componentesDaSerie as any,
            total_aulas_presenciais_semanais,
            total_aulas_presenciais_distribuidas,
            total_aulas_nao_presenciais_distribuidas,
            turmas_count: serie.turmas[0]?.count ?? 0,
            aulas_fixas: aulasFixasDaSerie,
        }
    });

    return { data: seriesComDados };
  } catch (error: any) {
    console.error("Error fetching series:", error);
    return { error: 'Não foi possível buscar as séries.' };
  }
}

/* -------------------------------------------------------------------------- */
/*                              GET DEPENDENCIES                              */
/* -------------------------------------------------------------------------- */
export async function getSerieDependencies(escolaId: string): Promise<{
    niveisEnsino: NivelEnsino[],
    turnos: Turno[],
    componentes: ComponenteCurricular[],
}> {
    const supabase = await createClient();
    const [niveisResult, turnosResult, componentesResult] = await Promise.all([
        supabase.from('niveis_ensino').select('*').eq('escola_id', escolaId),
        supabase.from('turnos').select('*').eq('escola_id', escolaId).eq('ativo', true),
        supabase.from('componentes_curriculares').select('*').eq('escola_id', escolaId),
    ]);

    return {
        niveisEnsino: niveisResult.data || [],
        turnos: turnosResult.data || [],
        componentes: componentesResult.data || [],
    };
}


/* -------------------------------------------------------------------------- */
/*                                UPSERT SERIE                                */
/* -------------------------------------------------------------------------- */
const upsertSerieSchema = z.object({
  id: z.string().optional(),
  escola_id: z.string(),
  nome: z.string().min(1, 'O nome é obrigatório.'),
  nivel_ensino_id: z.string({ required_error: 'Selecione um nível de ensino.' }),
  turno_id: z.string({ required_error: 'Selecione um turno.' }),
  restricoes: z.any().optional(),
});

export async function upsertSerie(formData: z.infer<typeof upsertSerieSchema>) {
    const supabase = await createClient();
    const validated = upsertSerieSchema.safeParse(formData);
    if (!validated.success) {
        return { error: 'Dados inválidos.', errors: validated.error.flatten().fieldErrors };
    }
    const { id, ...dataToUpsert } = validated.data;

    const { data, error } = await supabase
        .from('series')
        .upsert(id ? { id, ...dataToUpsert } : dataToUpsert, { onConflict: 'id' })
        .select().single();
    
    if (error) {
        if (error.code === '23505') {
            return { error: `Uma série com o nome "${dataToUpsert.nome}" já existe.` };
        }
        console.error("Error upserting serie:", error);
        return { error: "Não foi possível salvar a série." };
    }

    revalidatePath('/serie');
    revalidatePath('/turmas');
    return { data };
}

/* -------------------------------------------------------------------------- */
/*                           UPDATE CARGA HORARIA                           */
/* -------------------------------------------------------------------------- */

const aulaFixaInputSchema = z.object({
    id: z.string().optional(),                          // se presente = registro existente (upsert)
    componente_id: z.string(),
    tipo_aula: z.enum(['presencial', 'nao_presencial']),
    dia_semana: z.string(),
    aula_index: z.coerce.number().min(0),
    compartilhada: z.boolean().default(false),
    professor_responsavel_id: z.string().nullable().optional(),
});

const cargaHorariaSchema = z.object({
    serie_id: z.string(),
    aulas_nao_presenciais_semanais: z.coerce.number().min(0),
    componentes: z.array(z.object({
        componente_id: z.string(),
        aulas_presenciais: z.coerce.number().min(0),
        aulas_nao_presenciais: z.coerce.number().min(0),
    })),
    aulas_fixas: z.array(aulaFixaInputSchema).default([]),
});

export async function updateCargaHoraria(formData: z.infer<typeof cargaHorariaSchema>) {
    const supabase = await createClient();
    const validated = cargaHorariaSchema.safeParse(formData);
    if (!validated.success) return { error: 'Dados inválidos.' };

    const { serie_id, componentes, aulas_nao_presenciais_semanais, aulas_fixas } = validated.data;

    // ── 1. Buscar dados do turno da série para validar slots ────────────────
    const { data: serie } = await supabase
        .from('series')
        .select('turno_id, turnos(aulas_por_dia, dias_semana)')
        .eq('id', serie_id)
        .single();

    const turno = (serie?.turnos as any);
    const aulasPorDia: number = turno?.aulas_por_dia ?? 999;
    const diasSemana: string[] = turno?.dias_semana ?? [];

    // ── 2. Validar cada fixação recebida ────────────────────────────────────
    if (aulas_fixas.length > 0) {
        // Mapa de carga por componente/tipo
        const cargaMap = new Map<string, number>();
        for (const c of componentes) {
            cargaMap.set(`${c.componente_id}|presencial`, c.aulas_presenciais);
            cargaMap.set(`${c.componente_id}|nao_presencial`, c.aulas_nao_presenciais);
        }

        // Contar fixações por componente/tipo
        const countMap = new Map<string, number>();
        for (const f of aulas_fixas) {
            const key = `${f.componente_id}|${f.tipo_aula}`;
            countMap.set(key, (countMap.get(key) || 0) + 1);
        }
        for (const [key, count] of countMap.entries()) {
            const carga = cargaMap.get(key) ?? 0;
            if (count > carga) {
                return { error: `Quantidade de fixações (${count}) ultrapassa a carga horária (${carga}) para um componente. Reduza as fixações ou aumente a carga.` };
            }
        }

        // Validar slot no turno
        for (const f of aulas_fixas) {
            if (!diasSemana.includes(f.dia_semana)) {
                return { error: `O dia "${f.dia_semana}" não pertence ao turno desta série.` };
            }
            if (f.aula_index >= aulasPorDia) {
                return { error: `O índice de aula ${f.aula_index + 1} ultrapassa o limite do turno (${aulasPorDia} aulas/dia).` };
            }
        }

        // Validar que dois componentes diferentes não ocupam o mesmo slot
        const slotMap = new Map<string, string>(); // 'tipo|dia|idx' -> componente_id
        for (const f of aulas_fixas) {
            const slotKey = `${f.tipo_aula}|${f.dia_semana}|${f.aula_index}`;
            const existente = slotMap.get(slotKey);
            if (existente && existente !== f.componente_id) {
                return { error: `Dois componentes diferentes estão fixados no mesmo slot (${f.dia_semana}, aula ${f.aula_index + 1}). Cada slot pode ter apenas uma fixação.` };
            }
            slotMap.set(slotKey, f.componente_id);
        }

        // Validar professor das aulas compartilhadas
        const compartilhadasSemProf = aulas_fixas.filter(f => f.compartilhada && !f.professor_responsavel_id);
        if (compartilhadasSemProf.length > 0) {
            // Buscar se todas as turmas da série têm o mesmo professor para esses componentes
            const { data: turmas } = await supabase
                .from('turmas')
                .select('id, professores:turmas_professores(componente_id, professor_id)')
                .eq('serie_id', serie_id);

            for (const f of compartilhadasSemProf) {
                const profIds = new Set<string>();
                for (const t of (turmas || [])) {
                    const vínculo = (t.professores as any[]).find((p: any) => p.componente_id === f.componente_id);
                    if (vínculo?.professor_id) profIds.add(vínculo.professor_id);
                }
                if (profIds.size > 1) {
                    return { error: `A aula compartilhada do componente possui professores diferentes entre as turmas da série. Selecione explicitamente o professor responsável pela aula coletiva.` };
                }
            }
        }
    }

    // ── 3. Atualizar total de aulas não presenciais na série ────────────────
    const { error: serieUpdateError } = await supabase
        .from('series')
        .update({ aulas_nao_presenciais_semanais })
        .eq('id', serie_id);

    if (serieUpdateError) {
        console.error("Error updating series total non-presential classes:", serieUpdateError);
        return { error: 'Erro ao salvar o total de aulas não presenciais.' };
    }

    // ── 4. Atualizar series_componentes (delete + insert existente) ──────────
    const { error: deleteError } = await supabase
        .from('series_componentes')
        .delete()
        .eq('serie_id', serie_id);

    if (deleteError) {
        console.error("Error deleting old series componentes:", deleteError);
        return { error: 'Erro ao limpar componentes antigos.' };
    }

    const toInsert = componentes
        .filter(c => c.aulas_presenciais > 0 || c.aulas_nao_presenciais > 0)
        .map(c => ({
            serie_id,
            componente_id: c.componente_id,
            aulas_presenciais: c.aulas_presenciais,
            aulas_nao_presenciais: c.aulas_nao_presenciais,
        }));

    if (toInsert.length > 0) {
        const { error: insertError } = await supabase
            .from('series_componentes')
            .insert(toInsert);

        if (insertError) {
            console.error("Error inserting new series componentes:", insertError);
            return { error: 'Erro ao salvar nova carga horária.' };
        }
    }

    // ── 5. Upsert inteligente de series_aulas_fixas ──────────────────────────
    // Estratégia: não apagamos tudo. Identificamos o que foi removido, o que mudou e o que é novo.
    const { data: fixasExistentes } = await supabase
        .from('series_aulas_fixas')
        .select('id')
        .eq('serie_id', serie_id);

    const idsExistentes = new Set((fixasExistentes || []).map(f => f.id));
    const idsRecebidos = new Set(aulas_fixas.filter(f => f.id).map(f => f.id!));

    // IDs que existiam mas não vieram de volta = usuário removeu
    const idsParaRemover = [...idsExistentes].filter(id => !idsRecebidos.has(id));

    if (idsParaRemover.length > 0) {
        // Antes de remover, verificar se algum horário usa essas fixações
        const { data: aulasVinculadas } = await supabase
            .from('horario_aulas')
            .select('id, aula_fixa_id')
            .in('aula_fixa_id', idsParaRemover)
            .limit(1);

        if (aulasVinculadas && aulasVinculadas.length > 0) {
            return {
                error: 'Uma ou mais fixações removidas já foram usadas para gerar um horário publicado. Exclua ou regenere o horário antes de remover a fixação.'
            };
        }

        const { error: removeErr } = await supabase
            .from('series_aulas_fixas')
            .delete()
            .in('id', idsParaRemover);

        if (removeErr) return { error: 'Erro ao remover fixações antigas.' };
    }

    // Persistir fixações: INSERT para novas (sem id), UPDATE para existentes (com id)
    // NÃO usar upsert único pois registros sem id chegam com id=undefined, causando
    // violação NOT NULL ao tentar inserir id=null.
    if (aulas_fixas.length > 0) {
        const base = (f: typeof aulas_fixas[number]) => ({
            serie_id,
            componente_id: f.componente_id,
            tipo_aula: f.tipo_aula,
            dia_semana: f.dia_semana,
            aula_index: f.aula_index,
            compartilhada: f.compartilhada,
            professor_responsavel_id: f.professor_responsavel_id ?? null,
            updated_at: new Date().toISOString(),
        });

        // INSERT: registros novos (id ausente ou vazio)
        const novas = aulas_fixas.filter(f => !f.id);
        if (novas.length > 0) {
            const { error: insertErr } = await supabase
                .from('series_aulas_fixas')
                .insert(novas.map(f => base(f)));

            if (insertErr) {
                if (insertErr.code === '23505') {
                    return { error: 'Conflito de fixação: dois componentes tentam ocupar o mesmo slot. Verifique os horários fixados.' };
                }
                console.error('Error inserting series_aulas_fixas:', insertErr);
                return { error: 'Erro ao salvar as fixações de horário.' };
            }
        }

        // UPDATE: registros existentes (id presente)
        const existentes = aulas_fixas.filter(f => !!f.id);
        for (const f of existentes) {
            const { error: updateErr } = await supabase
                .from('series_aulas_fixas')
                .update(base(f))
                .eq('id', f.id!);

            if (updateErr) {
                if (updateErr.code === '23505') {
                    return { error: 'Conflito de fixação: dois componentes tentam ocupar o mesmo slot. Verifique os horários fixados.' };
                }
                console.error('Error updating series_aulas_fixas:', updateErr);
                return { error: 'Erro ao atualizar fixação de horário.' };
            }
        }
    }


    revalidatePath('/serie');
    revalidatePath('/turmas');
    return { success: true };
}


/* -------------------------------------------------------------------------- */
/*                              DUPLICATE SERIE                               */
/* -------------------------------------------------------------------------- */
export async function duplicateSerie(serieId: string, newName: string, newTurnoId: string) {
    const supabase = await createClient();
    
    const { data: originalSerie, error: fetchError } = await supabase
        .from('series')
        .select('*')
        .eq('id', serieId)
        .single();
    
    if (fetchError || !originalSerie) return { error: 'Série original não encontrada.' };

    const { id: _, created_at: __, ...serieToCopy } = originalSerie;
    const { data: newSerie, error: createError } = await supabase
        .from('series')
        .insert({ 
            ...serieToCopy, 
            nome: newName,
            turno_id: newTurnoId
        })
        .select()
        .single();
    
    if (createError) {
        if (createError.code === '23505') return { error: `Uma série com o nome "${newName}" já existe.` };
        return { error: 'Erro ao criar a nova série.' };
    }

    const { data: originalComponentes, error: compError } = await supabase
        .from('series_componentes')
        .select('componente_id, aulas_presenciais, aulas_nao_presenciais')
        .eq('serie_id', serieId);

    if (compError) {
        console.error("Error fetching original series componentes:", compError);
        return { error: 'Erro ao buscar componentes da série original.' };
    }

    if (originalComponentes && originalComponentes.length > 0) {
        const newComponentes = originalComponentes.map(c => ({
            ...c,
            serie_id: newSerie.id,
        }));
        const { error: insertCompError } = await supabase
            .from('series_componentes')
            .insert(newComponentes);
        
        if (insertCompError) {
            console.error("Error duplicating series componentes:", insertCompError);
            return { error: 'Erro ao duplicar carga horária.' };
        }
    }

    revalidatePath('/serie');
    return { success: true, data: newSerie };
}


/* -------------------------------------------------------------------------- */
/*                                DELETE SERIE                                */
/* -------------------------------------------------------------------------- */
export async function deleteSerie(id: string) {
    const supabase = await createClient();
    const { error } = await supabase.from('series').delete().eq('id', id);
    if (error) {
        console.error("Error deleting serie:", error);
        return { error: 'Não foi possível deletar a série.' };
    }

    revalidatePath('/serie');
    revalidatePath('/turmas');
    return { success: true };
}
