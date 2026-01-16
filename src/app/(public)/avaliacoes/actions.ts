'use server';

import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { z } from 'zod';

export async function checkParticipantForAvaliacao(formacaoId: string, cpf: string) {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    // 1. Find Inscricao
    const { data: inscricao, error: inscricaoError } = await supabase
        .from('inscricoes')
        .select('id, nome_completo')
        .eq('formacao_id', formacaoId)
        .eq('cpf', cpf)
        .single();

    if (inscricaoError || !inscricao) {
        return { success: false, error: 'CPF não encontrado na lista de inscritos para esta formação.' };
    }

    // 2. Check if already evaluated
    const { data: existingAvaliacao, error: avaliacaoError } = await supabase
        .from('avaliacoes')
        .select('id')
        .eq('formacao_id', formacaoId)
        .eq('inscricao_id', inscricao.id)
        .single();
    
    if (avaliacaoError && avaliacaoError.code !== 'PGRST116') { // Ignore 'no rows found'
        return { success: false, error: 'Erro ao verificar avaliações anteriores.' };
    }
    if (existingAvaliacao) {
        return { success: false, error: 'Você já enviou uma avaliação para esta formação.' };
    }

    // 3. Check for frequency
    const { data: frequencia, error: frequenciaError } = await supabase
        .from('frequencia')
        .select('id', { count: 'exact' })
        .eq('formacao_id', formacaoId)
        .eq('inscricao_id', inscricao.id);

    if (frequenciaError) {
        return { success: false, error: 'Erro ao verificar sua frequência.' };
    }
    const hasFrequencia = frequencia.length > 0;

    // 4. Fetch formadores
    const { data: formadores, error: formadoresError } = await supabase
        .from('formadores')
        .select('*')
        .eq('formacao_id', formacaoId);

    if (formadoresError) {
        return { success: false, error: 'Erro ao buscar a lista de formadores.' };
    }
    
    // 5. Fetch formacao details to check if attendance is open
    const { data: formacao, error: formacaoError } = await supabase
        .from('formacoes')
        .select('attendance_list_info')
        .eq('id', formacaoId)
        .single();

    if (formacaoError) {
        return { success: false, error: 'Erro ao carregar detalhes da formação.' };
    }


    return { 
        success: true, 
        inscricao,
        formadores: formadores || [],
        hasFrequencia,
        isFrequenciaOpen: formacao?.attendance_list_info?.open === true,
    };
}


const avaliacaoSchema = z.object({
  formacao_id: z.string().uuid(),
  inscricao_id: z.string().uuid(),
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
          return { error: 'Você já enviou uma avaliação para esta formação.' };
      }
      return { error: 'Ocorreu um erro ao enviar sua avaliação.' };
  }

  return { success: true };
}
