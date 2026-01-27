'use server';

import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import type { Formacao, Inscricao, Ensalamento, EnsalamentoResult } from '@/lib/types';
import { isPast, isToday } from "date-fns";
import { revalidatePath } from 'next/cache';

const isConcluida = (formacao: Formacao): boolean => {
    const { dates } = formacao;
    if (!dates || !Array.isArray(dates) || dates.length === 0) {
        return false;
    }
    const allPast = dates.every((d: any) => isPast(new Date(d.date)) && !isToday(new Date(d.date)));
    return allPast;
}

export type FormacaoWithCount = Pick<Formacao, 'id' | 'name'> & { inscritosCount: number };

export async function getActiveFormationsWithCount(): Promise<FormacaoWithCount[]> {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    const { data, error } = await supabase
        .from('formacoes')
        .select('id, name, dates')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching formations for ensalamento:', error);
        return [];
    }

    const activeFormations = (data as Formacao[]).filter(f => !isConcluida(f));
    
    const countPromises = activeFormations.map(f => 
        supabase
            .from('inscricoes')
            .select('id', { count: 'exact', head: true })
            .eq('formacao_id', f.id)
    );
    
    const counts = await Promise.all(countPromises);

    const formationsWithCount = activeFormations.map((formation, index) => ({
        id: formation.id,
        name: formation.name,
        inscritosCount: counts[index].count ?? 0,
    }));


    return formationsWithCount;
}

export async function getInscritosForEnsalamento(formacaoId: string): Promise<Inscricao[]> {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    const { data, error } = await supabase
        .from('inscricoes')
        .select('*')
        .eq('formacao_id', formacaoId)
        .limit(50000); // High limit for ensalamento processing

    if (error) {
        console.error(`Error fetching inscritos for formacao ${formacaoId}:`, error);
        return [];
    }

    return data;
}


// --- New Actions for Saving/Managing Ensalamentos ---

export type SavedEnsalamento = Ensalamento & {
  formacoes: {
    name: string;
  } | null;
};

export async function getSavedEnsalamentos(): Promise<SavedEnsalamento[]> {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    const { data, error } = await supabase
        .from('ensalamentos')
        .select(`
            *,
            formacoes (name)
        `)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching saved ensalamentos:', error);
        return [];
    }

    return data as SavedEnsalamento[];
}

export async function saveEnsalamento(name: string, result: EnsalamentoResult, formacaoId: string) {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);
    
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { error: 'Usuário não autenticado.' };
    }

    const { salas, naoAlocados, stats } = result;

    const { error } = await supabase.from('ensalamentos').insert({
        name,
        formacao_id: formacaoId,
        user_id: user.id,
        salas,
        nao_alocados: naoAlocados,
        stats,
    });

    if (error) {
        console.error('Error saving ensalamento:', error);
        return { error: 'Ocorreu um erro ao salvar o ensalamento.' };
    }
    
    revalidatePath('/ensalamentos');
    return { success: true };
}

export async function deleteEnsalamento(id: string) {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    const { error } = await supabase.from('ensalamentos').delete().eq('id', id);

    if (error) {
        console.error('Error deleting ensalamento:', error);
        return { error: 'Ocorreu um erro ao deletar o ensalamento.' };
    }
    
    revalidatePath('/ensalamentos');
    return { success: true };
}
