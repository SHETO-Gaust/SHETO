'use server';

import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import type { Formacao, Inscricao, Frequencia, ParticipacaoSummary, FrequenciaPeriodoSummary } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import { startOfDay, endOfDay, parse } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

const saoPauloTimeZone = 'America/Sao_Paulo';

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
        const targetDate = toZonedTime(parse(date, 'yyyy-MM-dd', new Date()), saoPauloTimeZone);
        const startOfQueryDay = startOfDay(targetDate);
        const endOfQueryDay = endOfDay(targetDate);

        const { data: existingRecords, error: fetchError } = await supabase
            .from('frequencia')
            .select('id, source')
            .eq('inscricao_id', inscricaoId)
            .eq('formacao_id', formacaoId)
            .eq('periodo', periodo)
            .gte('registered_at', startOfQueryDay.toISOString())
            .lte('registered_at', endOfQueryDay.toISOString());
            
        if (fetchError) {
             console.error('[SERVER_ACTION_ERROR] setManualPresence/fetchError:', fetchError);
             return { error: `Erro ao verificar presença existente: ${fetchError.message}` };
        }

        if (existingRecords && existingRecords.length > 0) {
            const existing = existingRecords[0];
            if (existing.source === false) { // source: false is MANUAL
                const { error: deleteError } = await supabase.from('frequencia').delete().eq('id', existing.id);
                if (deleteError) {
                     console.error('[SERVER_ACTION_ERROR] setManualPresence/deleteError:', deleteError);
                    return { error: `Erro ao remover presença manual: ${deleteError.message}` };
                }
                revalidatePath(`/relatorios/${formacaoId}`); 
                return { success: true, status: 'REMOVED' };
            } else {
                 console.warn('[SERVER_ACTION_WARN] setManualPresence: Attempted to remove automatic presence.');
                return { error: 'Não é possível remover uma presença registrada automaticamente.' };
            }
        } else {
            const { data: inscricao } = await supabase.from('inscricoes').select('cpf').eq('id', inscricaoId).single();
            if (!inscricao) {
                return { error: 'Inscrição não encontrada.' };
            }
            
            const registrationTimestamp = new Date(date + 'T12:00:00.000Z');

            const { error: insertError } = await supabase.from('frequencia').insert({
                formacao_id: formacaoId,
                inscricao_id: inscricaoId,
                cpf: inscricao.cpf,
                periodo: periodo,
                registered_at: registrationTimestamp.toISOString(),
                source: false,
            });

            if (insertError) {
                console.error('[SERVER_ACTION_ERROR] setManualPresence/insertError:', insertError);
                return { error: `Erro ao adicionar presença manual: ${insertError.message}` };
            }
            revalidatePath(`/relatorios/${formacaoId}`);
            return { success: true, status: 'ADDED' };
        }
    } catch(e: any) {
        console.error('[SERVER_ACTION_ERROR] setManualPresence/catchAll:', e);
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
        matutino: { registered_at: string; source: boolean; } | null;
        vespertino: { registered_at: string; source: boolean; } | null;
    }[];
};

export async function getDetailedParticipationReport(formacaoId: string): Promise<{ formacao: Formacao, participants: DetailedParticipant[] } | null> {
    console.log('[SERVER-ACTION-LOG] getDetailedParticipationReport: Fetching base data...');
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    const formacaoPromise = supabase.from('formacoes').select('*').eq('id', formacaoId).single();
    const inscricoesPromise = supabase.from('inscricoes').select('*').eq('formacao_id', formacaoId);
    
    const [formacaoResult, inscricoesResult] = await Promise.all([
        formacaoPromise,
        inscricoesPromise,
    ]);

    if (formacaoResult.error || inscricoesResult.error) {
        console.error('[SERVER-ACTION-ERROR] Error fetching base data for detailed report:', formacaoResult.error || inscricoesResult.error);
        return null;
    }

    const formacao = formacaoResult.data as Formacao;
    const inscricoes = inscricoesResult.data as Inscricao[];

    const participants: DetailedParticipant[] = inscricoes.map(inscricao => {
        return {
            id: inscricao.id,
            nome_completo: inscricao.nome_completo,
            cpf: inscricao.cpf,
            email: inscricao.email,
            fonte: inscricao.fonte || 'Inscrito',
            dados: inscricao.dados,
            presencas: [], 
        };
    });

    console.log(`[SERVER-ACTION-LOG] getDetailedParticipationReport: Found ${participants.length} participants.`);
    return { formacao, participants };
}

export async function getPresenceForParticipants(
    formacaoId: string,
    participantIds: string[]
): Promise<Record<string, DetailedParticipant['presencas']>> {
    if (!participantIds || participantIds.length === 0) {
        return {};
    }
    console.log(`[SERVER-ACTION-LOG] getPresenceForParticipants: Fetching presence for ${participantIds.length} participants.`);

    const cookieStore = cookies();
    const supabase = createClient(cookieStore);
    
    const { data: formacao } = await supabase.from('formacoes').select('dates').eq('id', formacaoId).single();
    const allFormacaoDates = (formacao?.dates as any[] | undefined)?.map((d: any) => d.date.substring(0, 10)) || [];

    const { data: frequencias, error } = await supabase
        .from('frequencia')
        .select('inscricao_id, registered_at, periodo, source')
        .eq('formacao_id', formacaoId)
        .in('inscricao_id', participantIds);

    if (error) {
        console.error('[SERVER-ACTION-ERROR] getPresenceForParticipants:', error);
        return {};
    }

    type PresenceInfo = { registered_at: string; source: boolean; } | null;
    const frequenciaMap = new Map<string, { [date: string]: { matutino: PresenceInfo, vespertino: PresenceInfo } }>();

    for (const freq of frequencias) {
        const dateKey = freq.registered_at.substring(0, 10);
        
        if (!frequenciaMap.has(freq.inscricao_id)) {
            frequenciaMap.set(freq.inscricao_id, {});
        }
        const participantData = frequenciaMap.get(freq.inscricao_id)!;

        if (!participantData[dateKey]) {
            participantData[dateKey] = { matutino: null, vespertino: null };
        }
        
        const presenceInfo = { registered_at: freq.registered_at, source: freq.source };
        const cleanPeriodo = freq.periodo?.trim().toUpperCase();

        if (cleanPeriodo === 'MAT') {
            participantData[dateKey].matutino = presenceInfo;
        } else if (cleanPeriodo === 'VESP') {
            participantData[dateKey].vespertino = presenceInfo;
        }
    }
    
    const result: Record<string, DetailedParticipant['presencas']> = {};

    for (const participantId of participantIds) {
        const participantFrequencias = frequenciaMap.get(participantId) || {};
        result[participantId] = allFormacaoDates.map(date => ({
            date: date,
            matutino: participantFrequencias[date]?.matutino || null,
            vespertino: participantFrequencias[date]?.vespertino || null,
        }));
    }
    
    console.log(`[SERVER-ACTION-LOG] getPresenceForParticipants: Processed and returning data for ${Object.keys(result).length} participants.`);
    return result;
}
