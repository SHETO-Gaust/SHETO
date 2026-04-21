'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { Horario, Turno, Escola } from '@/lib/types';
import { sendMassCommunicationEmail } from '@/lib/mail';

export type AuditoriaRow = {
    escola: Escola;
    turnos: (Turno & { 
        rascunhos_count: number;
        publicado: boolean;
    })[];
    status_global: 'sem_dados' | 'em_rascunho' | 'publicado';
};

export type ResumoLimpeza = {
    escola_id: string;
    escolar: string;
    inep: string;
    total_rascunhos: number;
    turnos: { nome: string; rascunhos: number }[];
};

export type AuditoriaStats = {
    totalRascunhos: number;
    totalPublicados: number;
    semDados: number;
    totalEscolas: number;
    regionalStats: { regional: string; publicados: number; pendentes: number; }[];
};

export async function getAuditoriaStats(): Promise<AuditoriaStats> {
    const supabase = await createClient();
    try {
        const { count: totalRascunhos } = await supabase
            .from('horarios')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'em_rascunho');

        const { data: allEscolas } = await supabase.from('escolas').select('id, regional');
        const totalEscolas = allEscolas?.length || 0;

        const { data: pubData } = await supabase
            .from('horarios')
            .select('turnos!inner(escola_id)')
            .eq('status', 'publicado');
            
        const escolasPublicadasSet = new Set((pubData || []).map((d: any) => d.turnos.escola_id));

        const { data: allData } = await supabase
            .from('horarios')
            .select('turnos!inner(escola_id)');
        const escolasComDados = new Set((allData || []).map((d: any) => d.turnos.escola_id)).size;
        
        const semDados = totalEscolas - escolasComDados;

        const regionalMap = new Map<string, { publicados: number, pendentes: number }>();
        allEscolas?.forEach(escola => {
            const reg = escola.regional || 'NÃO DEFINIDA';
            if (!regionalMap.has(reg)) regionalMap.set(reg, { publicados: 0, pendentes: 0 });
            
            const stats = regionalMap.get(reg)!;
            if (escolasPublicadasSet.has(escola.id)) {
                stats.publicados++;
            } else {
                stats.pendentes++;
            }
        });

        const regionalStats = Array.from(regionalMap.entries())
            .map(([regional, counts]) => ({ regional, ...counts }))
            .sort((a, b) => (b.publicados + b.pendentes) - (a.publicados + a.pendentes));

        return {
            totalRascunhos: totalRascunhos || 0,
            totalPublicados: escolasPublicadasSet.size,
            semDados: semDados < 0 ? 0 : semDados,
            totalEscolas,
            regionalStats
        };

    } catch (e) {
        console.error('Erro em getAuditoriaStats:', e);
        return { totalRascunhos: 0, totalPublicados: 0, semDados: 0, totalEscolas: 0, regionalStats: [] };
    }
}

export async function getAuditoriaData({ 
    page = 1, 
    pageSize = 25, 
    search = '',
    status = 'all'
}: { 
    page?: number; 
    pageSize?: number; 
    search?: string; 
    status?: string;
}): Promise<{ data: AuditoriaRow[], total: number, error?: string }> {
    const supabase = await createClient();

    try {
        const start = (page - 1) * pageSize;
        const end = start + pageSize - 1;

        let query = supabase
            .from('escolas')
            .select('*', { count: 'exact' });

        if (search) {
            query = query.or(`escolar.ilike.%${search}%,regional.ilike.%${search}%`);
        }

        if (status && status !== 'all') {
            if (status === 'publicado' || status === 'em_rascunho') {
                const { data: hData } = await supabase.from('horarios').select('turnos!inner(escola_id)').eq('status', status);
                const ids = Array.from(new Set((hData || []).map((d: any) => d.turnos.escola_id)));
                if (ids.length === 0) {
                    return { data: [], total: 0 };
                }
                query = query.in('id', ids);
            } else if (status === 'sem_dados') {
                const { data: hData } = await supabase.from('horarios').select('turnos!inner(escola_id)');
                const ids = Array.from(new Set((hData || []).map((d: any) => d.turnos.escola_id)));
                if (ids.length > 0) {
                    query = query.not('id', 'in', `(${ids.join(',')})`);
                }
            }
        }

        const { data: escolas, count: totalCount, error: eError } = await query
            .order('regional', { ascending: true })
            .order('escolar', { ascending: true })
            .range(start, end);

        if (eError) throw eError;

        if (!escolas || escolas.length === 0) {
            return { data: [], total: totalCount || 0 };
        }

        const escolaIds = escolas.map(e => e.id);

        const { data: turnos, error: tError } = await supabase
            .from('turnos')
            .select('id, nome, escola_id')
            .in('escola_id', escolaIds)
            .eq('ativo', true);

        if (tError) throw tError;

        const turnoIds = turnos ? turnos.map(t => t.id) : [];
        let horarios: any[] = [];

        if (turnoIds.length > 0) {
            const { data: hData, error: hError } = await supabase
                .from('horarios')
                .select('id, turno_id, status')
                .in('turno_id', turnoIds);
                
            if (hError) throw hError;
            horarios = hData || [];
        }

        const result: AuditoriaRow[] = escolas.map(escola => {
            const turnosDaEscola = (turnos || [])
                .filter(t => t.escola_id === escola.id)
                .map(turno => {
                    const horariosDoTurno = horarios.filter(h => h.turno_id === turno.id);
                    const publicado = horariosDoTurno.some(h => h.status === 'publicado');
                    const rascunhos_count = horariosDoTurno.filter(h => h.status === 'em_rascunho').length;

                    return {
                        ...turno,
                        publicado,
                        rascunhos_count
                    } as AuditoriaRow['turnos'][0];
                });

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

        return { data: result, total: totalCount || 0 };
    } catch (error: any) {
        console.error('Erro na auditoria:', error);
        return { error: 'Falha ao buscar dados de auditoria paginados.', data: [], total: 0 };
    }
}

export async function deleteHorarioAuditoria(id: string) {
    const supabase = await createClient();
    const { error } = await supabase.from('horarios').delete().eq('id', id);
    if (error) return { error: 'Não foi possível deletar o horário.' };
    revalidatePath('/auditoria');
    return { success: true };
}

export async function limparRascunhosEscola(escolaId: string) {
    const supabase = await createClient();
    try {
        const { data: turnos, error: tError } = await supabase
            .from('turnos')
            .select('id')
            .eq('escola_id', escolaId);
            
        if (tError) throw tError;
        
        const turnoIds = turnos.map(t => t.id);
        if (turnoIds.length === 0) return { success: true, count: 0 };
        
        const { error, count } = await supabase
            .from('horarios')
            .delete({ count: 'exact' })
            .in('turno_id', turnoIds)
            .eq('status', 'em_rascunho');
            
        if (error) throw error;
        
        revalidatePath('/auditoria');
        return { success: true, count: count || 0 };
    } catch (e: any) {
        console.error('Limpeza Escola:', e);
        return { error: 'Falha ao deletar rascunhos da escola.' };
    }
}

export async function limparRascunhosAntigos(dias: number) {
    const supabase = await createClient();
    const dataCorte = new Date();
    dataCorte.setDate(dataCorte.getDate() - dias);

    try {
        const { error, count } = await supabase
            .from('horarios')
            .delete({ count: 'exact' })
            .eq('status', 'em_rascunho')
            .lt('created_at', dataCorte.toISOString());

        if (error) throw error;
        
        revalidatePath('/auditoria');
        return { success: true, count: count || 0 };
    } catch(e) {
        console.error(e);
        return { error: 'Erro ao realizar limpeza em massa.' };
    }
}

export async function getResumoLimpeza(dias: number): Promise<{ data?: ResumoLimpeza[], error?: string }> {
    const supabase = await createClient();
    const dataCorte = new Date();
    dataCorte.setDate(dataCorte.getDate() - dias);

    try {
        const { data, error } = await supabase
            .from('horarios')
            .select(`
                id,
                turnos!inner (
                    nome,
                    escolas!inner (
                        id, escolar, inep
                    )
                )
            `)
            .eq('status', 'em_rascunho')
            .lt('created_at', dataCorte.toISOString());

        if (error) throw error;

        if (!data || data.length === 0) return { data: [] };

        const map = new Map<string, ResumoLimpeza>();
        for (const row of (data as any[])) {
            const escolaId = row.turnos.escolas.id;
            const turnoNome = row.turnos.nome;

            if (!map.has(escolaId)) {
                map.set(escolaId, {
                    escola_id: escolaId,
                    escolar: row.turnos.escolas.escolar,
                    inep: row.turnos.escolas.inep,
                    total_rascunhos: 0,
                    turnos: []
                });
            }

            const escolaData = map.get(escolaId)!;
            escolaData.total_rascunhos++;
            
            let turnoObj = escolaData.turnos.find(t => t.nome === turnoNome);
            if (!turnoObj) {
                turnoObj = { nome: turnoNome, rascunhos: 0 };
                escolaData.turnos.push(turnoObj);
            }
            turnoObj.rascunhos++;
        }

        const result = Array.from(map.values()).sort((a, b) => b.total_rascunhos - a.total_rascunhos);
        return { data: result };
    } catch (e: any) {
        console.error('Erro Resumo Limpeza:', e);
        return { error: 'Falha ao buscar resumo de limpeza.' };
    }
}

export type UserListItem = {
    id: string;
    nome: string;
    email: string;
    role: string;
};

export async function getUsersForCommunication(): Promise<{ data?: UserListItem[], error?: string }> {
    const supabase = await createClient();
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('id, name, email, role')
            .eq('active', true)
            .order('name', { ascending: true });

        if (error) throw error;

        const result = (data || []).map(p => ({
            id: p.id,
            nome: p.name || p.email.split('@')[0],
            email: p.email,
            role: p.role || 'user'
        }));

        return { data: result };
    } catch (e) {
        console.error('Erro get users:', e);
        return { error: 'Falha ao buscar usuários cadastrados.' };
    }
}

export async function enviarComunicadoMassaAction(data: { titulo: string, html: string, targetIds: string[] | 'all' }) {
    const supabase = await createClient();
    
    // Auth Check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Não autorizado.' };
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return { error: 'Acesso restrito.' };

    try {
        let bccList: string[] = [];

        if (data.targetIds === 'all') {
            const { data: profiles, error } = await supabase
                .from('profiles')
                .select('email')
                .eq('active', true);
            if (error) throw error;
            bccList = (profiles || []).map(p => p.email);
        } else if (data.targetIds.length > 0) {
            const { data: profiles, error } = await supabase
                .from('profiles')
                .select('email')
                .in('id', data.targetIds)
                .eq('active', true);
            if (error) throw error;
            bccList = (profiles || []).map(p => p.email);
        }

        if (bccList.length === 0) {
            return { error: 'Nenhum destinatário válido selecionado.' };
        }

        const result = await sendMassCommunicationEmail({
            bcc: bccList,
            subject: data.titulo,
            htmlContent: data.html
        });

        if (result.error) throw new Error(result.error);

        return { success: true, count: bccList.length };
    } catch (e: any) {
        console.error('Action Comunicado:', e);
        return { error: e.message || 'Falha ao enviar e-mails.' };
    }
}
