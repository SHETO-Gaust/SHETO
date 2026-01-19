'use server';

import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import type { Formacao, Avaliacao, AvaliacaoSummary, AvaliacaoQuestionAvg, InfraestruturaAvaliacao } from '@/lib/types';

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
        const avaliacoes = avaliacoesPorFormacao[formacao.id] || [];
        const totalAvaliacoes = avaliacoes.length;
        const defaultInfraAvg = { espaco_fisico: 0, equipe_apoio: 0, internet: 0 };

        if (totalAvaliacoes === 0) {
            return {
                formacao,
                totalAvaliacoes: 0,
                infraestruturaAvg: defaultInfraAvg,
                formadoresAvg: {
                    dominio_tema: 0,
                    relevancia_profissional: 0,
                    contribuicao_tema: 0,
                    metodologia_adequada: 0,
                }
            };
        }

        // Calculate infraestrutura average
        const infraSums = { espaco_fisico: 0, equipe_apoio: 0, internet: 0 };
        const infraCounts = { espaco_fisico: 0, equipe_apoio: 0, internet: 0 };

        avaliacoes.forEach(aval => {
            if (aval.infraestrutura) {
                const infra = aval.infraestrutura as InfraestruturaAvaliacao;
                 if (infra.espaco_fisico) {
                    infraSums.espaco_fisico += infra.espaco_fisico;
                    infraCounts.espaco_fisico++;
                }
                if (infra.equipe_apoio) {
                    infraSums.equipe_apoio += infra.equipe_apoio;
                    infraCounts.equipe_apoio++;
                }
                if (infra.internet) {
                    infraSums.internet += infra.internet;
                    infraCounts.internet++;
                }
            }
        });

        const infraestruturaAvg: InfraestruturaAvaliacao = {
            espaco_fisico: infraCounts.espaco_fisico > 0 ? infraSums.espaco_fisico / infraCounts.espaco_fisico : 0,
            equipe_apoio: infraCounts.equipe_apoio > 0 ? infraSums.equipe_apoio / infraCounts.equipe_apoio : 0,
            internet: infraCounts.internet > 0 ? infraSums.internet / infraCounts.internet : 0,
        };

        // Calculate formadores averages
        const formadorSums = { dominio_tema: 0, relevancia_profissional: 0, contribuicao_tema: 0, metodologia_adequada: 0 };
        const formadorCounts = { dominio_tema: 0, relevancia_profissional: 0, contribuicao_tema: 0, metodologia_adequada: 0 };
        
        avaliacoes.forEach(aval => {
            if (Array.isArray(aval.feedback_formadores)) {
                aval.feedback_formadores.forEach(feedback => {
                    Object.keys(formadorSums).forEach(key => {
                        if (feedback[key]) {
                            formadorSums[key as keyof typeof formadorSums] += feedback[key];
                            formadorCounts[key as keyof typeof formadorCounts]++;
                        }
                    });
                });
            }
        });
        
        const formadoresAvg: AvaliacaoQuestionAvg = {
            dominio_tema: formadorCounts.dominio_tema > 0 ? formadorSums.dominio_tema / formadorCounts.dominio_tema : 0,
            relevancia_profissional: formadorCounts.relevancia_profissional > 0 ? formadorSums.relevancia_profissional / formadorCounts.relevancia_profissional : 0,
            contribuicao_tema: formadorCounts.contribuicao_tema > 0 ? formadorSums.contribuicao_tema / formadorCounts.contribuicao_tema : 0,
            metodologia_adequada: formadorCounts.metodologia_adequada > 0 ? formadorSums.metodologia_adequada / formadorCounts.metodologia_adequada : 0,
        };

        return {
            formacao,
            totalAvaliacoes,
            infraestruturaAvg,
            formadoresAvg
        };
    });

    return summary;
}
