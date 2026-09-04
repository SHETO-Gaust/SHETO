/**
 * Gravação de uma grade gerada.
 *
 * Separado da Server Action `salvarGradeFinal` porque o orquestrador da geração
 * em segundo plano chama isto FORA de uma requisição: ali não existe sessão para
 * `requireEscolaEModulo` checar nem rota para `revalidatePath` invalidar — as
 * duas coisas ficam no invólucro que a tela usa.
 */

import { createClient } from '@/lib/db/server';
import { registrarLog } from '@/lib/log-geracao';
import type { PendenciaDetalhada } from '@/lib/types';
import { invalidarCacheGeracao } from './dados';

export type ResultadoSalvamento = { data?: any; error?: string };

export async function salvarGrade(
    escolaId: string,
    turnoId: string,
    nome: string,
    aulas: any[],
    status: 'em_rascunho' | 'pre_producao',
    inep: string,
    /**
     * O que o motor não conseguiu alocar. Sem isto a grade parcial guarda só as
     * aulas que couberam, e o buraco na tela fica indistinguível de um intervalo.
     */
    pendencias?: PendenciaDetalhada[] | null
): Promise<ResultadoSalvamento> {
    const db = await createClient();

    const { data: novoHorario, error: hError } = await db
        .from('horarios')
        .insert({
            escola_id: escolaId,
            turno_id: turnoId,
            nome: nome,
            status,
            pendencias: pendencias?.length ? pendencias : null,
        })
        .select().single();

    if (hError) {
        registrarLog(inep, `SALVAR FALHOU | "${nome}" | turno=${turnoId} | ${hError.message}`);
        return { error: 'Falha ao criar registro do horário.' };
    }

    if (aulas.length > 0) {
        const uniqueMap = new Map();
        const aulasToInsert = [];

        for (const a of aulas) {
            // Chave de unicidade sincronizada com o NOVO índice do banco
            const key = `${novoHorario.id}|${a.turma_id}|${a.dia_semana}|${a.aula_index}|${a.turno_id}`;
            if (!uniqueMap.has(key)) {
                uniqueMap.set(key, true);
                aulasToInsert.push({
                    horario_id: novoHorario.id,
                    turma_id: a.turma_id,
                    componente_id: a.componente_id,
                    professor_id: (a.professor_id && a.professor_id !== 'none') ? a.professor_id : null,
                    dia_semana: a.dia_semana,
                    aula_index: a.aula_index,
                    tipo: a.tipo,
                    turno_id: a.turno_id,
                    // Campos de rastreamento de aulas fixas/compartilhadas
                    aula_fixa_id: a.aula_fixa_id || null,
                    compartilhada: a.compartilhada || false,
                    aula_compartilhada_id: a.aula_compartilhada_id || null,
                });
            }
        }

        const { error: insertError } = await db.from('horario_aulas').insert(aulasToInsert);

        if (insertError) {
            console.error('Erro ao salvar aulas:', insertError);
            registrarLog(
                inep,
                `SALVAR FALHOU | "${nome}" | ${aulasToInsert.length} aulas | ` +
                    `codigo=${insertError.code ?? '-'} | ${insertError.message}`
            );
            await db.from('horarios').delete().eq('id', novoHorario.id);

            if (insertError.code === '23505') {
                return { error: 'Conflito de horários detectado. Por favor, execute o script SQL de atualização de índices no banco.' };
            }
            return { error: 'Erro ao salvar os detalhes da grade: ' + insertError.message };
        }

        registrarLog(
            inep,
            `GRADE SALVA | "${nome}" | status=${status} | horario_id=${novoHorario.id} | ` +
                `${aulasToInsert.length} aulas gravadas` +
                (aulas.length !== aulasToInsert.length ? ` (${aulas.length - aulasToInsert.length} duplicadas descartadas)` : '')
        );
    }

    // A grade recém-salva vira ocupação para as próximas gerações (é assim que a
    // geração "Todos os Turnos" evita choque entre turnos): o cache tem que cair.
    invalidarCacheGeracao();
    return { data: novoHorario };
}

/**
 * Converte as grades gravadas como pré-produção durante a geração multi-turno em
 * rascunhos de verdade.
 *
 * Enquanto a geração corre, cada turno concluído fica em 'pre_producao' para que
 * o turno seguinte enxergue as ocupações que ele reservou. Terminado o job (com
 * sucesso OU cancelado no meio), o que sobrou são grades válidas e precisam
 * aparecer para o usuário como rascunho — deixá-las em pré-produção era
 * exatamente o que acontecia quando alguém fechava a aba no meio.
 */
export async function converterPreProducao(horarioIds: string[]): Promise<{ error?: string }> {
    if (horarioIds.length === 0) return {};
    const db = await createClient();
    const { error } = await db
        .from('horarios')
        .update({ status: 'em_rascunho' })
        .in('id', horarioIds);

    if (error) return { error: `Falha ao converter os horários de pré-produção: ${error.message}` };
    invalidarCacheGeracao();
    return {};
}
