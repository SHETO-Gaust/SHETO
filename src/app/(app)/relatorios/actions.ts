'use server';

import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import type { Formacao, Inscricao, Frequencia, ParticipacaoSummary, FrequenciaPeriodoSummary } from '@/lib/types';
import { format, parseISO } from 'date-fns';

const processFrequencia = (frequencias: Frequencia[], inscricoes: Inscricao[]): FrequenciaPeriodoSummary => {
    const inscricaoFonteMap = new Map(inscricoes.map(i => [i.id, i.fonte]));
    const uniqueInscritosPresentes = new Set<string>();
    const uniqueAvulsosPresentes = new Set<string>();

    frequencias.forEach(freq => {
        const fonte = inscricaoFonteMap.get(freq.inscricao_id);
        if (fonte === 'AVULSO') {
            uniqueAvulsosPresentes.add(freq.inscricao_id);
        } else {
            // Considera presente como 'inscrito' se não for 'AVULSO' ou se não houver fonte (legado)
            uniqueInscritosPresentes.add(freq.inscricao_id);
        }
    });
    
    const inscritosCount = uniqueInscritosPresentes.size;
    const avulsosCount = uniqueAvulsosPresentes.size;

    return {
        total: inscritosCount + avulsosCount,
        inscritos: inscritosCount,
        avulsos: avulsosCount,
    };
};

export async function getFormacoesForRelatorios(): Promise<Formacao[]> {
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
    return formacoes;
}

export async function getSingleParticipacaoSummary(formacaoId: string): Promise<Omit<ParticipacaoSummary, 'formacao'>> {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    const [inscricoesResult, frequenciasResult] = await Promise.all([
        supabase.from('inscricoes').select('*').eq('formacao_id', formacaoId),
        supabase.from('frequencia').select('*').eq('formacao_id', formacaoId)
    ]);
    
    if (inscricoesResult.error || frequenciasResult.error) {
        console.error('Error fetching details for single summary:', inscricoesResult.error || frequenciasResult.error);
        return {
            totalInscritos: 0,
            frequencia: {
                geral: { total: 0, inscritos: 0, avulsos: 0 },
                matutino: { total: 0, inscritos: 0, avulsos: 0 },
                vespertino: { total: 0, inscritos: 0, avulsos: 0 },
            }
        };
    }

    const inscricoes = (inscricoesResult.data as Inscricao[]) || [];
    const todasFrequencias = (frequenciasResult.data as Frequencia[]) || [];
    
    const freqMatutino = todasFrequencias.filter(f => f.periodo === 'MAT');
    const freqVespertino = todasFrequencias.filter(f => f.periodo === 'VESP');

    return {
        totalInscritos: inscricoes.filter(i => i.fonte !== 'AVULSO').length,
        frequencia: {
            geral: processFrequencia(todasFrequencias, inscricoes),
            matutino: processFrequencia(freqMatutino, inscricoes),
            vespertino: processFrequencia(freqVespertino, inscricoes),
        }
    };
}


export type DetailedParticipant = {
    id: string;
    nome_completo: string;
    cpf: string;
    email: string;
    fonte: string | null;
    dados: any;
    presencas: {
        date: string; // YYYY-MM-DD
        matutino: string | null; // timestamp
        vespertino: string | null; // timestamp
    }[];
};


export async function getDetailedParticipationReport(formacaoId: string): Promise<{ formacao: Formacao, participants: DetailedParticipant[] } | null> {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    const formacaoPromise = supabase.from('formacoes').select('*').eq('id', formacaoId).single();
    const inscricoesPromise = supabase.from('inscricoes').select('*').eq('formacao_id', formacaoId);
    const frequenciasPromise = supabase.from('frequencia').select('*').eq('formacao_id', formacaoId);

    const [formacaoResult, inscricoesResult, frequenciasResult] = await Promise.all([
        formacaoPromise,
        inscricoesPromise,
        frequenciasPromise,
    ]);

    if (formacaoResult.error) {
        console.error('Error fetching formacao for detailed report:', formacaoResult.error);
        return null;
    }
    
    if (inscricoesResult.error) {
        console.error('Error fetching inscricoes for detailed report:', inscricoesResult.error);
        return null;
    }

    if (frequenciasResult.error) {
        console.error('Error fetching frequencias for detailed report:', frequenciasResult.error);
        return null;
    }

    const formacao = formacaoResult.data as Formacao;
    const inscricoes = inscricoesResult.data as Inscricao[];
    const frequencias = frequenciasResult.data as Frequencia[];
    
    const frequenciaMap = new Map<string, { [date: string]: { matutino: string | null, vespertina: string | null } }>();

    frequencias.forEach(freq => {
        const dateKey = format(parseISO(freq.registered_at), 'yyyy-MM-dd');
        const entry = frequenciaMap.get(freq.inscricao_id) || {};
        
        if (!entry[dateKey]) {
            entry[dateKey] = { matutina: null, vespertina: null };
        }

        if (freq.periodo === 'MAT') {
            entry[dateKey].matutina = freq.registered_at;
        } else if (freq.periodo === 'VESP') {
            entry[dateKey].vespertina = freq.registered_at;
        }
        frequenciaMap.set(freq.inscricao_id, entry);
    });
    
    const participants: DetailedParticipant[] = inscricoes.map(inscricao => {
        const presencasPorData = frequenciaMap.get(inscricao.id) || {};
        const presencasArray = Object.entries(presencasPorData).map(([date, presence]) => ({
            date: date,
            matutino: presence.matutina,
            vespertino: presence.vespertina,
        }));

        return {
            id: inscricao.id,
            nome_completo: inscricao.nome_completo,
            cpf: inscricao.cpf,
            email: inscricao.email,
            fonte: inscricao.fonte || 'Inscrito',
            dados: inscricao.dados,
            presencas: presencasArray,
        };
    });

    return { formacao, participants };
}
