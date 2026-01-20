'use server';

import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import type { Formacao, Avaliacao, AvaliacaoSummary, PeriodSummary, AvaliacaoQuestionAvg, InfraestruturaAvaliacao } from '@/lib/types';

const calculateAverages = (avaliacoes: Avaliacao[]): PeriodSummary => {
    const totalAvaliacoes = avaliacoes.length;
    const defaultInfraAvg = { espaco_fisico: 0, equipe_apoio: 0, internet: 0 };
    const defaultFormadoresAvg = {
        dominio_tema: 0,
        relevancia_profissional: 0,
        contribuicao_tema: 0,
        metodologia_adequada: 0,
    };

    if (totalAvaliacoes === 0) {
        return {
            totalAvaliacoes: 0,
            infraestruturaAvg: defaultInfraAvg,
            formadoresAvg: defaultFormadoresAvg,
        };
    }

    const infraEvaluations = avaliacoes.filter(a => a.infraestrutura);
    const infraTotal = infraEvaluations.length;
    const infraSums = infraEvaluations.reduce((acc, aval) => {
        const infra = aval.infraestrutura as InfraestruturaAvaliacao;
        acc.espaco_fisico += infra.espaco_fisico || 0;
        acc.equipe_apoio += infra.equipe_apoio || 0;
        acc.internet += infra.internet || 0;
        return acc;
    }, { espaco_fisico: 0, equipe_apoio: 0, internet: 0 });

    const infraestruturaAvg: InfraestruturaAvaliacao = infraTotal > 0 ? {
        espaco_fisico: infraSums.espaco_fisico / infraTotal,
        equipe_apoio: infraSums.equipe_apoio / infraTotal,
        internet: infraSums.internet / infraTotal,
    } : defaultInfraAvg;

    const allFeedbacks = avaliacoes.flatMap(a => a.feedback_formadores || []);
    const totalFeedbacks = allFeedbacks.length;
    const formadorSums = allFeedbacks.reduce((acc, feedback) => {
        acc.dominio_tema += feedback.dominio_tema || 0;
        acc.relevancia_profissional += feedback.relevancia_profissional || 0;
        acc.contribuicao_tema += feedback.contribuicao_tema || 0;
        acc.metodologia_adequada += feedback.metodologia_adequada || 0;
        return acc;
    }, { dominio_tema: 0, relevancia_profissional: 0, contribuicao_tema: 0, metodologia_adequada: 0 });

    const formadoresAvg: AvaliacaoQuestionAvg = totalFeedbacks > 0 ? {
        dominio_tema: formadorSums.dominio_tema / totalFeedbacks,
        relevancia_profissional: formadorSums.relevancia_profissional / totalFeedbacks,
        contribuicao_tema: formadorSums.contribuicao_tema / totalFeedbacks,
        metodologia_adequada: formadorSums.metodologia_adequada / totalFeedbacks,
    } : defaultFormadoresAvg;

    return {
        totalAvaliacoes,
        infraestruturaAvg,
        formadoresAvg,
    };
};


export async function getAvaliationsSummary(): Promise<AvaliacaoSummary[]> {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    const { data: formacoes, error: formacoesError } = await supabase
        .from('formacoes')
        .select('*')
        .order('created_at', { ascending: false });

    if (formacoesError) {
        console.error('Error fetching formacoes for summary:', formacoesError);
        return [];
    }

    const { data: todasAvaliacoes, error: avaliacoesError } = await supabase
        .from('avaliacoes')
        .select('*');

    if (avaliacoesError) {
        console.error('Error fetching avaliacoes for summary:', avaliacoesError);
        return [];
    }

    const avaliacoesPorFormacao = (todasAvaliacoes as Avaliacao[]).reduce((acc, avaliacao) => {
        if (!acc[avaliacao.formacao_id]) {
            acc[avaliacao.formacao_id] = [];
        }
        acc[avaliacao.formacao_id].push(avaliacao);
        return acc;
    }, {} as { [key: string]: Avaliacao[] });

    const summary: AvaliacaoSummary[] = formacoes.map(formacao => {
        const allAvals = avaliacoesPorFormacao[formacao.id] || [];
        const matutinoAvals = allAvals.filter(a => a.periodo === 'MAT');
        const vespertinoAvals = allAvals.filter(a => a.periodo === 'VESP');

        return {
            formacao,
            summaries: {
                geral: calculateAverages(allAvals),
                matutino: calculateAverages(matutinoAvals),
                vespertino: calculateAverages(vespertinoAvals),
            }
        };
    });

    return summary;
}


export async function getAvaliacaoDetails(formacaoId: string) {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    const formacaoPromise = supabase.from('formacoes').select('*').eq('id', formacaoId).single();
    const avaliacoesPromise = supabase.from('avaliacoes').select('*').eq('formacao_id', formacaoId);
    const inscricoesPromise = supabase.from('inscricoes').select('id, nome_completo, dados').eq('formacao_id', formacaoId);
    const formadoresPromise = supabase.from('formadores').select('id, name').eq('formacao_id', formacaoId);
    
    const [formacaoResult, avaliacoesResult, inscricoesResult, formadoresResult] = await Promise.all([
        formacaoPromise,
        avaliacoesPromise,
        inscricoesPromise,
        formadoresPromise,
    ]);

    if (formacaoResult.error) {
        console.error('Error fetching formacao details:', formacaoResult.error);
        return null;
    }
     if (avaliacoesResult.error) {
        console.error('Error fetching avaliacoes details:', avaliacoesResult.error);
        return null;
    }
     if (inscricoesResult.error) {
        console.error('Error fetching inscricoes details:', inscricoesResult.error);
        return null;
    }
     if (formadoresResult.error) {
        console.error('Error fetching formadores details:', formadoresResult.error);
        return null;
    }

    // Map inscricao names to avaliacoes
    const inscricoesMap = new Map(inscricoesResult.data.map(i => [i.id, i.nome_completo]));
    const avaliacoesWithNames = (avaliacoesResult.data as Avaliacao[]).map(aval => ({
        ...aval,
        nome_participante: inscricoesMap.get(aval.inscricao_id) || 'Participante anônimo'
    }));

    return {
        formacao: formacaoResult.data,
        avaliacoes: avaliacoesWithNames,
        inscricoes: inscricoesResult.data,
        formadores: formadoresResult.data,
    };
}
