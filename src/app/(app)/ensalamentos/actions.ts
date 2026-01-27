'use server';

import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import type { Formacao } from '@/lib/types';
import { isPast, isToday } from "date-fns";

const isConcluida = (formacao: Formacao): boolean => {
    const { dates } = formacao;
    if (!dates || !Array.isArray(dates) || dates.length === 0) {
        return false;
    }
    const allPast = dates.every((d: any) => isPast(new Date(d.date)) && !isToday(new Date(d.date)));
    return allPast;
}

export async function getActiveFormations(): Promise<Pick<Formacao, 'id' | 'name'>[]> {
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

    return activeFormations.map(({ id, name }) => ({ id, name }));
}
