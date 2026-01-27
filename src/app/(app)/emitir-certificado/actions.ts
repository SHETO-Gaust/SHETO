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

export type FormacaoWithCounts = Formacao & { inscritosCount: number };

export async function getFinishedFormationsWithCounts(): Promise<FormacaoWithCounts[]> {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    const { data, error } = await supabase
        .from('formacoes')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching formations for certificates:', error);
        return [];
    }

    const finishedFormations = (data as Formacao[]).filter(f => isConcluida(f));
    
    const countPromises = finishedFormations.map(f => 
        supabase
            .from('inscricoes')
            .select('id', { count: 'exact', head: true })
            .eq('formacao_id', f.id)
    );
    
    const counts = await Promise.all(countPromises);

    const formationsWithCount = finishedFormations.map((formation, index) => ({
        ...formation,
        inscritosCount: counts[index].count ?? 0,
    }));

    return formationsWithCount;
}

export async function getFormationForCertificateConfig(formacaoId: string): Promise<Formacao | null> {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

     const { data: formacao, error: formacaoError } = await supabase
        .from('formacoes')
        .select('*')
        .eq('id', formacaoId)
        .single();
    
    if(formacaoError) {
        console.error('Error fetching formacao for certificate config:', formacaoError);
        return null;
    }
    return formacao;
}


export async function saveCertificateConfig(formacaoId: string, config: any) {
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);

  const { data, error } = await supabase
    .from('formacoes')
    .update({ certificate_config: config })
    .eq('id', formacaoId)
    .select();

  if (error) {
    console.error('Error updating certificate config:', error);
    return { error: 'Ocorreu um erro ao salvar as configurações do certificado.' };
  }

  return { data };
}
