
'use server';

import { createClient } from '@/lib/db/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getProfessores } from '@/app/(app)/professores/actions';
import type { TurmaComDados, Serie, ComponenteCurricular, ProfessorComDados, Turno } from '@/lib/types';
import { requireEscolaDoRecurso, requireEscolaEModulo } from '@/lib/auth/guards';
import { lerTurmas, lerTurnos } from '@/lib/dados/leitura';
import { invalidarCacheGeracao } from '@/lib/geracao/dados';
import { resolverTurnoOposto } from '@/lib/turno-oposto';

/* -------------------------------------------------------------------------- */
/*                                  GET TURMAS                                */
/* -------------------------------------------------------------------------- */
export async function getTurmas(escolaId: string): Promise<{ data?: TurmaComDados[], error?: string }> {
    await requireEscolaEModulo(escolaId, 'turmas');
    return lerTurmas(escolaId);
}

/* -------------------------------------------------------------------------- */
/*                              GET DEPENDENCIES                              */
/* -------------------------------------------------------------------------- */
export async function getEnsalamentoDependencies(escolaId: string): Promise<{
    series: (Serie & { turno: Turno | null, componentes: { componente_id: string, aulas_presenciais: number, aulas_nao_presenciais: number, componente: { nome: string, sigla: string } }[] })[],
    professores: ProfessorComDados[],
    componentes: ComponenteCurricular[],
    turnos: Turno[],
}> {
    await requireEscolaEModulo(escolaId, 'turmas');
    const db = await createClient();
    const [seriesResult, professoresResult, componentesResult, turnosResult] = await Promise.all([
        db.from('series').select(`
            *,
            turno:turnos(id, nome),
            componentes:series_componentes(
                componente_id,
                aulas_presenciais,
                aulas_nao_presenciais,
                componente:componentes_curriculares(nome, sigla)
            )
        `).eq('escola_id', escolaId),
        getProfessores(escolaId),
        db.from('componentes_curriculares').select('*').eq('escola_id', escolaId),
        // Os turnos completos (dias, aulas por dia, horários) alimentam a grade da
        // tela de fixação; o `turno` embutido na série só traz id e nome.
        lerTurnos(escolaId),
    ]);

    return {
        series: seriesResult.data as any[] || [],
        professores: professoresResult.data || [],
        componentes: componentesResult.data || [],
        turnos: turnosResult.data || [],
    };
}

/* -------------------------------------------------------------------------- */
/*                                 UPSERT TURMA                               */
/* -------------------------------------------------------------------------- */
const upsertTurmaSchema = z.object({
  id: z.string().optional(),
  escola_id: z.string(),
  serie_id: z.string({ required_error: 'Selecione um modelo de série.' }),
  nome: z.string().min(1, 'O nome/letra da turma é obrigatório.'),
});

export async function upsertTurma(formData: z.infer<typeof upsertTurmaSchema>) {
    await requireEscolaEModulo(formData.escola_id, 'turmas');
    const db = await createClient();
    const validated = upsertTurmaSchema.safeParse(formData);
    if (!validated.success) {
        return { error: 'Dados inválidos.', errors: validated.error.flatten().fieldErrors };
    }
    const { id, ...dataToUpsert } = validated.data;

    const { data, error } = await db
        .from('turmas')
        .upsert(id ? { id, ...dataToUpsert } : dataToUpsert, { onConflict: 'id' })
        .select().single();
    
    if (error) {
        if (error.code === '23505') {
            return { error: `Uma turma com este nome já existe para esta série.` };
        }
        console.error("Error upserting turma:", error);
        return { error: "Não foi possível salvar a turma." };
    }

    revalidatePath('/turmas');
    return { data };
}

/* -------------------------------------------------------------------------- */
/*                                DELETE TURMA                                */
/* -------------------------------------------------------------------------- */
export async function deleteTurma(id: string) {
    await requireEscolaDoRecurso('turmas', id, 'turmas');
    const db = await createClient();
    const { error } = await db.from('turmas').delete().eq('id', id);
    if (error) {
        console.error("Error deleting turma:", error);
        return { error: 'Não foi possível deletar a turma.' };
    }
    revalidatePath('/turmas');
    return { success: true };
}


/* -------------------------------------------------------------------------- */
/*                        UPDATE ALOCAÇÃO DE PROFESSORES                      */
/* -------------------------------------------------------------------------- */
const alocacaoSchema = z.object({
    turma_id: z.string(),
    assignments: z.array(z.object({
        componente_id: z.string(),
        professor_id: z.string().nullable(),
    }))
});

export async function updateAlocacaoProfessores(formData: z.infer<typeof alocacaoSchema>) {
    await requireEscolaDoRecurso('turmas', formData.turma_id, 'turmas');
    const db = await createClient();
    const validated = alocacaoSchema.safeParse(formData);
    if (!validated.success) return { error: 'Dados de alocação inválidos.' };
    
    const { turma_id, assignments } = validated.data;

    // Delete old assignments for this turma
    const { error: deleteError } = await db
        .from('turmas_professores')
        .delete()
        .eq('turma_id', turma_id);

    if (deleteError) {
        console.error("Error deleting old allocation:", deleteError);
        return { error: 'Erro ao limpar alocação antiga.' };
    }

    const toInsert = assignments
        .filter(a => a.professor_id && a.professor_id !== 'none')
        .map(a => ({
            turma_id,
            componente_id: a.componente_id,
            professor_id: a.professor_id!,
        }));

    if (toInsert.length > 0) {
        const { error: insertError } = await db
            .from('turmas_professores')
            .insert(toInsert);
        
        if (insertError) {
            console.error("Error inserting new allocation:", insertError);
            return { error: 'Erro ao salvar a nova alocação.' };
        }
    }

    revalidatePath('/turmas');
    revalidatePath('/relatorios');
    return { success: true };
}


/* -------------------------------------------------------------------------- */
/*                          AULAS FIXAS (TRAVAMENTO)                          */
/* -------------------------------------------------------------------------- */

const aulaFixaInputSchema = z.object({
    id: z.string().optional(),          // presente = registro existente
    componente_id: z.string(),
    tipo_aula: z.enum(['presencial', 'nao_presencial']),
    dia_semana: z.string(),
    aula_index: z.coerce.number().min(0),
});

const aulasFixasSchema = z.object({
    turma_id: z.string(),
    aulas_fixas: z.array(aulaFixaInputSchema).default([]),
});

/**
 * Contexto de validação de uma turma: turno em que ela funciona, turno oposto
 * (para as aulas não presenciais) e a carga horária de cada componente.
 */
async function contextoDaTurma(db: any, turmaId: string) {
    const { data: turma } = await db
        .from('turmas')
        .select('id, escola_id, serie_id, serie:series(id, nome, turno_id)')
        .eq('id', turmaId)
        .single();

    if (!turma?.serie) return { erro: 'Turma não encontrada.' as const };

    const [{ data: turnos }, { data: componentes }] = await Promise.all([
        db.from('turnos').select('*').eq('escola_id', turma.escola_id),
        db
            .from('series_componentes')
            .select('componente_id, aulas_presenciais, aulas_nao_presenciais')
            .eq('serie_id', (turma.serie as any).id),
    ]);

    const turno = (turnos || []).find((t: Turno) => t.id === (turma.serie as any).turno_id) || null;
    if (!turno) return { erro: 'A série desta turma não tem turno definido.' as const };

    return {
        turma,
        turno,
        turnoOposto: resolverTurnoOposto(turno, turnos || []),
        componentes: (componentes || []) as { componente_id: string; aulas_presenciais: number; aulas_nao_presenciais: number }[],
    };
}

export async function updateAulasFixasTurma(formData: z.infer<typeof aulasFixasSchema>) {
    await requireEscolaDoRecurso('turmas', formData.turma_id, 'turmas');
    const db = await createClient();
    const validated = aulasFixasSchema.safeParse(formData);
    if (!validated.success) return { error: 'Dados inválidos.' };

    const { turma_id, aulas_fixas } = validated.data;

    const ctx = await contextoDaTurma(db, turma_id);
    if ('erro' in ctx) return { error: ctx.erro };
    const { turno, turnoOposto, componentes } = ctx;

    // ── 1. Validar as fixações recebidas ────────────────────────────────────
    if (aulas_fixas.length > 0) {
        const carga = new Map<string, number>();
        for (const c of componentes) {
            carga.set(`${c.componente_id}|presencial`, c.aulas_presenciais);
            carga.set(`${c.componente_id}|nao_presencial`, c.aulas_nao_presenciais);
        }

        const contagem = new Map<string, number>();
        for (const f of aulas_fixas) {
            const chave = `${f.componente_id}|${f.tipo_aula}`;
            contagem.set(chave, (contagem.get(chave) || 0) + 1);
        }
        for (const [chave, n] of contagem.entries()) {
            const total = carga.get(chave) ?? 0;
            if (n > total) {
                return { error: `Há ${n} aula(s) travada(s) de um componente que só tem ${total} aula(s) na carga horária. Reduza os travamentos ou aumente a carga na tela de Série.` };
            }
        }

        for (const f of aulas_fixas) {
            // Aula não presencial acontece no contraturno: os limites são os dele.
            const turnoDaAula = f.tipo_aula === 'presencial' ? turno : turnoOposto;
            if (!turnoDaAula) {
                return { error: 'Não há turno oposto ativo para travar aulas não presenciais.' };
            }
            if (!(turnoDaAula.dias_semana || []).includes(f.dia_semana)) {
                return { error: `O dia "${f.dia_semana}" não pertence ao turno ${turnoDaAula.nome}.` };
            }
            if (f.aula_index >= (turnoDaAula.aulas_por_dia || 0)) {
                return { error: `A ${f.aula_index + 1}ª aula ultrapassa o limite do turno ${turnoDaAula.nome} (${turnoDaAula.aulas_por_dia} aulas/dia).` };
            }
        }

        // Um slot, um componente. A uq_turma_slot_unico fecha a porta no banco,
        // mas a mensagem de erro dela não diz nada a quem está na tela.
        const slots = new Map<string, string>();
        for (const f of aulas_fixas) {
            const slot = `${f.tipo_aula}|${f.dia_semana}|${f.aula_index}`;
            const jaTem = slots.get(slot);
            if (jaTem && jaTem !== f.componente_id) {
                return { error: `Dois componentes diferentes estão travados no mesmo horário (${f.dia_semana}, ${f.aula_index + 1}ª aula).` };
            }
            slots.set(slot, f.componente_id);
        }
    }

    // ── 2. Remover o que saiu ───────────────────────────────────────────────
    const { data: existentes } = await db
        .from('turmas_aulas_fixas')
        .select('id')
        .eq('turma_id', turma_id);

    const idsRecebidos = new Set(aulas_fixas.filter(f => f.id).map(f => f.id!));
    const idsParaRemover = (existentes || []).map((f: any) => f.id).filter((id: string) => !idsRecebidos.has(id));

    if (idsParaRemover.length > 0) {
        /*
         * Destravar não pergunta se algum horário já usou aquele travamento.
         *
         * Perguntava, e recusava: "exclua ou regenere o horário antes". Era uma
         * regra sem lastro — a FK de `horario_aulas.aula_fixa_id` é ON DELETE
         * SET NULL, então apagar a fixação nunca deixou órfã nem quebrou grade
         * nenhuma. A aula que estava travada continua exatamente onde está, só
         * que deixa de ser imóvel: é isso que "destravar" quer dizer, e é o que
         * todo leitor de `aula_fixa_id` já entende de um valor nulo.
         *
         * O que a regra fazia de fato era prender o usuário: bastava gerar uma
         * vez para o travamento virar permanente, e desfazê-lo exigia apagar um
         * horário pronto.
         */
        const { error: removeErr } = await db
            .from('turmas_aulas_fixas')
            .delete()
            .in('id', idsParaRemover);
        if (removeErr) return { error: 'Erro ao remover os travamentos antigos.' };
    }

    // ── 3. Persistir ────────────────────────────────────────────────────────
    // INSERT para as novas, UPDATE para as existentes. Nunca um upsert único:
    // registros sem id chegam com id=undefined e violam o NOT NULL da PK.
    const linha = (f: z.infer<typeof aulaFixaInputSchema>) => ({
        turma_id,
        componente_id: f.componente_id,
        tipo_aula: f.tipo_aula,
        dia_semana: f.dia_semana,
        aula_index: f.aula_index,
        updated_at: new Date().toISOString(),
    });

    const novas = aulas_fixas.filter(f => !f.id);
    if (novas.length > 0) {
        const { error: insertErr } = await db
            .from('turmas_aulas_fixas')
            .insert(novas.map(linha));
        if (insertErr) {
            if (insertErr.code === '23505') {
                return { error: 'Dois componentes tentam ocupar o mesmo horário nesta turma.' };
            }
            console.error('Error inserting turmas_aulas_fixas:', insertErr);
            return { error: 'Erro ao salvar os travamentos.' };
        }
    }

    for (const f of aulas_fixas.filter(f => !!f.id)) {
        const { error: updateErr } = await db
            .from('turmas_aulas_fixas')
            .update(linha(f))
            .eq('id', f.id!);
        if (updateErr) {
            if (updateErr.code === '23505') {
                return { error: 'Dois componentes tentam ocupar o mesmo horário nesta turma.' };
            }
            console.error('Error updating turmas_aulas_fixas:', updateErr);
            return { error: 'Erro ao atualizar um travamento.' };
        }
    }

    // O gerador lê as fixas do cache de 30s; sem isto a próxima geração poderia
    // usar a versão anterior.
    invalidarCacheGeracao();
    revalidatePath('/turmas');
    return { success: true };
}

const copiarFixasSchema = z.object({
    origem_turma_id: z.string(),
    destino_turma_id: z.string(),
});

/**
 * Replica os travamentos de uma turma em outra da mesma série, substituindo o
 * que houver no destino. Substituir (em vez de mesclar) é o que mantém a
 * operação previsível: depois dela as duas turmas estão iguais.
 */
export async function copiarAulasFixasTurma(formData: z.infer<typeof copiarFixasSchema>) {
    const validated = copiarFixasSchema.safeParse(formData);
    if (!validated.success) return { error: 'Dados inválidos.' };
    const { origem_turma_id, destino_turma_id } = validated.data;

    if (origem_turma_id === destino_turma_id) return { error: 'Origem e destino são a mesma turma.' };

    await requireEscolaDoRecurso('turmas', origem_turma_id, 'turmas');
    await requireEscolaDoRecurso('turmas', destino_turma_id, 'turmas');

    const db = await createClient();

    const { data: turmas } = await db
        .from('turmas')
        .select('id, serie_id')
        .in('id', [origem_turma_id, destino_turma_id]);

    const origem = (turmas || []).find((t: any) => t.id === origem_turma_id);
    const destino = (turmas || []).find((t: any) => t.id === destino_turma_id);
    if (!origem || !destino) return { error: 'Turma não encontrada.' };
    if (origem.serie_id !== destino.serie_id) {
        return { error: 'Só é possível copiar travamentos entre turmas da mesma série.' };
    }

    const [{ data: fixasOrigem }, { data: fixasDestino }] = await Promise.all([
        db.from('turmas_aulas_fixas').select('*').eq('turma_id', origem_turma_id),
        db.from('turmas_aulas_fixas').select('id').eq('turma_id', destino_turma_id),
    ]);

    const idsDestino = (fixasDestino || []).map((f: any) => f.id);
    if (idsDestino.length > 0) {
        // Mesma decisão do salvar: substituir os travamentos do destino não
        // depende de nenhum horário já gerado (ver o comentário lá).
        const { error: delErr } = await db
            .from('turmas_aulas_fixas')
            .delete()
            .in('id', idsDestino);
        if (delErr) return { error: 'Erro ao limpar os travamentos da turma de destino.' };
    }

    const copias = (fixasOrigem || []).map((f: any) => ({
        turma_id: destino_turma_id,
        componente_id: f.componente_id,
        tipo_aula: f.tipo_aula,
        dia_semana: f.dia_semana,
        aula_index: f.aula_index,
    }));

    if (copias.length > 0) {
        const { error: insErr } = await db.from('turmas_aulas_fixas').insert(copias);
        if (insErr) {
            console.error('Error copying turmas_aulas_fixas:', insErr);
            return { error: 'Erro ao copiar os travamentos.' };
        }
    }

    invalidarCacheGeracao();
    revalidatePath('/turmas');
    return { success: true, copiadas: copias.length, apagadas: idsDestino.length };
}
