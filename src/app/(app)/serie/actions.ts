
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { SerieComDados, NivelEnsino, Turno, ComponenteCurricular } from '@/lib/types';


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

    const seriesComDados: SerieComDados[] = series.map(serie => {
        const componentesDaSerie = seriesComponentes?.filter(sc => sc.serie_id === serie.id) || [];
        const total_aulas_presenciais_distribuidas = componentesDaSerie.reduce((sum, item) => sum + item.aulas_presenciais, 0);
        const total_aulas_nao_presenciais_distribuidas = componentesDaSerie.reduce((sum, item) => sum + item.aulas_nao_presenciais, 0);
        const total_aulas_presenciais_semanais = (serie.turno?.aulas_por_dia || 0) * (serie.turno?.dias_semana?.length || 0);

        return {
            ...serie,
            nivel_ensino: serie.nivel_ensino as any,
            turno: serie.turno as any,
            componentes: componentesDaSerie as any,
            total_aulas_presenciais_semanais,
            total_aulas_presenciais_distribuidas,
            total_aulas_nao_presenciais_distribuidas,
            turmas_count: serie.turmas[0]?.count ?? 0,
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
    revalidatePath('/ensalamentos');
    return { data };
}

/* -------------------------------------------------------------------------- */
/*                           UPDATE CARGA HORARIA                           */
/* -------------------------------------------------------------------------- */
const cargaHorariaSchema = z.object({
    serie_id: z.string(),
    aulas_nao_presenciais_semanais: z.coerce.number().min(0),
    componentes: z.array(z.object({
        componente_id: z.string(),
        aulas_presenciais: z.coerce.number().min(0),
        aulas_nao_presenciais: z.coerce.number().min(0),
    }))
});

export async function updateCargaHoraria(formData: z.infer<typeof cargaHorariaSchema>) {
    const supabase = await createClient();
    const validated = cargaHorariaSchema.safeParse(formData);
    if (!validated.success) return { error: 'Dados inválidos.' };

    const { serie_id, componentes, aulas_nao_presenciais_semanais } = validated.data;
    
    const { error: serieUpdateError } = await supabase
        .from('series')
        .update({ aulas_nao_presenciais_semanais })
        .eq('id', serie_id);
        
    if (serieUpdateError) {
        console.error("Error updating series total non-presential classes:", serieUpdateError);
        return { error: 'Erro ao salvar o total de aulas não presenciais.' };
    }

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

    revalidatePath('/serie');
    revalidatePath('/ensalamentos');
    return { success: true };
}


/* -------------------------------------------------------------------------- */
/*                              DUPLICATE SERIE                               */
/* -------------------------------------------------------------------------- */
export async function duplicateSerie(serieId: string, newName: string) {
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
        .insert({ ...serieToCopy, nome: newName })
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
    revalidatePath('/ensalamentos');
    return { success: true };
}
