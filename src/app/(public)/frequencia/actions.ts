'use server';

import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { toZonedTime } from 'date-fns-tz';
import { isWithinInterval, set } from 'date-fns';

const saoPauloTimeZone = 'America/Sao_Paulo';

const getCurrentPeriod = (attendanceConfig: any) => {
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
                return periodName;
            }
        }
        return null;
    }

    return checkPeriod('morning', periods.morning) || checkPeriod('afternoon', periods.afternoon);
}

export async function checkInscricao(formacaoId: string, cpf: string) {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    // 1. Get formacao to check if attendance is open and get config
    const { data: formacao, error: formacaoError } = await supabase
        .from('formacoes')
        .select('id, attendance_list_info, name, subscription_form_config')
        .eq('id', formacaoId)
        .single();
    
    if (formacaoError || !formacao) {
        return { status: 'ERROR', error: 'Formação não encontrada.' };
    }
    if (!formacao.attendance_list_info?.open) {
        return { status: 'ERROR', error: 'O registro de frequência está fechado para esta formação.' };
    }

    const currentPeriod = getCurrentPeriod(formacao.attendance_list_info);
    if (!currentPeriod) {
        return { status: 'ERROR', error: 'Fora do horário de registro de frequência.' };
    }

    // 2. Check for existing inscricao
    const { data: inscricao, error: inscricaoError } = await supabase
        .from('inscricoes')
        .select('id, nome_completo, email, dados')
        .eq('formacao_id', formacaoId)
        .eq('cpf', cpf)
        .single();
    
    // To provide a better error message, get the user's name even if already registered
    const getNomeCompleto = async () => {
        if (inscricao?.nome_completo) return inscricao.nome_completo;
        const { data: existingInscricao } = await supabase
            .from('inscricoes')
            .select('nome_completo')
            .eq('formacao_id', formacaoId)
            .eq('cpf', cpf)
            .single();
        return existingInscricao?.nome_completo || 'Participante';
    };
    
    // 3. Check for duplicate frequency
    const { data: existingFrequencia, error: frequenciaError } = await supabase
        .from('frequencia')
        .select('id')
        .eq('formacao_id', formacaoId)
        .eq('cpf', cpf)
        .eq('periodo', currentPeriod)
        .limit(1);
    
    if (frequenciaError) {
        console.error('Error checking for existing frequency:', frequenciaError);
        return { status: 'ERROR', error: 'Erro ao verificar registro de frequência.' };
    }
    if (existingFrequencia.length > 0) {
        return { 
            status: 'ALREADY_REGISTERED', 
            error: `Frequência já registrada para o período da ${currentPeriod === 'morning' ? 'manhã' : 'tarde'}.`,
            nome_completo: await getNomeCompleto(),
            formacao_name: formacao.name
        };
    }

    if (inscricaoError && inscricaoError.code !== 'PGRST116') { // Ignore 'no rows' error
        console.error('Error checking for existing inscricao:', inscricaoError);
        return { status: 'ERROR', error: 'Ocorreu um erro ao verificar sua inscrição.' };
    }
    
    if (inscricao) {
        // Found, return user data so client can call registerFrequency
        return { status: 'FOUND', inscricao, formacao_name: formacao.name };
    } else {
        // Not found, prompt for full registration
        if (!formacao.subscription_form_config) {
            return { status: 'ERROR', error: 'O formulário de inscrição para esta formação não foi configurado. Não é possível registrar participantes avulsos.' };
        }
        return { status: 'NOT_FOUND', formacao_name: formacao.name };
    }
}


const fullRegistrationSchema = z.object({
  nome_completo: z.string().min(3),
  cpf: z.string().length(14),
  email: z.string().email(),
  dados: z.record(z.any()).optional(),
});

export async function registerFrequency(formacaoId: string, formData: z.infer<typeof fullRegistrationSchema>) {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    // 1. Validate data
    const validatedFields = fullRegistrationSchema.safeParse(formData);
     if (!validatedFields.success) {
        return { success: false, error: 'Dados inválidos.' };
    }
    const { cpf, nome_completo, email, dados } = validatedFields.data;

    // 2. Re-check attendance window and duplicate frequency
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
    const { data: existingFrequencia } = await supabase
        .from('frequencia')
        .select('id')
        .eq('formacao_id', formacaoId)
        .eq('cpf', cpf)
        .eq('periodo', currentPeriod)
        .limit(1);

    if (existingFrequencia && existingFrequencia.length > 0) {
        return { success: false, error: 'Frequência já registrada para este período.' };
    }
    
    // 3. Create inscricao record if it doesn't exist (avulso)
    const { error: upsertError } = await supabase
        .from('inscricoes')
        .upsert({ formacao_id: formacaoId, cpf, nome_completo, email, dados }, { onConflict: 'formacao_id, cpf' });
    
    if (upsertError) {
         console.error('Error upserting inscricao:', upsertError);
         return { success: false, error: 'Erro ao criar ou atualizar sua inscrição.' };
    }

    // 4. Create frequencia record
    const { error: insertError } = await supabase.from('frequencia').insert({
        formacao_id: formacaoId,
        cpf: cpf,
        nome_completo: nome_completo,
        email: email,
        dados: dados,
        periodo: currentPeriod,
        fonte: dados ? 'avulso' : 'inscrito' // From on-the-spot registration or pre-registered
    });

     if (insertError) {
        console.error('Error inserting frequency:', insertError);
        return { success: false, error: 'Não foi possível registrar sua frequência.' };
    }
    
    return { success: true, nome_completo: nome_completo };
}
