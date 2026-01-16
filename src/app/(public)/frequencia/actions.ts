
'use server';

import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { toZonedTime } from 'date-fns-tz';
import { set, isWithinInterval } from 'date-fns';
import type { Coordinates } from '@/lib/types';

const saoPauloTimeZone = 'America/Sao_Paulo';

const getCurrentPeriod = (attendanceConfig: any): 'MAT' | 'VESP' | null => {
    const nowInSaoPaulo = toZonedTime(new Date(), saoPauloTimeZone);
    const periods = attendanceConfig?.periods;
    if (!periods) return null;

    const checkPeriod = (periodName: 'morning' | 'afternoon', periodConfig: any) => {
        if (periodConfig?.enabled) {
            const [startHour, startMinute] = periodConfig.startTime.split(':').map(Number);
            const [endHour, endMinute] = periodConfig.endTime.split(':').map(Number);
            
            const start = set(nowInSaoPaulo, { hours: startHour, minutes: startMinute, seconds: 0, milliseconds: 0 });
            const end = set(nowInSaoPaulo, { hours: endHour, minutes: endMinute, seconds: 0, milliseconds: 0 });
            
            if (isWithinInterval(nowInSaoPaulo, { start, end })) {
                return periodName === 'morning' ? 'MAT' : 'VESP';
            }
        }
        return null;
    }

    return checkPeriod('morning', periods.morning) || checkPeriod('afternoon', periods.afternoon);
};

// Haversine formula to calculate distance between two points in meters
const getDistance = (coords1: Coordinates, coords2: Coordinates): number => {
    const R = 6371e3; // metres
    const φ1 = coords1.latitude * Math.PI / 180;
    const φ2 = coords2.latitude * Math.PI / 180;
    const Δφ = (coords2.latitude - coords1.latitude) * Math.PI / 180;
    const Δλ = (coords2.longitude - coords1.longitude) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
};


export async function checkInscricao(formacaoId: string, cpf: string, userCoords?: Coordinates) {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    const { data: formacao, error: formacaoError } = await supabase
        .from('formacoes')
        .select('id, attendance_list_info, name, subscription_form_config')
        .eq('id', formacaoId)
        .single();
    
    if (formacaoError || !formacao) {
        return { status: 'ERROR', error: `Formação não encontrada: ${formacaoError?.message}` };
    }
    if (!formacao.attendance_list_info?.open) {
        return { status: 'ERROR', error: 'O registro de frequência está fechado para esta formação.' };
    }

    const currentPeriod = getCurrentPeriod(formacao.attendance_list_info);
    if (!currentPeriod) {
        return { status: 'ERROR', error: 'Fora do horário de registro de frequência.' };
    }
    
    // Geolocation check
    const geoConfig = formacao.attendance_list_info.geolocation;
    if (geoConfig?.enabled && geoConfig.locations?.length > 0) {
        if (!userCoords) {
            return { status: 'ERROR', error: 'Sua localização é necessária para registrar a frequência.' };
        }
        const isWithinRadius = geoConfig.locations.some(loc => {
            const distance = getDistance(userCoords, { latitude: loc.latitude, longitude: loc.longitude });
            return distance <= loc.radius;
        });
        if (!isWithinRadius) {
            return { status: 'ERROR', error: 'Você precisa estar dentro do local do evento para poder registrar a frequência.' };
        }
    }


    const { data: inscricao, error: inscricaoError } = await supabase
        .from('inscricoes')
        .select('id, nome_completo, email, dados')
        .eq('formacao_id', formacaoId)
        .eq('cpf', cpf)
        .single();
    
    if (inscricaoError && inscricaoError.code !== 'PGRST116') { // Ignore 'no rows' error
        console.error('[SERVER_ACTION_ERROR] checkInscricao/inscricaoError:', {
            message: inscricaoError.message,
            details: inscricaoError.details,
            code: inscricaoError.code,
        });
        return { status: 'ERROR', error: `Erro ao verificar inscrição: ${inscricaoError.message}` };
    }
    
    if (inscricao) {
        const { data: existingFrequencia, error: frequenciaError } = await supabase
            .from('frequencia')
            .select('id')
            .eq('formacao_id', formacaoId)
            .eq('inscricao_id', inscricao.id)
            .eq('periodo', currentPeriod)
            .limit(1);

        if (frequenciaError) {
             console.error('[SERVER_ACTION_ERROR] checkInscricao/frequenciaError:', {
                message: frequenciaError.message,
                details: frequenciaError.details,
                code: frequenciaError.code,
            });
            return { status: 'ERROR', error: `Erro ao verificar frequência: ${frequenciaError.message}` };
        }
        if (existingFrequencia.length > 0) {
            return { 
                status: 'ALREADY_REGISTERED', 
                error: `Frequência já registrada para o período da ${currentPeriod === 'MAT' ? 'manhã' : 'tarde'}.`,
                nome_completo: inscricao.nome_completo,
                formacao_name: formacao.name
            };
        }
        return { status: 'FOUND', inscricao, formacao_name: formacao.name };
    } else {
        if (!formacao.subscription_form_config) {
            return { status: 'ERROR', error: 'O formulário de inscrição para esta formação não foi configurado. Não é possível registrar participantes avulsos.' };
        }
        return { status: 'NOT_FOUND', formacao_name: formacao.name };
    }
}


const registrationSchema = z.union([
    z.object({ // Existing user
        inscricao_id: z.string().uuid(),
        nome_completo: z.string(),
        cpf: z.string().length(14),
    }),
    z.object({ // New user
        nome_completo: z.string().min(3),
        cpf: z.string().length(14),
        email: z.string().email(),
        dados: z.record(z.any()).optional(),
    })
]);

export async function registerFrequency(formacaoId: string, formData: any, userCoords?: Coordinates): Promise<any> {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);
    
    const validatedFields = registrationSchema.safeParse(formData);
    if (!validatedFields.success) {
        const errorMsg = `Dados de registro inválidos: ${JSON.stringify(validatedFields.error.flatten())}`;
        console.error('[SERVER_ACTION_ERROR] registerFrequency/validation:', errorMsg);
        return { success: false, error: `Dados de registro inválidos: ${validatedFields.error.message}` };
    }

    const { data: formacao, error: formacaoError } = await supabase
        .from('formacoes')
        .select('id, attendance_list_info')
        .eq('id', formacaoId)
        .single();

    if (formacaoError || !formacao || !formacao.attendance_list_info?.open) {
        const errorMsg = 'O registro de frequência está fechado.';
        console.error('[SERVER_ACTION_ERROR] registerFrequency:', errorMsg);
        return { success: false, error: errorMsg };
    }
    const currentPeriod = getCurrentPeriod(formacao.attendance_list_info);
    if (!currentPeriod) {
        const errorMsg = 'Fora do horário de registro de frequência.';
        console.error('[SERVER_ACTION_ERROR] registerFrequency:', errorMsg);
        return { success: false, error: errorMsg };
    }
    
    // Geolocation check
    const geoConfig = formacao.attendance_list_info.geolocation;
    if (geoConfig?.enabled && geoConfig.locations?.length > 0) {
        if (!userCoords) {
            return { success: false, error: 'Sua localização é necessária para registrar a frequência.' };
        }
        const isWithinRadius = geoConfig.locations.some(loc => {
            const distance = getDistance(userCoords, { latitude: loc.latitude, longitude: loc.longitude });
            return distance <= loc.radius;
        });
        if (!isWithinRadius) {
            return { success: false, error: 'Você precisa estar dentro do local do evento para poder registrar a frequência.' };
        }
    }
    
    let inscricaoId: string;
    let nomeCompleto: string;
    let finalCpf: string;
    const isAvulso = !('inscricao_id' in validatedFields.data);

    if (isAvulso) {
        const { nome_completo, cpf, email, dados } = validatedFields.data;
        const { data: newInscrito, error: insertError } = await supabase
            .from('inscricoes')
            .insert({ formacao_id: formacaoId, cpf, nome_completo, email, dados })
            .select('id, nome_completo')
            .single();

        if (insertError) {
             console.error('[SERVER_ACTION_ERROR] registerFrequency/insertError:', {
                message: insertError.message,
                details: insertError.details,
                code: insertError.code,
            });
            return { success: false, error: `Erro ao criar sua inscrição: ${insertError.message}` };
        }
        inscricaoId = newInscrito.id;
        nomeCompleto = newInscrito.nome_completo;
        finalCpf = cpf;
    } else {
        inscricaoId = validatedFields.data.inscricao_id;
        nomeCompleto = validatedFields.data.nome_completo;
        finalCpf = validatedFields.data.cpf;
    }

    const { data: existingFrequencia, error: frequenciaError } = await supabase
        .from('frequencia')
        .select('id')
        .eq('formacao_id', formacaoId)
        .eq('inscricao_id', inscricaoId)
        .eq('periodo', currentPeriod)
        .limit(1);

    if (frequenciaError) {
        console.error('[SERVER_ACTION_ERROR] registerFrequency/frequenciaError:', {
            message: frequenciaError.message,
            details: frequenciaError.details,
            code: frequenciaError.code,
        });
        return { success: false, error: `Erro ao verificar frequência: ${frequenciaError.message}` };
    }
    if (existingFrequencia && existingFrequencia.length > 0) {
        return { success: false, error: 'Frequência já registrada para este período.' };
    }
    
    const { error: insertError } = await supabase.from('frequencia').insert({
        formacao_id: formacaoId,
        inscricao_id: inscricaoId,
        cpf: finalCpf,
        periodo: currentPeriod,
    });

    if (insertError) {
        console.error('[SERVER_ACTION_ERROR] registerFrequency/insertError:', {
            message: insertError.message,
            details: insertError.details,
            code: insertError.code,
        });
        return { success: false, error: `Erro ao registrar frequência: ${insertError.message}` };
    }
    
    return { success: true, nome_completo: nomeCompleto, periodo: currentPeriod };
}
