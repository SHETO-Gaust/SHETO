'use server';

import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import type { Formacao, Inscricao, Frequencia, ParticipacaoSummary, FrequenciaPeriodoSummary } from '@/lib/types';
import { revalidatePath } from 'next/cache';

// --- FUNÇÃO AUXILIAR PARA NORMALIZAR DATAS ---
function normalizeDateString(dateStr: string): string {
    if (!dateStr) return '';
    // Se já estiver em formato YYYY-MM-DD (ex: 2024-02-25...)
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}/)) {
        return dateStr.substring(0, 10);
    }
    // Tenta converter se for algo diferente ou timestamp
    try {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
            return d.toISOString().substring(0, 10);
        }
    } catch (e) { }
    return dateStr.substring(0, 10); // Fallback
}

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

    const { data: allInscricoes, error: inscricoesError } = await supabase
        .from('inscricoes')
        .select('id, formacao_id, fonte')
        .eq('formacao_id', formacaoId);
    
    const { data: allFrequencias, error: frequenciasError } = await supabase
        .from('frequencia')
        .select('id, inscricao_id, formacao_id, periodo, registered_at')
        .eq('formacao_id', formacaoId)
        .limit(50000);

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
    
    const inscricoes = allInscricoes || [];
    const frequencias = allFrequencias || [];
    const inscricaoMap = new Map(inscricoes.map(i => [i.id, i.fonte]));

    const matutinoInscritos = new Set<string>();
    const matutinoAvulsos = new Set<string>();
    const vespertinoInscritos = new Set<string>();
    const vespertinoAvulsos = new Set<string>();

    for (const freq of frequencias) {
        const fonte = inscricaoMap.get(freq.inscricao_id);
        if (fonte === undefined) continue;

        const periodo = freq.periodo?.trim().toUpperCase();

        if (periodo === 'MAT') {
            if (fonte === 'AVULSO') {
                matutinoAvulsos.add(freq.inscricao_id);
            } else {
                matutinoInscritos.add(freq.inscricao_id);
            }
        } else if (periodo === 'VESP') {
            if (fonte === 'AVULSO') {
                vespertinoAvulsos.add(freq.inscricao_id);
            } else {
                vespertinoInscritos.add(freq.inscricao_id);
            }
        }
    }

    const matutinoSummary: FrequenciaPeriodoSummary = {
        inscritos: matutinoInscritos.size,
        avulsos: matutinoAvulsos.size,
        total: matutinoInscritos.size + matutinoAvulsos.size,
    };

    const vespertinoSummary: FrequenciaPeriodoSummary = {
        inscritos: vespertinoInscritos.size,
        avulsos: vespertinoAvulsos.size,
        total: vespertinoInscritos.size + vespertinoAvulsos.size,
    };
    
    const geralInscritos = new Set([...matutinoInscritos, ...vespertinoInscritos]);
    const geralAvulsos = new Set([...matutinoAvulsos, ...vespertinoAvulsos]);
    
    const geralSummary: FrequenciaPeriodoSummary = {
        inscritos: geralInscritos.size,
        avulsos: geralAvulsos.size,
        total: geralInscritos.size + geralAvulsos.size,
    };
    
    const totalInscritosPrevistos = inscricoes.filter(i => i.fonte !== 'AVULSO').length;

    const summary: ParticipacaoSummary = {
        formacao,
        totalInscritos: totalInscritosPrevistos,
        frequencia: {
            geral: geralSummary,
            matutino: matutinoSummary,
            vespertino: vespertinoSummary,
        }
    };

    return summary;
}

export async function setManualPresence(inscricaoId: string, formacaoId: string, date: string, periodo: 'MAT' | 'VESP') {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);
    
    try {
        const startOfTargetDay = new Date(`${date}T00:00:00.000Z`);
        const endOfTargetDay = new Date(`${date}T23:59:59.999Z`);

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
            if (existingRecords[0].source === false) { 
                const { error: deleteError } = await supabase.from('frequencia').delete().eq('id', existingRecords[0].id);
                if (deleteError) {
                    console.error('[SERVER_ACTION_ERROR] setManualPresence/deleteError:', deleteError);
                    return { error: `Erro ao remover presença: ${deleteError.message}` };
                }
            } else { 
                return { error: 'Não é possível remover uma frequência registrada automaticamente.' };
            }
        } else {
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
                source: false, 
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
    
    revalidatePath(`/relatorios/${formacaoId}`);
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
        const startOfTargetDay = new Date(`${date}T00:00:00.000Z`);
        const endOfTargetDay = new Date(`${date}T23:59:59.999Z`);

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
                    source: false,
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
                .eq('source', false) 
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

    revalidatePath(`/relatorios/${formacaoId}`);
    revalidatePath('/relatorios');
    const updatedPresence = await getPresenceForParticipants(formacaoId, inscricaoIds);
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
    // Aumentando limite aqui também
    const inscricoesPromise = supabase.from('inscricoes').select('*').eq('formacao_id', formacaoId).limit(50000);
    
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

    console.log(`[DEBUG] Buscando presenças para ${participantIds.length} participantes...`);

    const cookieStore = cookies();
    const supabase = createClient(cookieStore);
    
    const { data: formacao } = await supabase.from('formacoes').select('dates').eq('id', formacaoId).single();
    // Normalização das datas da formação
    const allFormacaoDates = (formacao?.dates as any[] | undefined)?.map((d: any) => normalizeDateString(d.date)) || [];

    // BATCH FETCHING:
    // Mesmo com limit alto, URL longa pode falhar. Vamos dividir em lotes de 200 IDs por vez.
    const BATCH_SIZE = 200;
    let allFrequencias: any[] = [];
    
    for (let i = 0; i < participantIds.length; i += BATCH_SIZE) {
        const batchIds = participantIds.slice(i, i + BATCH_SIZE);
        const { data: batchFrequencies, error } = await supabase
            .from('frequencia')
            .select('inscricao_id, registered_at, periodo, source')
            .eq('formacao_id', formacaoId)
            .in('inscricao_id', batchIds)
            .limit(50000); // Limite alto por lote

        if (error) {
            console.error('[SERVER-ACTION-ERROR] Batch fetch error:', error);
            continue; // Tenta o próximo lote
        }
        if (batchFrequencies) {
            allFrequencias = [...allFrequencias, ...batchFrequencies];
        }
    }

    console.log(`[DEBUG] Total de frequências encontradas no DB: ${allFrequencias.length}`);

    type PresenceInfo = { registered_at: string; source: boolean; } | null;
    const frequenciaMap = new Map<string, { [date: string]: { matutino: PresenceInfo, vespertino: PresenceInfo } }>();

    let matchedCount = 0;

    for (const freq of allFrequencias) {
        // CORREÇÃO DE FUSO -3h (Para pegar o dia "brasileiro" da aula)
        const dateObj = new Date(freq.registered_at);
        const brazilDate = new Date(dateObj.getTime() - 3 * 60 * 60 * 1000); 
        const dateKey = brazilDate.toISOString().substring(0, 10);
        
        if (!frequenciaMap.has(freq.inscricao_id)) {
            frequenciaMap.set(freq.inscricao_id, {});
        }
        const participantData = frequenciaMap.get(freq.inscricao_id)!;

        // Se a data calculada (dateKey) não estiver na lista de datas oficiais da formação,
        // pode ser que a data oficial esteja formatada diferente. Vamos confiar no dateKey calculado.
        if (!participantData[dateKey]) {
            participantData[dateKey] = { matutino: null, vespertino: null };
        }
        
        const presenceInfo = { registered_at: freq.registered_at, source: freq.source };
        const cleanPeriodo = freq.periodo?.trim().toUpperCase();

        if (cleanPeriodo === 'MAT') {
            participantData[dateKey].matutino = presenceInfo;
            matchedCount++;
        } else if (cleanPeriodo === 'VESP') {
            participantData[dateKey].vespertino = presenceInfo;
            matchedCount++;
        }
    }

    console.log(`[DEBUG] Presenças processadas/mapeadas com sucesso: ${matchedCount}`);
    
    const result: Record<string, DetailedParticipant['presencas']> = {};

    for (const participantId of participantIds) {
        const participantFrequencias = frequenciaMap.get(participantId) || {};
        result[participantId] = allFormacaoDates.map(date => ({
            date: date,
            // Acessa direto pela data normalizada
            matutino: participantFrequencias[date]?.matutino || null,
            vespertino: participantFrequencias[date]?.vespertino || null,
        }));
    }
    
    return result;
}
