
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { Horario, Turno, Escola } from '@/lib/types';

export type AuditoriaRow = {
    escola: Escola;
    turnos: (Turno & { 
        rascunhos_count: number;
        rascunhos: (Horario & { dias_vida: number })[];
    })[];
};

export async function getAuditoriaData(): Promise<{ data?: AuditoriaRow[], error?: string }> {
    const supabase = await createClient();

    try {
        // 1. Buscar Escolas
        const { data: escolas, error: eError } = await supabase
            .from('escolas')
            .select('*')
            .order('escolar', { ascending: true });

        if (eError) throw eError;

        // 2. Buscar Turnos Ativos
        const { data: allTurnos, error: tError } = await supabase
            .from('turnos')
            .select('*')
            .eq('ativo', true);

        if (tError) throw tError;

        // 3. Buscar Rascunhos
        const { data: allRascunhos, error: rError } = await supabase
            .from('horarios')
            .select('*')
            .eq('status', 'em_rascunho')
            .order('created_at', { ascending: false });

        if (rError) throw rError;

        const now = new Date();

        const result: AuditoriaRow[] = (escolas || []).map(escola => {
            const turnosDaEscola = (allTurnos || [])
                .filter(t => t.escola_id === escola.id)
                .map(turno => {
                    const rascunhos = (allRascunhos || [])
                        .filter(r => r.turno_id === turno.id)
                        .map(r => ({
                            ...r,
                            dias_vida: Math.floor((now.getTime() - new Date(r.created_at).getTime()) / (1000 * 60 * 60 * 24))
                        }));

                    return {
                        ...turno,
                        rascunhos,
                        rascunhos_count: rascunhos.length
                    };
                });

            return {
                escola,
                turnos: turnosDaEscola
            };
        }).filter(row => row.turnos.length > 0); // Mostra apenas escolas que configuraram turnos

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
