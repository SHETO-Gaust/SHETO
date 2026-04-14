
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { Turno, Horario, HorarioCompleto, ConfiguracaoGerminacao } from '@/lib/types';
import { gerarHorarioAlgoritmico, type SugestaoRealocacao } from '@/lib/timetabling';
import { getTurmas } from '../turmas/actions';
import { getProfessores } from '../professores/actions';
import { getTurnos } from '../turno/actions';

export async function getTurnosAtivos(escolaId: string): Promise<{ data?: Turno[], error?: string }> {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('turnos')
        .select('*')
        .eq('escola_id', escolaId)
        .eq('ativo', true)
        .order('nome', { ascending: true });

    if (error) return { error: 'Não foi possível buscar os turnos ativos.' };
    return { data: data as Turno[] };
}

export async function getHorariosSalvos(turnoId: string): Promise<{ data?: Horario[], error?: string }> {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('horarios')
        .select('*')
        .eq('turno_id', turnoId)
        .order('created_at', { ascending: false });

    if (error) return { error: 'Não foi possível buscar os horários salvos.' };
    return { data: data as Horario[] };
}

/**
 * Executa um lote de tentativas de geração de horário.
 */
export async function gerarLoteHorario(
    escolaId: string, 
    turnoId: string, 
    configGerminacao: ConfiguracaoGerminacao[],
    loteSize: number = 500,
    progress: number = 0
) {
    const supabase = await createClient();

    const [
        { data: allTurmas },
        { data: allProfessores },
        { data: allTurnos },
        turnoResult
    ] = await Promise.all([
        getTurmas(escolaId),
        getProfessores(escolaId),
        getTurnos(escolaId),
        supabase.from('turnos').select('*').eq('id', turnoId).maybeSingle()
    ]);

    if (!turnoResult.data) return { error: 'Turno não encontrado.' };
    const turnoData = turnoResult.data;

    const turmasDoTurno = allTurmas?.filter(t => t.serie?.turno_id === turnoId) || [];

    if (turmasDoTurno.length === 0) {
        return { error: `Nenhuma turma vinculada ao turno "${turnoData.nome}". Verifique o Passo 6.` };
    }

    // Buscar ocupações de horários publicados para detecção de conflitos (considerando CPF global)
    const cpfs = allProfessores?.map(p => p.cpf).filter(Boolean) || [];
    const allTeacherIds = allProfessores?.map(p => p.id) || [];
    const { data: globalProfessors } = await supabase.from('professores').select('id').in('cpf', cpfs);
    const professorIdsGlobais = Array.from(new Set([...allTeacherIds, ...(globalProfessors?.map(p => p.id) || [])]));

    const { data: ocupacoesAtivas } = await supabase
        .from('horario_aulas')
        .select(`
            id, professor_id, dia_semana, aula_index, tipo, horario_id,
            professor:professores(nome_horario, restricoes, cpf),
            turma:turmas(nome),
            componente:componentes_curriculares(nome),
            horario:horarios!inner(id, status, turno_id, turno:turnos(*))
        `)
        .in('professor_id', professorIdsGlobais)
        .eq('horarios.status', 'publicado');

    // Filtramos ocupações do próprio turno que está sendo gerado (caso seja uma regeração)
    const ocupacoesFiltradas = (ocupacoesAtivas || []).filter(o => (o.horario as any).turno_id !== turnoId);

    const result = gerarHorarioAlgoritmico(
        turnoData as any,
        turmasDoTurno as any[],
        allProfessores as any[],
        allTurnos || [],
        configGerminacao,
        false,
        ocupacoesFiltradas || [],
        loteSize,
        progress
    );

    return result;
}

export async function salvarGradeFinal(escolaId: string, turnoId: string, nome: string, aulas: any[]) {
    const supabase = await createClient();
    
    const { data: novoHorario, error: hError } = await supabase
        .from('horarios')
        .insert({
            escola_id: escolaId,
            turno_id: turnoId,
            nome: nome,
            status: 'em_rascunho',
        })
        .select().single();

    if (hError) return { error: 'Falha ao criar registro do horário.' };

    if (aulas.length > 0) {
        // Deduplicação local e mapeamento correto
        const uniqueMap = new Map();
        const aulasToInsert = [];

        for (const a of aulas) {
            // Chave de unicidade para o novo índice: horario_id, turma_id, dia_semana, aula_index
            const key = `${a.turma_id}|${a.dia_semana}|${a.aula_index}`;
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
                    turno_id: a.turno_id || turnoId // Garante que o turno_id físico seja salvo
                });
            }
        }

        const { error: insertError } = await supabase.from('horario_aulas').insert(aulasToInsert);
        
        if (insertError) {
            console.error('Erro ao salvar aulas:', insertError);
            await supabase.from('horarios').delete().eq('id', novoHorario.id);
            
            if (insertError.code === '23505') {
                return { error: 'O banco de dados impediu o salvamento devido a um conflito de horários. Rode o script SQL de ajuste de índices.' };
            }
            return { error: 'Erro ao salvar os detalhes da grade.' };
        }
    }

    revalidatePath('/gerarhorarios');
    return { data: novoHorario };
}

export async function consolidarHorario(id: string) {
    const supabase = await createClient();
    const { data: current } = await supabase.from('horarios').select('turno_id').eq('id', id).single();
    if (!current) return { error: 'Horário não encontrado.' };

    await supabase.from('horarios').update({ status: 'em_rascunho' }).eq('turno_id', current.turno_id).eq('status', 'publicado');
    const { error: uError } = await supabase.from('horarios').update({ status: 'publicado' }).eq('id', id);
    if (uError) return { error: 'Erro ao consolidar.' };

    revalidatePath('/gerarhorarios');
    return { success: true };
}

export async function reverterParaRascunho(id: string) {
    const supabase = await createClient();
    const { error } = await supabase.from('horarios').update({ status: 'em_rascunho' }).eq('id', id);
    if (error) return { error: 'Não foi possível reverter.' };
    revalidatePath('/gerarhorarios');
    return { success: true };
}

export async function deleteHorario(id: string) {
    const supabase = await createClient();
    const { error } = await supabase.from('horarios').delete().eq('id', id);
    if (error) return { error: 'Não foi possível deletar.' };
    revalidatePath('/gerarhorarios');
    return { success: true };
}

export async function getHorarioDetalhado(id: string): Promise<{ data?: HorarioCompleto, error?: string }> {
    const supabase = await createClient();
    const { data: horario, error: hError } = await supabase.from('horarios').select('*, turno:turnos(*)').eq('id', id).single();
    if (hError || !horario) return { error: 'Horário não encontrado.' };

    const { data: allTurnos } = await supabase.from('turnos').select('*').eq('escola_id', horario.escola_id);
    const nomeTurno = (horario.turno as any).nome.toLowerCase();
    const turnoOposto = allTurnos?.find(t => {
        if (nomeTurno.includes('matutino')) return t.nome.toLowerCase().includes('vespertino');
        if (nomeTurno.includes('vespertino')) return t.nome.toLowerCase().includes('matutino');
        return false;
    }) || allTurnos?.find(t => t.id !== (horario.turno as any).id);

    const { data: aulas } = await supabase
        .from('horario_aulas')
        .select('*, componente:componentes_curriculares(id, nome, sigla), professor:professores(id, nome_horario, cpf, restricoes), turma:turmas(id, nome)')
        .eq('horario_id', id)
        .order('aula_index', { ascending: true });

    const { data: turmasConfig } = await supabase
        .from('turmas')
        .select(`
            id, 
            serie:series(id, componentes:series_componentes(aulas_presenciais, aulas_nao_presenciais, componente:componentes_curriculares(id, nome, sigla))),
            professores:turmas_professores(componente_id, professor:professores(nome_horario))
        `)
        .eq('escola_id', horario.escola_id);

    return { 
        data: {
            ...horario,
            turno: horario.turno as any,
            turno_oposto: turnoOposto as any,
            aulas: (aulas || []) as any[],
            turmas_config: (turmasConfig || []) as any[]
        }
    };
}
