
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
    progress: number = 0,
    permitirMesmoProfDisciplinasMesmoDia: boolean = false
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
            id, professor_id, dia_semana, aula_index, tipo, horario_id, turno_id,
            professor:professores(nome_horario, restricoes, cpf),
            turma:turmas(id, nome),
            componente:componentes_curriculares(id, nome),
            horario:horarios!inner(id, status, turno_id, turno:turnos(*))
        `)
        .in('professor_id', professorIdsGlobais)
        .eq('horarios.status', 'publicado');

    // ── FILTRO ANTI-FALSO-CONFLITO ──────────────────────────────────────────────
    // Remove do conjunto de "ocupações externas" qualquer aula cujo horário
    // pertence ao mesmo turno que está sendo gerado agora.  
    // Isso evita que versões já publicadas do próprio turno joguem os professores
    // como "globalmente ocupados" nos mesmos slots, causando falha espúria.
    const ocupacoesFiltradas = (ocupacoesAtivas || []).filter(o => {
        const horarioTurnoId = (o.horario as any).turno_id;
        // Exclui definitivamente aulas do próprio turno sendo gerado
        return horarioTurnoId !== turnoId;
    });

    // ── LOG DE DIAGNÓSTICO (removível em produção) ───────────────────────────
    if (process.env.NODE_ENV !== 'production' || process.env.TIMETABLE_DEBUG === '1') {
        const totalRaw = (ocupacoesAtivas || []).length;
        const totalFiltrado = ocupacoesFiltradas.length;
        const removidos = totalRaw - totalFiltrado;
        console.log(`[GERADOR DEBUG] turnoId=${turnoId}`);
        console.log(`[GERADOR DEBUG] ocupações globais brutas: ${totalRaw}`);
        console.log(`[GERADOR DEBUG] removidas por ser do próprio turno: ${removidos}`);
        console.log(`[GERADOR DEBUG] ocupações globais passadas ao motor: ${totalFiltrado}`);
        console.log(`[GERADOR DEBUG] permitirMesmoProfDisciplinasMesmoDia: ${permitirMesmoProfDisciplinasMesmoDia ? 'RELAXADA (mesmo prof pode dar disciplinas diferentes na mesma turma/dia)' : 'ATIVA (padrão: disciplinas diferentes em dias diferentes)'}`);
        
        // Agrupar por professor para identificar quem está "bloqueando"
        const porProf = new Map<string, number>();
        ocupacoesFiltradas.forEach(o => {
            const nome = (o.professor as any)?.nome_horario || o.professor_id;
            porProf.set(nome, (porProf.get(nome) || 0) + 1);
        });
        if (porProf.size > 0) {
            console.log(`[GERADOR DEBUG] professores com ocupações externas (top 5):`);
            [...porProf.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .forEach(([nome, count]) => console.log(`  - ${nome}: ${count} slots ocupados em outros turnos`));
        }
    }

    // Buscar aulas fixas das séries presentes neste turno
    const serieIds = [...new Set(turmasDoTurno.map((t: any) => t.serie?.id).filter(Boolean))];
    let aulasFixas: any[] = [];
    if (serieIds.length > 0) {
        const { data: fixas } = await supabase
            .from('series_aulas_fixas')
            .select('*')
            .in('serie_id', serieIds);
        aulasFixas = fixas || [];
    }

    const result = gerarHorarioAlgoritmico(
        turnoData as any,
        turmasDoTurno as any[],
        allProfessores as any[],
        allTurnos || [],
        configGerminacao,
        false,
        ocupacoesFiltradas || [],
        loteSize,
        progress,
        aulasFixas,
        permitirMesmoProfDisciplinasMesmoDia
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

        const { error: insertError } = await supabase.from('horario_aulas').insert(aulasToInsert);
        
        if (insertError) {
            console.error('Erro ao salvar aulas:', insertError);
            await supabase.from('horarios').delete().eq('id', novoHorario.id);
            
            if (insertError.code === '23505') {
                return { error: 'Conflito de horários detectado. Por favor, execute o script SQL de atualização de índices no Supabase.' };
            }
            return { error: 'Erro ao salvar os detalhes da grade: ' + insertError.message };
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
        if (nomeTurno.includes('matutino') || nomeTurno.includes('manhã')) return t.nome.toLowerCase().includes('vespertino') || t.nome.toLowerCase().includes('tarde');
        if (nomeTurno.includes('vespertino') || nomeTurno.includes('tarde')) return t.nome.toLowerCase().includes('matutino') || t.nome.toLowerCase().includes('manhã');
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
