'use server';

import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import type { Formacao, Inscricao, Frequencia, ParticipacaoSummary, FrequenciaPeriodoSummary } from '@/lib/types';

const processFrequencia = (frequencias: Frequencia[], inscricoes: Inscricao[]): FrequenciaPeriodoSummary => {
    let inscritosPresentes = 0;
    let avulsosPresentes = 0;

    const inscricaoFonteMap = new Map(inscricoes.map(i => [i.id, i.fonte]));

    frequencias.forEach(freq => {
        const fonte = inscricaoFonteMap.get(freq.inscricao_id);
        if (fonte === 'AVULSO') {
            avulsosPresentes++;
        } else {
            // Considera presente como 'inscrito' se não for 'AVULSO' ou se não houver fonte (legado)
            inscritosPresentes++;
        }
    });

    return {
        total: frequencias.length,
        inscritos: inscritosPresentes,
        avulsos: avulsosPresentes,
    };
};


export async function getParticipacaoSummary(): Promise<ParticipacaoSummary[]> {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    const { data: formacoes, error: formacoesError } = await supabase
        .from('formacoes')
        .select('*')
        .order('created_at', { ascending: false });

    if (formacoesError) {
        console.error('Error fetching formacoes for participation summary:', formacoesError);
        return [];
    }

    const formacaoIds = formacoes.map(f => f.id);

    if (formacaoIds.length === 0) return [];

    const [inscricoesResult, frequenciasResult] = await Promise.all([
        supabase.from('inscricoes').select('*').in('formacao_id', formacaoIds),
        supabase.from('frequencia').select('*').in('formacao_id', formacaoIds)
    ]);
    
    if (inscricoesResult.error || frequenciasResult.error) {
        console.error('Error fetching details for summary:', inscricoesResult.error || frequenciasResult.error);
        return [];
    }

    const inscricoesPorFormacao = (inscricoesResult.data as Inscricao[]).reduce((acc, inscricao) => {
        if (!acc[inscricao.formacao_id]) acc[inscricao.formacao_id] = [];
        acc[inscricao.formacao_id].push(inscricao);
        return acc;
    }, {} as { [key: string]: Inscricao[] });

    const frequenciasPorFormacao = (frequenciasResult.data as Frequencia[]).reduce((acc, freq) => {
        if (!acc[freq.formacao_id]) acc[freq.formacao_id] = [];
        acc[freq.formacao_id].push(freq);
        return acc;
    }, {} as { [key: string]: Frequencia[] });


    const summary: ParticipacaoSummary[] = formacoes.map(formacao => {
        const inscricoes = inscricoesPorFormacao[formacao.id] || [];
        const todasFrequencias = frequenciasPorFormacao[formacao.id] || [];
        
        const freqMatutino = todasFrequencias.filter(f => f.periodo === 'MAT');
        const freqVespertino = todasFrequencias.filter(f => f.periodo === 'VESP');

        return {
            formacao,
            totalInscritos: inscricoes.filter(i => i.fonte !== 'AVULSO').length,
            frequencia: {
                geral: processFrequencia(todasFrequencias, inscricoes),
                matutino: processFrequencia(freqMatutino, inscricoes),
                vespertino: processFrequencia(freqVespertino, inscricoes),
            }
        };
    });

    return summary;
}
