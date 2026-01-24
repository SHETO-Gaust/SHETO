'use server';

import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import type { Formacao, Inscricao, Frequencia, ParticipacaoSummary, FrequenciaPeriodoSummary } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import { startOfDay, endOfDay, parseISO } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

const saoPauloTimeZone = 'America/Sao_Paulo';

export async function getFormacaoIds(): Promise<Pick<Formacao, 'id'>[]> {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);
    const { data, error } = await supabase
        .from('formacoes')
        .select('id')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching formacao ids:', error);
        return [];
    }
    return data;
}

const processUniqueFrequencies = (frequencias: Pick<Frequencia, 'inscricao_id' | 'periodo'>[], inscricoes: Pick<Inscricao, 'id' | 'fonte'>[]): FrequenciaPeriodoSummary => {
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

export async function getParticipationSummary(formacaoId: string): Promise<ParticipacaoSummary | null> {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    const { data: formacao, error: formacaoError } = await supabase
        .from('formacoes')
        .select('*')
        .eq('id', formacaoId)
        .single();
    
    if (formacaoError || !formacao) {
        console.error(`Error fetching formacao for summary (${formacaoId}):`, formacaoError);
        return null;
    }

    const { data: inscricoes, error: inscricoesError } = await supabase
        .from('inscricoes')
        .select('id, formacao_id, fonte')
        .eq('formacao_id', formacaoId);
    
    const { data: frequencias, error: frequenciasError } = await supabase
        .from('frequencia')
        .select('inscricao_id, formacao_id, periodo')
        .eq('formacao_id', formacaoId);

    if (inscricoesError || frequenciasError) {
        console.error(`Error fetching details for summary (${formacaoId}):`, inscricoesError || frequenciasError);
        return {
            formacao,
            totalInscritos: 0,
            frequencia: {
                geral: { total: 0, inscritos: 0, avulsos: 0 },
                matutino: { total: 0, inscritos: 0, avulsos: 0 },
                vespertino: { total: 0, inscritos: 0, avulsos: 0 },
            }
        };
    }
    
    const freqMatutino = (frequencias || []).filter(f => f.periodo === 'MAT');
    const freqVespertino = (frequencias || []).filter(f => f.periodo === 'VESP');

    const summary: ParticipacaoSummary = {
        formacao,
        totalInscritos: (inscricoes || []).filter(i => i.fonte !== 'AVULSO').length,
        frequencia: {
            geral: processUniqueFrequencies(frequencias || [], inscricoes || []),
            matutino: processUniqueFrequencies(freqMatutino, inscricoes || []),
            vespertino: processUniqueFrequencies(freqVespertino, inscricoes || []),
        }
    };

    return summary;
}

export async function setManualPresence(inscricaoId: string, formacaoId: string, date: string, periodo: 'MAT' | 'VESP') {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);
    
    try {
        const targetDate = toZonedTime(parseISO(date), saoPauloTimeZone);
        const startOfTargetDay = startOfDay(targetDate);
        const endOfTargetDay = endOfDay(targetDate);

        const { data: existingRecords, error: fetchError } = await supabase
            .from('frequencia')
            .select('id, source')
            .eq('inscricao_id', inscricaoId)
            .eq('formacao_id', formacaoId)
            .eq('periodo', periodo)
            .gte('registered_at', startOfTargetDay.toISOString())
            .lte('registered_at', endOfTargetDay.toISOString());
            
        if (fetchError) {
             console.error('[SERVER_ACTION_ERROR] setManualPresence/fetchError:', fetchError);
             return { error: `Erro ao verificar presença existente: ${fetchError.message}` };
        }

        if (existingRecords && existingRecords.length > 0) {
            // Presence exists, check if it's manual before allowing toggle off
            if (existingRecords[0].source === false) { // It's manual, so remove it
                const { error: deleteError } = await supabase.from('frequencia').delete().eq('id', existingRecords[0].id);
                if (deleteError) {
                    console.error('[SERVER_ACTION_ERROR] setManualPresence/deleteError:', deleteError);
                    return { error: `Erro ao remover presença: ${deleteError.message}` };
                }
            } else { // It's automatic, do not remove
                return { error: 'Não é possível remover uma frequência registrada automaticamente.' };
            }
        } else {
            // Presence does not exist, add it (toggle on)
            const { data: inscricao } = await supabase.from('inscricoes').select('cpf').eq('id', inscricaoId).single();
            if (!inscricao) {
                return { error: 'Inscrição não encontrada.' };
            }
            
            const time = periodo === 'MAT' ? 'T12:00:00.000Z' : 'T20:00:00.000Z';
            const registrationTimestamp = new Date(date + time);

            const { error: insertError } = await supabase.from('frequencia').insert({
                formacao_id: formacaoId,
                inscricao_id: inscricaoId,
                cpf: inscricao.cpf,
                periodo: periodo,
                registered_at: registrationTimestamp.toISOString(),
                source: false, // manual
            });

            if (insertError) {
                console.error('[SERVER_ACTION_ERROR] setManualPresence/insertError:', insertError);
                return { error: `Erro ao adicionar presença manual: ${insertError.message}` };
            }
        }
    } catch(e: any) {
        console.error('[SERVER_ACTION_ERROR] setManualPresence/catchAll:', e);
        return { error: 'Ocorreu um erro inesperado ao processar a data.' };
    }
    
    revalidatePath('/relatorios');
    const updatedPresence = await getPresenceForParticipants(formacaoId, [inscricaoId]);
    return { success: true, updatedPresence };
}


export async function setBulkPresence(
    formacaoId: string,
    inscricaoIds: string[],
    date: string,
    periodo: 'MAT' | 'VESP',
    action: 'add' | 'remove'
) {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    if (!inscricaoIds || inscricaoIds.length === 0) {
        return { error: "Nenhum participante selecionado." };
    }

    try {
        const targetDate = toZonedTime(parseISO(date), saoPauloTimeZone);
        const startOfTargetDay = startOfDay(targetDate);
        const endOfTargetDay = endOfDay(targetDate);

        if (action === 'add') {
            const { data: inscricoes, error: inscricaoError } = await supabase
                .from('inscricoes')
                .select('id, cpf')
                .in('id', inscricaoIds);

            if (inscricaoError) {
                 console.error('[SERVER_ACTION_ERROR] setBulkPresence/fetchInscricoes:', inscricaoError);
                 return { error: `Erro ao buscar CPFs: ${inscricaoError.message}` };
            }
            
            const { data: existingRecords, error: fetchError } = await supabase
                .from('frequencia')
                .select('inscricao_id')
                .in('inscricao_id', inscricaoIds)
                .eq('formacao_id', formacaoId)
                .eq('periodo', periodo)
                .gte('registered_at', startOfTargetDay.toISOString())
                .lte('registered_at', endOfTargetDay.toISOString());

            if (fetchError) {
                console.error('[SERVER_ACTION_ERROR] setBulkPresence/fetchExisting:', fetchError);
                return { error: `Erro ao verificar presenças existentes: ${fetchError.message}` };
            }

            const time = periodo === 'MAT' ? 'T12:00:00.000Z' : 'T20:00:00.000Z';
            const registrationTimestamp = new Date(date + time).toISOString();
            
            const existingInscricaoIds = new Set(existingRecords.map(r => r.inscricao_id));
            const recordsToInsert = inscricoes
                .filter(insc => !existingInscricaoIds.has(insc.id))
                .map(insc => ({
                    formacao_id: formacaoId,
                    inscricao_id: insc.id,
                    cpf: insc.cpf,
                    periodo: periodo,
                    registered_at: registrationTimestamp,
                    source: false, // manual
                }));
            
            if (recordsToInsert.length > 0) {
                 const { error: insertError } = await supabase.from('frequencia').insert(recordsToInsert);
                if (insertError) {
                    console.error('[SERVER_ACTION_ERROR] setBulkPresence/insertError:', insertError);
                    return { error: `Erro ao adicionar presenças em lote: ${insertError.message}` };
                }
            }
           
        } else if (action === 'remove') {
            const { error: deleteError } = await supabase
                .from('frequencia')
                .delete()
                .in('inscricao_id', inscricaoIds)
                .eq('formacao_id', formacaoId)
                .eq('periodo', periodo)
                .eq('source', false) // Only delete manual entries
                .gte('registered_at', startOfTargetDay.toISOString())
                .lte('registered_at', endOfTargetDay.toISOString());
            
            if (deleteError) {
                 console.error('[SERVER_ACTION_ERROR] setBulkPresence/deleteError:', deleteError);
                 return { error: `Erro ao remover presenças em lote: ${deleteError.message}` };
            }
        }

    } catch (e: any) {
        console.error('[SERVER_ACTION_ERROR] setBulkPresence/catchAll:', e);
        return { error: 'Ocorreu um erro inesperado.' };
    }

    const updatedPresence = await getPresenceForParticipants(formacaoId, inscricaoIds);
    revalidatePath('/relatorios');
    return { success: true, updatedPresence };
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
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    const formacaoPromise = supabase.from('formacoes').select('*').eq('id', formacaoId).single();
    const inscricoesPromise = supabase.from('inscricoes').select('*').eq('formacao_id', formacaoId).limit(10000);
    
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

    return { formacao, participants };
}

export async function getPresenceForParticipants(
    formacaoId: string,
    participantIds: string[]
): Promise<Record<string, DetailedParticipant['presencas']>> {
    if (!participantIds || participantIds.length === 0) {
        return {};
    }

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
    
    return result;
}
