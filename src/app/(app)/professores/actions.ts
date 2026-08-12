'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import type { ProfessorComDados, ComponenteCurricular, Turno, SolicitacaoRestricao, LivreDocenciaItem, LivreDocenciaPeriodo } from '@/lib/types';
import { sendRestrictionRequestEmail, sendPreferenciasConfirmacaoEmail } from '@/lib/mail';
import { randomBytes } from 'crypto';
import { lerProfessores } from '@/lib/dados/leitura';
import { validateCPF } from '@/lib/utils';
import { requireEscolaDaSolicitacao, requireEscolaDoRecurso, requireEscolaEModulo } from '@/lib/auth/guards';

/* -------------------------------------------------------------------------- */
/* GET PROFESSORES                               */
/* -------------------------------------------------------------------------- */
export async function getProfessores(escolaId: string): Promise<{
  data?: ProfessorComDados[];
  error?: string;
}> {
    await requireEscolaEModulo(escolaId, 'professores');
    return lerProfessores(escolaId);
}

/* -------------------------------------------------------------------------- */
/* UPSERT PROFESSOR                             */
/* -------------------------------------------------------------------------- */
const upsertProfessorSchema = z.object({
  id: z.string().optional(),
  escola_id: z.string(),
  cpf: z.string().min(14, 'O CPF é obrigatório.').refine(validateCPF, 'CPF inválido.'),
  nome_completo: z.string().min(3, 'O nome completo é obrigatório.'),
  nome_horario: z.string().min(2, 'O nome para o horário é obrigatório.'),
  email: z.string().email('Email inválido.').optional().or(z.literal('')),
  turnos_ids: z.array(z.string()).min(1, 'Selecione ao menos um turno.'),
  aulas_disponiveis: z.coerce.number().min(0, 'As aulas disponíveis não podem ser negativas.'),
  aulas_planejamento: z.coerce.number().min(0, 'As aulas de planejamento não podem ser negativas.'),
  componente_ids: z.array(z.string()).optional(),
  restricoes: z.any().optional(),
  livre_docencia: z.array(z.any()).optional(),
  sem_preferencia_livre_docencia: z.boolean().optional(),
  justificativa: z.string().nullable().optional(),
  dias_preferidos: z.array(z.string()).optional(),
});

export async function upsertProfessor(formData: z.infer<typeof upsertProfessorSchema>) {
    await requireEscolaEModulo(formData.escola_id, 'professores');
  const supabase = await createClient(); 
  
  const validated = upsertProfessorSchema.safeParse(formData);
  if (!validated.success) {
    return { error: 'Dados inválidos.', errors: validated.error.flatten().fieldErrors };
  }
  
  const { id, componente_ids, ...dataToUpsert } = validated.data;

  // 1. Verificar vínculos em outras escolas pelo CPF
  const { data: outrosVinculos } = await supabase
    .from('professores')
    .select('escola:escolas(escolar)')
    .eq('cpf', dataToUpsert.cpf)
    .neq('escola_id', dataToUpsert.escola_id);

  const escolasVinculadas = outrosVinculos?.map(v => (v.escola as any)?.escolar).filter(Boolean) || [];
  
  const { data: professor, error } = await supabase
    .from('professores')
    .upsert(id ? { id, ...dataToUpsert } : dataToUpsert, { onConflict: 'id' })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
        return { error: `Este CPF já está cadastrado nesta unidade escolar.` };
    }
    return { error: 'Não foi possível salvar o professor.' };
  }

  // Delete + insert sem checar erro deixava o professor sem NENHUMA disciplina se
  // o insert falhasse: ele some da lista de "professores qualificados" na alocação
  // de turmas, sem nada indicar o motivo.
  if (componente_ids !== undefined) {
    const { error: delLinksError } = await supabase
        .from('professores_componentes')
        .delete()
        .eq('professor_id', professor.id);

    if (delLinksError) {
        console.error('Error clearing professor componentes:', delLinksError);
        return { error: 'O professor foi salvo, mas não foi possível atualizar as disciplinas dele.' };
    }

    if (componente_ids.length > 0) {
        const linksToInsert = componente_ids.map(componente_id => ({ professor_id: professor.id, componente_id }));
        const { error: insLinksError } = await supabase
            .from('professores_componentes')
            .insert(linksToInsert);

        if (insLinksError) {
            console.error('Error inserting professor componentes:', insLinksError);
            return { error: 'O professor foi salvo, mas não foi possível gravar as disciplinas dele. Reabra o cadastro e selecione as disciplinas novamente.' };
        }
    }
  }

  revalidatePath('/professores');
  return { 
    data: professor, 
    alerta: escolasVinculadas.length > 0 
        ? `Atenção: Este professor também possui vínculo nas escolas: ${escolasVinculadas.join(', ')}.` 
        : null 
  };
}

/* -------------------------------------------------------------------------- */
/* DELETE PROFESSOR                             */
/* -------------------------------------------------------------------------- */
export async function deleteProfessor(id: string) {
    await requireEscolaDoRecurso('professores', id, 'professores');
  const supabase = await createClient();
  const { error } = await supabase.from('professores').delete().eq('id', id);
  if (error) return { error: 'Não foi possível deletar the professor.' };
  revalidatePath('/professores');
  return { success: true };
}

/* -------------------------------------------------------------------------- */
/* UPDATE COMPONENTES DO PROFESSOR                     */
/* -------------------------------------------------------------------------- */
export async function updateProfessorComponentes(professorId: string, componenteIds: string[]) {
    await requireEscolaDoRecurso('professores', professorId, 'professores');
    const supabase = await createClient();
    const { error: deleteError } = await supabase.from('professores_componentes').delete().eq('professor_id', professorId);
    if (deleteError) return { error: 'Não foi possível limpar as disciplinas antigas.' };
    if (componenteIds.length > 0) {
        const linksToInsert = componenteIds.map(componente_id => ({ professor_id: professorId, componente_id }));
        const { error: insertError } = await supabase.from('professores_componentes').insert(linksToInsert);
        if (insertError) return { error: 'Não foi possível salvar as novas disciplinas.' };
    }
    revalidatePath('/professores');
    return { success: true };
}

/* -------------------------------------------------------------------------- */
/* UPDATE RESTRIÇÕES DO PROFESSOR                     */
/* -------------------------------------------------------------------------- */
export async function updateProfessorRestricoes(
    professorId: string, 
    restricoes: any, 
    livreDocencia?: any[], 
    semPreferencia: boolean = false,
    diasPreferidos?: string[]
) {
    await requireEscolaDoRecurso('professores', professorId, 'professores');
    const supabase = await createClient();
    const updateData: any = { 
        restricoes,
        sem_preferencia_livre_docencia: semPreferencia
    };
    
    if (semPreferencia) {
        updateData.livre_docencia = [];
    } else if (livreDocencia) {
        updateData.livre_docencia = livreDocencia;
    }

    if (diasPreferidos !== undefined) {
        updateData.dias_preferidos = diasPreferidos;
    }

    const { error: error } = await supabase.from('professores').update(updateData).eq('id', professorId);
    if (error) return { error: 'Não foi possível salvar as restrições de horário.' };
    revalidatePath('/professores');
    return { success: true };
}

/* -------------------------------------------------------------------------- */
/* SOLICITAR RESTRIÇÕES VIA E-MAIL                     */
/* -------------------------------------------------------------------------- */
export async function solicitarRestricoesEmail(professorId: string) {
    await requireEscolaDoRecurso('professores', professorId, 'professores');
    const supabase = await createClient();
    
    const { data: prof, error: pError } = await supabase.from('professores').select('*, escola:escolas(*)').eq('id', professorId).maybeSingle();
    if (pError || !prof) return { error: 'Professor não encontrado.' };
    if (!prof.email) return { error: 'Professor não possui e-mail institucional cadastrado.' };

    const token = randomBytes(32).toString('hex');

    const { error: sError } = await supabase.from('solicitacoes_restricoes').insert({
        professor_id: professorId,
        token,
        status: 'pendente'
    });

    if (sError) return { error: 'Erro ao gerar link de solicitação.' };

    const result = await sendRestrictionRequestEmail({
        to: prof.email,
        name: prof.nome_completo,
        schoolName: (prof as any).escola?.escolar || 'Unidade Escolar',
        token
    });

    if (result.error) return { error: result.error };

    revalidatePath('/professores');
    return { success: true };
}

/* -------------------------------------------------------------------------- */
/* PÁGINA PÚBLICA: GET POR TOKEN                       */
/* -------------------------------------------------------------------------- */
export async function getSolicitacaoByToken(token: string) {
    const supabase = await createAdminClient(); 
    
    const { data: sol, error } = await supabase
        .from('solicitacoes_restricoes')
        .select(`
            *,
            professor:professores(
                id, 
                nome_completo, 
                nome_horario, 
                restricoes,
                livre_docencia,
                sem_preferencia_livre_docencia,
                justificativa,
                dias_preferidos,
                escola:escolas(escolar),
                turnos_ids
            )
        `)
        .eq('token', token)
        .maybeSingle();

    if (error || !sol) return { error: 'Link inválido ou expirado.' };
    if (sol.status === 'respondido' || sol.status === 'concluido') return { error: 'Esta solicitação já foi respondida e não pode ser alterada.' };
    if (new Date(sol.expires_at) < new Date()) return { error: 'Este link expirou.' };

    const professor = (sol as any).professor;
    const { data: turnos } = await supabase.from('turnos').select('*').in('id', professor.turnos_ids);

    return { 
        data: {
            solicitacao: sol,
            professor,
            turnos: (turnos as Turno[]).sort((a,b) => a.nome.localeCompare(b.nome))
        } 
    };
}

/* -------------------------------------------------------------------------- */
/* PÁGINA PÚBLICA: ENVIAR RESPOSTA                     */
/* -------------------------------------------------------------------------- */
export async function responderSolicitacao(
    token: string,
    restricoes: any,
    livreDocencia: LivreDocenciaItem[],
    semPreferencia: boolean,
    justificativa: string,
    diasPreferidos: string[] = []
) {
    const supabase = await createAdminClient();
    
    const { data: sol } = await supabase.from('solicitacoes_restricoes').select('id, status').eq('token', token).maybeSingle();
    if (!sol || sol.status !== 'pendente') return { error: 'Não é possível responder esta solicitação.' };

    const { error } = await supabase
        .from('solicitacoes_restricoes')
        .update({
            dados_temp: restricoes,
            livre_docencia_temp: livreDocencia,
            sem_preferencia_livre_docencia_temp: semPreferencia,
            justificativa: justificativa,
            dias_preferidos_temp: diasPreferidos,
            status: 'respondido'
        })
        .eq('token', token);

    if (error) return { error: 'Falha ao enviar resposta.' };
    return { success: true };
}

/* -------------------------------------------------------------------------- */
/* ADMIN: APLICAR RESPOSTA                             */
/* -------------------------------------------------------------------------- */
export async function processarRespostaRestricao(
    solicitacaoId: string, 
    acao: 'confirmar' | 'rejeitar', 
    dadosFinais?: any, 
    livreDocenciaFinal?: LivreDocenciaItem[],
    semPreferenciaFinal?: boolean,
    justificativaFinal?: string,
    diasPreferidosFinal?: string[],
    enviarEmail: boolean = false
) {
    await requireEscolaDaSolicitacao(solicitacaoId, 'professores');
    const supabase = await createClient();
    
    const { data: sol } = await supabase
        .from('solicitacoes_restricoes')
        .select('*, professor:professores(id, nome_completo, email, escola:escolas(escolar))')
        .eq('id', solicitacaoId)
        .maybeSingle();
    if (!sol) return { error: 'Solicitação não encontrada.' };

    if (acao === 'confirmar') {
        const dadosParaAplicar    = dadosFinais || sol.dados_temp;
        const livreParaAplicar    = livreDocenciaFinal || sol.livre_docencia_temp;
        const semPrefParaAplicar  = semPreferenciaFinal !== undefined ? semPreferenciaFinal : sol.sem_preferencia_livre_docencia_temp;
        const justParaAplicar     = justificativaFinal !== undefined ? justificativaFinal : sol.justificativa;
        // Coordenador pode sobrescrever os dias preferidos na revisão
        const diasParaAplicar     = diasPreferidosFinal !== undefined ? diasPreferidosFinal : ((sol as any).dias_preferidos_temp || []);
        
        const { error: pError } = await supabase
            .from('professores')
            .update({ 
                restricoes: dadosParaAplicar,
                livre_docencia: livreParaAplicar,
                sem_preferencia_livre_docencia: semPrefParaAplicar,
                justificativa: justParaAplicar,
                dias_preferidos: diasParaAplicar,
            })
            .eq('id', sol.professor_id);
        
        if (pError) return { error: 'Erro ao aplicar restrições ao cadastro.' };

        // Enviar e-mail de confirmação se solicitado
        if (enviarEmail) {
            const prof = (sol as any).professor;
            const email = prof?.email;
            const schoolName = prof?.escola?.escolar || 'Unidade Escolar';
            if (email) {
                // Busca nomes dos turnos para o e-mail
                const turnoNomes: Record<string, string> = {};
                const turnoHorarios: Record<string, any[]> = {};
                const restricoesParaEmail = dadosParaAplicar || {};
                const turnoIds = Object.keys(restricoesParaEmail);
                if (turnoIds.length > 0) {
                    const { data: turnosData } = await supabase
                        .from('turnos')
                        .select('id, nome, horarios')
                        .in('id', turnoIds);
                    (turnosData || []).forEach((t: any) => {
                        turnoNomes[t.id] = t.nome;
                        turnoHorarios[t.id] = t.horarios || [];
                    });
                }
                await sendPreferenciasConfirmacaoEmail({
                    to: email,
                    name: prof.nome_completo,
                    schoolName,
                    diasPreferidos: diasParaAplicar,
                    livreDocencia: semPrefParaAplicar ? [] : (livreParaAplicar || []),
                    semPreferencia: semPrefParaAplicar,
                    restricoes: restricoesParaEmail,
                    turnoNomes,
                    turnoHorarios,
                });
            }
        }
    }

    const { error: sError } = await supabase
        .from('solicitacoes_restricoes')
        .update({ status: 'concluido' })
        .eq('id', solicitacaoId);

    if (sError) return { error: 'Erro ao atualizar status da solicitação.' };

    revalidatePath('/professores');
    return { success: true };
}
