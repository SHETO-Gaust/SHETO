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

    if (!turnoResult.data) return { error: 'Turno não encontrado no banco de dados.' };
    const turnoData = turnoResult.data;

    // Filtragem robusta lidando com a possibilidade de 'serie' vir como array ou objeto do Supabase
    const turmasDoTurno = allTurmas?.filter(t => {
        const s = Array.isArray(t.serie) ? t.serie[0] : t.serie;
        return s?.turno_id === turnoId;
    }) || [];

    if (turmasDoTurno.length === 0) {
        const totalTurmas = allTurmas?.length || 0;
        return { 
            error: `Não há turmas vinculadas ao turno selecionado. (Encontradas ${totalTurmas} turmas nesta escola, mas nenhuma pertence ao turno "${turnoData.nome}"). Verifique no Passo 6 se as turmas foram criadas usando o modelo de série correto para este turno.` 
        };
    }

    const cpfs = allProfessores?.map(p => p.cpf).filter(Boolean) || [];
    const { data: globalProfessors } = await supabase.from('professores').select('id').in('cpf', cpfs);
    const professorIdsGlobais = globalProfessors?.map(p => p.id) || [];

    const { data: ocupacoesAtivas } = await supabase
        .from('horario_aulas')
        .select(`
            id, professor_id, dia_semana, aula_index, tipo, horario_id,
            professor:professores(nome_horario, restricoes, cpf),
            turma:turmas(nome),
            componente:componentes_curriculares(nome),
            horario:horarios!inner(
                id, status, turno_id, escola_id, 
                escola:escolas(escolar),
                turno:turnos(*)
            )
        `)
        .in('professor_id', professorIdsGlobais)
        .eq('horarios.status', 'publicado');

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

    if (hError) return { error: 'Falha ao criar registro.' };

    if (aulas.length > 0) {
        const aulasToInsert = aulas.map(a => ({ horario_id: novoHorario.id, ...a }));
        const { error: insertError } = await supabase.from('horario_aulas').insert(aulasToInsert);
        if (insertError) {
            await supabase.from('horarios').delete().eq('id', novoHorario.id);
            return { error: 'Erro ao salvar a grade.' };
        }
    }

    revalidatePath('/gerarhorarios');
    return { data: novoHorario };
}

export async function swapAulasManualmente(aula1Id: string, dia1: string, idx1: number, aula2Id: string | null, dia2: string, idx2: number) {
    const supabase = await createClient();

    try {
        if (aula2Id) {
            await supabase.from('horario_aulas').update({ dia_semana: 'temp', aula_index: -99 }).eq('id', aula1Id);
            await supabase.from('horario_aulas').update({ dia_semana: dia1, aula_index: idx1 }).eq('id', aula2Id);
            await supabase.from('horario_aulas').update({ dia_semana: dia2, aula_index: idx2 }).eq('id', aula1Id);
        } else {
            await supabase.from('horario_aulas').update({ dia_semana: dia2, aula_index: idx2 }).eq('id', aula1Id);
        }

        revalidatePath('/gerarhorarios');
        return { success: true };
    } catch (error) {
        console.error('Erro no swap de aulas:', error);
        return { error: 'Falha ao processar a troca de horários.' };
    }
}

export async function consolidarHorario(id: string) {
    const supabase = await createClient();
    const { data: current } = await supabase.from('horarios').select('turno_id').eq('id', id).single();
    if (!current) return { error: 'Horário não encontrado.' };

    await supabase.from('horarios').update({ status: 'em_rascunho' }).eq('turno_id', current.turno_id).eq('status', 'publicado');
    const { error: uError } = await supabase.from('horarios').update({ status: 'publicado' }).eq('id', id);
    if (uError) return { error: 'Erro ao publicar.' };

    revalidatePath('/gerarhorarios');
    return { success: true };
}

export async function reverterParaRascunho(id: string) {
    const supabase = await createClient();
    const { error } = await supabase.from('horarios').update({ status: 'em_rascunho' }).eq('id', id);
    if (error) return { error: 'Não foi possível reverter para rascunho.' };
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

    const { data: outrasAulasPublicadas } = await supabase
        .from('horario_aulas')
        .select(`
            *, 
            componente:componentes_curriculares(id, nome, sigla), 
            professor:professores(id, nome_horario, cpf, restricoes), 
            turma:turmas(id, nome),
            horario:horarios!inner(id, status, turno_id, turno:turnos(*))
        `)
        .eq('horarios.escola_id', horario.escola_id)
        .eq('horarios.status', 'publicado')
        .neq('horario_id', id);

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
            outras_aulas_publicadas: (outrasAulasPublicadas || []) as any[],
            turmas_config: (turmasConfig || []) as any[]
        }
    };
}
