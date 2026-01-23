'use server';

import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import type { Formacao, Inscricao, Frequencia, ParticipacaoSummary, FrequenciaPeriodoSummary } from '@/lib/types';
import { format, parseISO, startOfDay, endOfDay } from 'date-fns';
import { revalidatePath } from 'next/cache';

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
    
    // Processamento para contar pessoas únicas
    const processUnique = (frequencias: Frequencia[], inscricoes: Inscricao[]): FrequenciaPeriodoSummary => {
        const inscricaoMap = new Map(inscricoes.map(i => [i.id, i.fonte]));
        const uniqueInscritos = new Set<string>();
        const uniqueAvulsos = new Set<string>();

        frequencias.forEach(freq => {
            if (inscricaoMap.get(freq.inscricao_id) === 'AVULSO') {
                uniqueAvulsos.add(freq.inscricao_id);
            } else {
                uniqueInscritos.add(freq.inscricao_id);
            }
        });

        return {
            total: uniqueInscritos.size + uniqueAvulsos.size,
            inscritos: uniqueInscritos.size,
            avulsos: uniqueAvulsos.size,
        };
    };

    const freqMatutino = todasFrequencias.filter(f => f.periodo === 'MAT');
    const freqVespertino = todasFrequencias.filter(f => f.periodo === 'VESP');

    return {
        totalInscritos: inscricoes.filter(i => i.fonte !== 'AVULSO').length,
        frequencia: {
            geral: processUnique(todasFrequencias, inscricoes),
            matutino: processUnique(freqMatutino, inscricoes),
            vespertino: processUnique(freqVespertino, inscricoes),
        }
    };
}

export async function setManualPresence(inscricaoId: string, formacaoId: string, date: string, periodo: 'MAT' | 'VESP') {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);
    
    try {
        const day = parseISO(`${date}T12:00:00.000Z`); // Explicitly parse as UTC noon to avoid timezone edge cases.
        const startOfQueryDay = startOfDay(day);
        const endOfQueryDay = endOfDay(day);
        
        const { data: existingRecords, error: fetchError } = await supabase
            .from('frequencia')
            .select('id, source')
            .eq('inscricao_id', inscricaoId)
            .eq('formacao_id', formacaoId)
            .eq('periodo', periodo)
            .gte('registered_at', startOfQueryDay.toISOString())
            .lte('registered_at', endOfQueryDay.toISOString());

        if (fetchError) {
            console.error(`[SERVER_ERROR] setManualPresence/fetchError:`, fetchError);
            return { error: `Erro ao verificar presença existente: ${fetchError.message}` };
        }

        if (existingRecords && existingRecords.length > 0) {
            const existing = existingRecords[0];
            if (existing.source === 'MANUAL') {
                const { error: deleteError } = await supabase.from('frequencia').delete().eq('id', existing.id);
                if (deleteError) {
                    return { error: 'Erro ao remover presença manual.' };
                }
                revalidatePath(`/relatorios/${formacaoId}`);
                return { success: true, status: 'REMOVED' };
            } else {
                return { error: 'Não é possível remover uma presença registrada automaticamente.' };
            }
        } else {
            const { data: inscricao } = await supabase.from('inscricoes').select('cpf').eq('id', inscricaoId).single();
            if (!inscricao) {
                return { error: 'Inscrição não encontrada.' };
            }

            const { error: insertError } = await supabase.from('frequencia').insert({
                formacao_id: formacaoId,
                inscricao_id: inscricaoId,
                cpf: inscricao.cpf,
                periodo: periodo,
                registered_at: day.toISOString(),
                source: 'MANUAL',
            });

            if (insertError) {
                return { error: 'Erro ao adicionar presença manual.' };
            }
            revalidatePath(`/relatorios/${formacaoId}`);
            return { success: true, status: 'ADDED' };
        }
    } catch(e: any) {
        console.error(`[SERVER_ERROR] setManualPresence/catch:`, e);
        return { error: 'Ocorreu um erro inesperado ao processar a data.' };
    }
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
        matutino: { registered_at: string; source: string; } | null;
        vespertino: { registered_at: string; source: string; } | null;
    }[];
};


export async function getDetailedParticipationReport(formacaoId: string): Promise<{ formacao: Formacao, participants: DetailedParticipant[] } | null> {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    const formacaoPromise = supabase.from('formacoes').select('*').eq('id', formacaoId).single();
    const inscricoesPromise = supabase.from('inscricoes').select('*').eq('formacao_id', formacaoId);
    const frequenciasPromise = supabase.from('frequencia').select('inscricao_id, registered_at, periodo, source').eq('formacao_id', formacaoId);

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
    
    type PresenceInfo = { registered_at: string; source: string; } | null;
    const frequenciaMap = new Map<string, { [date: string]: { matutino: PresenceInfo, vespertino: PresenceInfo } }>();

    frequencias.forEach(freq => {
        const date = new Date(freq.registered_at);
const dateKey = format(
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())),
  'yyyy-MM-dd'
);

        const entry = frequenciaMap.get(freq.inscricao_id) || {};
        
        if (!entry[dateKey]) {
            entry[dateKey] = { matutino: null, vespertino: null };
        }

        const presenceInfo = { registered_at: freq.registered_at, source: freq.source || 'AUTOMATIC' };

        if (freq.periodo === 'MAT') {
            entry[dateKey].matutino = presenceInfo as { registered_at: string; source: string; };
        } else if (freq.periodo === 'VESP') {
            entry[dateKey].vespertino = presenceInfo as { registered_at: string; source: string; };
        }
        frequenciaMap.set(freq.inscricao_id, entry);
    });
    
    const participants: DetailedParticipant[] = inscricoes.map(inscricao => {
        const presencasPorData = frequenciaMap.get(inscricao.id) || {};
        const presencasArray = Object.entries(presencasPorData).map(([date, presence]) => ({
            date: date,
            matutino: presence.matutino,
            vespertino: presence.vespertino,
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
