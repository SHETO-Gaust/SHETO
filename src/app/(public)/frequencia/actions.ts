
'use server';

import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { toZonedTime } from 'date-fns-tz';
import { set, isWithinInterval } from 'date-fns';

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
}

export async function checkInscricao(formacaoId: string, cpf: string) {
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

    const { data: inscricao, error: inscricaoError } = await supabase
        .from('inscricoes')
        .select('id, nome_completo, email, dados')
        .eq('formacao_id', formacaoId)
        .eq('cpf', cpf)
        .single();
    
    if (inscricaoError && inscricaoError.code !== 'PGRST116') { // Ignore 'no rows' error
        console.error('Error checking for existing inscricao:', inscricaoError);
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
            console.error('Error checking for existing frequency:', frequenciaError);
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
    }),
    z.object({ // New user
        nome_completo: z.string().min(3),
        cpf: z.string().length(14),
        email: z.string().email(),
        dados: z.record(z.any()).optional(),
    })
]);

export async function registerFrequency(formacaoId: string, formData: any) {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);
    
    const validatedFields = registrationSchema.safeParse(formData);
    if (!validatedFields.success) {
        console.error('Validation failed:', validatedFields.error.flatten());
        return { success: false, error: 'Dados de registro inválidos.' };
    }

    const { data: formacao, error: formacaoError } = await supabase
        .from('formacoes')
        .select('id, attendance_list_info')
        .eq('id', formacaoId)
        .single();

    if (formacaoError || !formacao || !formacao.attendance_list_info?.open) {
        return { success: false, error: 'O registro de frequência está fechado.' };
    }
    const currentPeriod = getCurrentPeriod(formacao.attendance_list_info);
    if (!currentPeriod) {
        return { success: false, error: 'Fora do horário de registro de frequência.' };
    }
    
    let inscricaoId: string;
    let nomeCompleto: string;
    const isAvulso = !('inscricao_id' in validatedFields.data);

    if (isAvulso) {
        const { nome_completo, cpf, email, dados } = validatedFields.data;
        const { data: newInscrito, error: upsertError } = await supabase
            .from('inscricoes')
            .upsert({ formacao_id: formacaoId, cpf, nome_completo, email, dados }, { onConflict: 'formacao_id, cpf' })
            .select('id, nome_completo')
            .single();

        if (upsertError) {
            console.error('Error upserting inscricao:', upsertError);
            return { success: false, error: `Erro ao criar ou atualizar sua inscrição: ${upsertError.message}` };
        }
        inscricaoId = newInscrito.id;
        nomeCompleto = newInscrito.nome_completo;
    } else {
        inscricaoId = validatedFields.data.inscricao_id;
        nomeCompleto = validatedFields.data.nome_completo;
    }

    const { data: existingFrequencia, error: frequenciaError } = await supabase
        .from('frequencia')
        .select('id')
        .eq('formacao_id', formacaoId)
        .eq('inscricao_id', inscricaoId)
        .eq('periodo', currentPeriod)
        .limit(1);

    if (frequenciaError) {
        console.error('Error checking for existing frequency:', frequenciaError);
        return { success: false, error: `Erro ao verificar frequência: ${frequenciaError.message}` };
    }
    if (existingFrequencia && existingFrequencia.length > 0) {
        return { success: false, error: 'Frequência já registrada para este período.' };
    }
    
    const { error: insertError } = await supabase.from('frequencia').insert({
        formacao_id: formacaoId,
        inscricao_id: inscricaoId,
        periodo: currentPeriod,
    });

    if (insertError) {
        console.error('Error inserting frequency:', insertError);
        return { success: false, error: `Erro ao registrar frequência: ${insertError.message}` };
    }
    
    return { success: true, nome_completo: nomeCompleto };
}
