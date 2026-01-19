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
};


export async function checkParticipantForAvaliacao(formacaoId: string, cpf: string) {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    // 1. Fetch formacao details first
    const { data: formacao, error: formacaoError } = await supabase
        .from('formacoes')
        .select('attendance_list_info')
        .eq('id', formacaoId)
        .single();

    if (formacaoError || !formacao) {
        return { success: false, error: 'Erro ao carregar detalhes da formação.' };
    }
    
    const currentPeriod = getCurrentPeriod(formacao.attendance_list_info);
    if (!currentPeriod) {
        return { success: false, error: 'Fora do horário de avaliação. As avaliações seguem os mesmos horários de registro da frequência.' };
    }

    // 2. Find Inscricao
    const { data: inscricao, error: inscricaoError } = await supabase
        .from('inscricoes')
        .select('id, nome_completo')
        .eq('formacao_id', formacaoId)
        .eq('cpf', cpf)
        .single();

    if (inscricaoError || !inscricao) {
        return { success: false, error: 'CPF não encontrado na lista de inscritos para esta formação.' };
    }

    // 3. Check if already evaluated for this period
    const { data: existingAvaliacao, error: avaliacaoError } = await supabase
        .from('avaliacoes')
        .select('id')
        .eq('formacao_id', formacaoId)
        .eq('inscricao_id', inscricao.id)
        .eq('periodo', currentPeriod)
        .single();
    
    if (avaliacaoError && avaliacaoError.code !== 'PGRST116') { // Ignore 'no rows found'
        return { success: false, error: 'Erro ao verificar avaliações anteriores.' };
    }
    if (existingAvaliacao) {
        return { success: false, error: `Você já enviou uma avaliação para o período da ${currentPeriod === 'MAT' ? 'manhã' : 'tarde'}.` };
    }

    // 4. Check for frequency
    const { data: frequencia, error: frequenciaError } = await supabase
        .from('frequencia')
        .select('id', { count: 'exact' })
        .eq('formacao_id', formacaoId)
        .eq('inscricao_id', inscricao.id);

    if (frequenciaError) {
        return { success: false, error: 'Erro ao verificar sua frequência.' };
    }
    const hasFrequencia = frequencia.length > 0;

    // 5. Fetch and filter formadores
    const { data: allFormadores, error: formadoresError } = await supabase
        .from('formadores')
        .select('*')
        .eq('formacao_id', formacaoId);

    if (formadoresError) {
        return { success: false, error: 'Erro ao buscar a lista de formadores.' };
    }
    
    const periodMap = {
        'MAT': 'matutino',
        'VESP': 'vespertino'
    };
    const currentPeriodName = periodMap[currentPeriod];

    const formadores = (allFormadores || []).filter(f => 
        !f.periodo || f.periodo === 'integral' || f.periodo === currentPeriodName
    );


    return { 
        success: true, 
        inscricao,
        formadores: formadores || [],
        hasFrequencia,
        isFrequenciaOpen: formacao?.attendance_list_info?.open === true,
        periodo: currentPeriod,
    };
}


const avaliacaoSchema = z.object({
  formacao_id: z.string().uuid(),
  inscricao_id: z.string().uuid(),
  periodo: z.enum(['MAT', 'VESP']),
  infra_rating: z.coerce.number().min(1).max(5).optional(),
  general_suggestions: z.string().optional(),
  feedback_formadores: z.array(z.any()),
});

export async function submitAvaliacao(formData: any) {
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);

  const validatedFields = avaliacaoSchema.safeParse(formData);

  if (!validatedFields.success) {
      console.error('Validation Error:', validatedFields.error.flatten());
      return { error: 'Dados da avaliação inválidos.' };
  }

  const { error } = await supabase.from('avaliacoes').insert(validatedFields.data);

  if (error) {
      console.error('Supabase Error:', error);
      if (error.code === '23505') { // unique_violation
          return { error: `Você já enviou uma avaliação para este período da formação.` };
      }
      return { error: 'Ocorreu um erro ao enviar sua avaliação.' };
  }

  return { success: true };
}
