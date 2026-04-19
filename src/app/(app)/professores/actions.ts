'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import type { ProfessorComDados, ComponenteCurricular, Turno, SolicitacaoRestricao, LivreDocenciaItem, LivreDocenciaPeriodo } from '@/lib/types';
<<<<<<< HEAD
import { sendRestrictionRequestEmail } from '@/lib/mail';
=======
import { sendRestrictionRequestEmail, sendPreferenciasConfirmacaoEmail } from '@/lib/mail';
>>>>>>> 3bc12c2 (teste)
import { randomBytes } from 'crypto';
import { validateCPF } from '@/lib/utils';

/* -------------------------------------------------------------------------- */
/* GET PROFESSORES                               */
/* -------------------------------------------------------------------------- */
export async function getProfessores(escolaId: string): Promise<{
  data?: ProfessorComDados[];
  error?: string;
}> {
  const supabase = await createClient();

  try {
    const { data: professores, error: profError } = await supabase
      .from('professores')
      .select('*')
      .eq('escola_id', escolaId)
      .order('nome_completo', { ascending: true });

    if (profError) throw profError;
    if (!professores || professores.length === 0) return { data: [] };

    const professorIds = professores.map(p => p.id);
    
    const [
        { data: links },
        { data: componentes },
        { data: turnos },
        { data: solicitacoes }
    ] = await Promise.all([
        supabase.from('professores_componentes').select('professor_id, componente_id').in('professor_id', professorIds),
        supabase.from('componentes_curriculares').select('id, nome, sigla').eq('escola_id', escolaId),
        supabase.from('turnos').select('*').eq('escola_id', escolaId),
        supabase.from('solicitacoes_restricoes').select('*').in('professor_id', professorIds).neq('status', 'concluido').order('created_at', { ascending: false })
    ]);

    const componentesMap = new Map(componentes?.map(c => [c.id, c]) || []);
    const turnosMap = new Map(turnos?.map(t => [t.id, t]) || []);

    const professoresComDados: ProfessorComDados[] = professores.map(prof => {
      const professorComponenteIds = links?.filter(l => l.professor_id === prof.id).map(l => l.componente_id) || [];
      const professorComponentes = professorComponenteIds.map(id => componentesMap.get(id)).filter((c): c is Pick<ComponenteCurricular, 'id' | 'nome' | 'sigla'> => !!c);
      const professorTurnos = (prof.turnos_ids || []).map(id => turnosMap.get(id)).filter((t): t is Turno => !!t);
      const sol = solicitacoes?.find(s => s.professor_id === prof.id) || null;

      return {
        ...prof,
        componentes: professorComponentes,
        turnos: professorTurnos,
        solicitacao_pendente: sol as SolicitacaoRestricao
      };
    });

    return { data: professoresComDados };
  } catch (error: any) {
    console.error('Error fetching professors data:', error);
    return { error: 'Não foi possível buscar os dados dos professores.' };
  }
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
<<<<<<< HEAD
=======
  dias_preferidos: z.array(z.string()).optional(),
>>>>>>> 3bc12c2 (teste)
});

export async function upsertProfessor(formData: z.infer<typeof upsertProfessorSchema>) {
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
    return { error: 'Não foi possível salvar the professor.' };
  }

  if (componente_ids !== undefined) {
    await supabase.from('professores_componentes').delete().eq('professor_id', professor.id);
    if (componente_ids.length > 0) {
        const linksToInsert = componente_ids.map(componente_id => ({ professor_id: professor.id, componente_id }));
        await supabase.from('professores_componentes').insert(linksToInsert);
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
<<<<<<< HEAD
    semPreferencia: boolean = false
=======
    semPreferencia: boolean = false,
    diasPreferidos?: string[]
>>>>>>> 3bc12c2 (teste)
) {
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

<<<<<<< HEAD
=======
    if (diasPreferidos !== undefined) {
        updateData.dias_preferidos = diasPreferidos;
    }

>>>>>>> 3bc12c2 (teste)
    const { error: error } = await supabase.from('professores').update(updateData).eq('id', professorId);
    if (error) return { error: 'Não foi possível salvar as restrições de horário.' };
    revalidatePath('/professores');
    return { success: true };
}

/* -------------------------------------------------------------------------- */
/* SOLICITAR RESTRIÇÕES VIA E-MAIL                     */
/* -------------------------------------------------------------------------- */
export async function solicitarRestricoesEmail(professorId: string) {
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
<<<<<<< HEAD
=======
                dias_preferidos,
>>>>>>> 3bc12c2 (teste)
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
<<<<<<< HEAD
export async function responderSolicitacao(token: string, restricoes: any, livreDocencia: LivreDocenciaItem[], semPreferencia: boolean, justificativa: string) {
=======
export async function responderSolicitacao(
    token: string,
    restricoes: any,
    livreDocencia: LivreDocenciaItem[],
    semPreferencia: boolean,
    justificativa: string,
    diasPreferidos: string[] = []
) {
>>>>>>> 3bc12c2 (teste)
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
<<<<<<< HEAD
=======
            dias_preferidos_temp: diasPreferidos,
>>>>>>> 3bc12c2 (teste)
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
<<<<<<< HEAD
    justificativaFinal?: string
) {
    const supabase = await createClient();
    
    const { data: sol } = await supabase.from('solicitacoes_restricoes').select('*').eq('id', solicitacaoId).maybeSingle();
    if (!sol) return { error: 'Solicitação não encontrada.' };

    if (acao === 'confirmar') {
        const dadosParaAplicar = dadosFinais || sol.dados_temp;
        const livreParaAplicar = livreDocenciaFinal || sol.livre_docencia_temp;
        const semPrefParaAplicar = semPreferenciaFinal !== undefined ? semPreferenciaFinal : sol.sem_preferencia_livre_docencia_temp;
        const justParaAplicar = justificativaFinal !== undefined ? justificativaFinal : sol.justificativa;
=======
    justificativaFinal?: string,
    diasPreferidosFinal?: string[],
    enviarEmail: boolean = false
) {
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
>>>>>>> 3bc12c2 (teste)
        
        const { error: pError } = await supabase
            .from('professores')
            .update({ 
                restricoes: dadosParaAplicar,
                livre_docencia: livreParaAplicar,
                sem_preferencia_livre_docencia: semPrefParaAplicar,
<<<<<<< HEAD
                justificativa: justParaAplicar
=======
                justificativa: justParaAplicar,
                dias_preferidos: diasParaAplicar,
>>>>>>> 3bc12c2 (teste)
            })
            .eq('id', sol.professor_id);
        
        if (pError) return { error: 'Erro ao aplicar restrições ao cadastro.' };
<<<<<<< HEAD
=======

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
>>>>>>> 3bc12c2 (teste)
    }

    const { error: sError } = await supabase
        .from('solicitacoes_restricoes')
        .update({ status: 'concluido' })
        .eq('id', solicitacaoId);

    if (sError) return { error: 'Erro ao atualizar status da solicitação.' };

    revalidatePath('/professores');
    return { success: true };
}
