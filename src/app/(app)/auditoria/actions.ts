
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { Horario, Turno, Escola } from '@/lib/types';

export type AuditoriaRow = {
    escola: Escola;
    turnos: (Turno & { 
        rascunhos_count: number;
        publicado: Horario | null;
        rascunhos: (Horario & { dias_vida: number })[];
    })[];
    status_global: 'sem_dados' | 'em_rascunho' | 'publicado';
};

export async function getAuditoriaData(): Promise<{ data?: AuditoriaRow[], error?: string }> {
    const supabase = await createClient();

    try {
        // 1. Buscar Todas as Escolas
        const { data: escolas, error: eError } = await supabase
            .from('escolas')
            .select('*')
            .order('regional', { ascending: true })
            .order('escolar', { ascending: true });

        if (eError) throw eError;

        // 2. Buscar Todos os Turnos Ativos
        const { data: allTurnos, error: tError } = await supabase
            .from('turnos')
            .select('*')
            .eq('ativo', true);

        if (tError) throw tError;

        // 3. Buscar Todos os Horários (Oficiais e Rascunhos)
        const { data: allHorarios, error: rError } = await supabase
            .from('horarios')
            .select('*')
            .order('created_at', { ascending: false });

        if (rError) throw rError;

        const now = new Date();

        const result: AuditoriaRow[] = (escolas || []).map(escola => {
            const turnosDaEscola = (allTurnos || [])
                .filter(t => t.escola_id === escola.id)
                .map(turno => {
                    const horariosDoTurno = (allHorarios || []).filter(h => h.turno_id === turno.id);
                    const publicado = horariosDoTurno.find(h => h.status === 'publicado') || null;
                    const rascunhos = horariosDoTurno
                        .filter(h => h.status === 'em_rascunho')
                        .map(r => ({
                            ...r,
                            dias_vida: Math.floor((now.getTime() - new Date(r.created_at).getTime()) / (1000 * 60 * 60 * 24))
                        }));

                    return {
                        ...turno,
                        publicado,
                        rascunhos,
                        rascunhos_count: rascunhos.length
                    };
                });

            // Definir Status Global da Unidade
            let status_global: 'sem_dados' | 'em_rascunho' | 'publicado' = 'sem_dados';
            if (turnosDaEscola.some(t => t.publicado)) {
                status_global = 'publicado';
            } else if (turnosDaEscola.some(t => t.rascunhos_count > 0)) {
                status_global = 'em_rascunho';
            }

            return {
                escola,
                turnos: turnosDaEscola,
                status_global
            };
        });

        return { data: result };
    } catch (error: any) {
        console.error('Erro na auditoria:', error);
        return { error: 'Falha ao buscar dados de auditoria.' };
    }
}

export async function deleteHorarioAuditoria(id: string) {
    const supabase = await createClient();
    const { error } = await supabase.from('horarios').delete().eq('id', id);
    
    if (error) return { error: 'Não foi possível deletar o horário.' };
    
    revalidatePath('/auditoria');
    return { success: true };
}

export async function limparRascunhosAntigos(dias: number) {
    const supabase = await createClient();
    const dataCorte = new Date();
    dataCorte.setDate(dataCorte.getDate() - dias);

    const { error, count } = await supabase
        .from('horarios')
        .delete()
        .eq('status', 'em_rascunho')
        .lt('created_at', dataCorte.toISOString());

    if (error) return { error: 'Erro ao realizar limpeza em massa.' };
    
    revalidatePath('/auditoria');
    return { success: true, count };
}
