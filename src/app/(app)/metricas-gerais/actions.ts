'use server';

import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import type { Formacao, Inscricao, Avaliacao } from '@/lib/types';
import { isPast, isToday } from "date-fns";

// Helper function to determine if a formacao is concluded.
const isConcluida = (formacao: Formacao): boolean => {
    const { dates } = formacao;
    if (!dates || !Array.isArray(dates) || dates.length === 0) {
        return false; 
    }
    const allPast = dates.every((d: any) => isPast(new Date(d.date)) && !isToday(new Date(d.date)));
    return allPast;
}


export async function getFinishedFormacoes(): Promise<Pick<Formacao, 'id' | 'name'>[]> {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    const { data, error } = await supabase
        .from('formacoes')
        .select('id, name, dates')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching formacoes:', error);
        return [];
    }
    
    // Filter for finished formations on the server
    const finished = (data as Formacao[]).filter(isConcluida);

    return finished.map(({ id, name }) => ({ id, name }));
}

export type MetricasData = {
    totalInscritos: number;
    totalAvaliacoes: number;
    totalNaoInscritos: number;
    topFormadores: { name: string; average: number; count: number }[];
    comparecimentoRegional: { regional: string; taxa: number; presentes: number; inscritos: number }[];
    naoInscritosRegional: { regional: string; total: number }[];
}

export async function getMetricasGerais(formacaoIds: string[]): Promise<MetricasData | { error: string }> {
    if (!formacaoIds || formacaoIds.length === 0) {
        return { error: "Nenhuma formação selecionada." };
    }

    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    // Fetch all data in parallel
    const [inscricoesRes, avaliacoesRes, frequenciaRes] = await Promise.all([
        supabase.from('inscricoes').select('id, formacao_id, fonte, dados', { count: 'exact' }).in('formacao_id', formacaoIds),
        supabase.from('avaliacoes').select('feedback_formadores', { count: 'exact' }).in('formacao_id', formacaoIds),
        supabase.from('frequencia').select('inscricao_id').in('formacao_id', formacaoIds)
    ]);

    if (inscricoesRes.error || avaliacoesRes.error || frequenciaRes.error) {
        console.error("Error fetching data for metrics:", inscricoesRes.error || avaliacoesRes.error || frequenciaRes.error);
        return { error: "Falha ao buscar dados para as métricas." };
    }

    const inscricoes = inscricoesRes.data as (Pick<Inscricao, 'id' | 'formacao_id' | 'fonte' | 'dados'>)[] || [];
    const totalInscritos = inscricoesRes.count || 0;
    const avaliacoes = avaliacoesRes.data as (Pick<Avaliacao, 'feedback_formadores'>)[] || [];
    const totalAvaliacoes = avaliacoesRes.count || 0;
    const frequencias = frequenciaRes.data || [];

    // 1. Process Top Formadores
    const formadorScores = new Map<string, { totalScore: number; count: number; name: string }>();
    avaliacoes.forEach(aval => {
        aval.feedback_formadores?.forEach((fb: any) => {
            if (!fb.formador_id || !fb.formador_name) return;
            const avgScore = (fb.dominio_tema + fb.relevancia_profissional + fb.contribuicao_tema + fb.metodologia_adequada) / 4;
            if (!isNaN(avgScore)) {
                const existing = formadorScores.get(fb.formador_id);
                if (existing) {
                    existing.totalScore += avgScore;
                    existing.count++;
                } else {
                    formadorScores.set(fb.formador_id, {
                        totalScore: avgScore,
                        count: 1,
                        name: fb.formador_name,
                    });
                }
            }
        });
    });
    const topFormadores = Array.from(formadorScores.values())
        .map(f => ({ name: f.name, average: f.totalScore / f.count, count: f.count }))
        .sort((a, b) => b.average - a.average);

    // 2. Process Comparecimento por Regional & Nao Inscritos
    const regionaisData = new Map<string, { inscritos: number; presentes: Set<string>; naoInscritos: number }>();
    
    // Create map for fast lookup
    const inscricaoMap = new Map(inscricoes.map(i => [i.id, i]));

    inscricoes.forEach(insc => {
        const regional = insc.dados?.regional || 'Não informada';
        if (!regionaisData.has(regional)) {
            regionaisData.set(regional, { inscritos: 0, presentes: new Set(), naoInscritos: 0 });
        }
        const data = regionaisData.get(regional)!;

        if (insc.fonte === 'AVULSO') {
            data.naoInscritos++;
        } else {
            data.inscritos++;
        }
    });

    frequencias.forEach(freq => {
        const inscricao = inscricaoMap.get(freq.inscricao_id);
        if (inscricao && inscricao.fonte !== 'AVULSO') {
            const regional = inscricao.dados?.regional || 'Não informada';
            if (regionaisData.has(regional)) {
                regionaisData.get(regional)!.presentes.add(inscricao.id);
            }
        }
    });
    
    const comparecimentoRegional = Array.from(regionaisData.entries())
        .map(([regional, data]) => ({
            regional,
            presentes: data.presentes.size,
            inscritos: data.inscritos,
            taxa: data.inscritos > 0 ? (data.presentes.size / data.inscritos) * 100 : 0
        }))
        .filter(item => item.inscritos > 0)
        .sort((a, b) => b.taxa - a.taxa);
        
    const naoInscritosRegional = Array.from(regionaisData.entries())
        .map(([regional, data]) => ({
            regional,
            total: data.naoInscritos,
        }))
        .filter(item => item.total > 0)
        .sort((a, b) => b.total - a.total);

    const totalNaoInscritos = naoInscritosRegional.reduce((sum, item) => sum + item.total, 0);

    return { totalInscritos, totalAvaliacoes, totalNaoInscritos, topFormadores, comparecimentoRegional, naoInscritosRegional };
}
