'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getSingleAvaliationSummary } from "./actions";
import { Star, Users, BarChart3, Sun, Sunset } from "lucide-react";
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { AvaliacaoSummary, PeriodSummary } from '@/lib/types';

const questionsMap = {
    dominio_tema: 'Domínio do Tema',
    relevancia_profissional: 'Relevância Profissional',
    contribuicao_tema: 'Contribuição do Tema',
    metodologia_adequada: 'Metodologia Adequada'
};

const infraQuestionsMap = {
    espaco_fisico: 'Espaço Físico',
    equipe_apoio: 'Equipe de Apoio',
    internet: 'Internet',
};

const AverageDisplay = ({ label, value, max = 5 }: { label: string, value: number, max?: number }) => (
    <div className="flex justify-between items-center text-sm">
        <p className="text-muted-foreground">{label}</p>
        <div className="flex items-center gap-2 font-semibold">
            <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
            <span>{value.toFixed(1)} / {max}</span>
        </div>
    </div>
);

const PeriodSummaryContent = ({ summary }: { summary: PeriodSummary }) => {
    if (summary.totalAvaliacoes === 0) {
      return (
        <div className="text-center text-muted-foreground py-10">
          <p>Nenhuma avaliação recebida para este período.</p>
        </div>
      );
    }
  
    return (
      <div className="space-y-4">
        <CardDescription className="flex items-center gap-2 pt-1 text-base">
          <Users className="h-4 w-4" />
          {summary.totalAvaliacoes}{' '}
          {summary.totalAvaliacoes === 1
            ? 'avaliação recebida'
            : 'avaliações recebidas'}
        </CardDescription>
        <div>
          <h4 className="font-semibold mb-2">Média Geral dos Formadores</h4>
          <div className="space-y-1 rounded-md border p-3">
            {Object.entries(summary.formadoresAvg).map(([key, value]) => (
              <AverageDisplay
                key={key}
                label={questionsMap[key as keyof typeof questionsMap]}
                value={value}
                max={5}
              />
            ))}
          </div>
        </div>
        <div>
          <h4 className="font-semibold mb-2">Média da Organização e Infraestrutura</h4>
          <div className="space-y-1 rounded-md border p-3">
            {Object.entries(summary.infraestruturaAvg).map(([key, value]) => (
              <AverageDisplay
                key={key}
                label={infraQuestionsMap[key as keyof typeof infraQuestionsMap]}
                value={value}
                max={5}
              />
            ))}
          </div>
        </div>
      </div>
    );
};

type AvaliacaoSummaryCardProps = {
    formacaoId: string;
};

export function AvaliacaoSummaryCard({ formacaoId }: AvaliacaoSummaryCardProps) {
    const [summary, setSummary] = useState<AvaliacaoSummary | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchSummary = async () => {
            setLoading(true);
            const data = await getSingleAvaliationSummary(formacaoId);
            setSummary(data);
            setLoading(false);
        };
        fetchSummary();
    }, [formacaoId]);

    if (loading) {
        return <Skeleton className="h-[28rem] w-full rounded-xl" />;
    }

    if (!summary) {
        return (
            <Card className="flex flex-col h-96 justify-center items-center">
                <CardHeader>
                    <CardTitle className="text-center">Erro ao carregar</CardTitle>
                    <CardDescription>Não foi possível carregar o resumo para esta formação.</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    const { formacao, summaries } = summary;

    return (
        <Card key={formacao.id} className="flex flex-col">
            <CardHeader>
                <CardTitle>{formacao.name}</CardTitle>
            </CardHeader>
            <CardContent className="flex-grow">
                <Tabs defaultValue="geral" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="geral" disabled={summaries.geral.totalAvaliacoes === 0}>
                            <Users className="mr-2 h-4 w-4" /> Geral
                        </TabsTrigger>
                        <TabsTrigger value="matutino" disabled={summaries.matutino.totalAvaliacoes === 0}>
                            <Sun className="mr-2 h-4 w-4" /> Manhã
                        </TabsTrigger>
                        <TabsTrigger value="vespertino" disabled={summaries.vespertino.totalAvaliacoes === 0}>
                            <Sunset className="mr-2 h-4 w-4" /> Tarde
                        </TabsTrigger>
                    </TabsList>
                    <TabsContent value="geral" className="pt-4">
                        <PeriodSummaryContent summary={summaries.geral} />
                    </TabsContent>
                    <TabsContent value="matutino" className="pt-4">
                        <PeriodSummaryContent summary={summaries.matutino} />
                    </TabsContent>
                    <TabsContent value="vespertino" className="pt-4">
                        <PeriodSummaryContent summary={summaries.vespertino} />
                    </TabsContent>
                </Tabs>
            </CardContent>
            <CardFooter>
                <Link href={`/avaliacoes-admin/${formacao.id}`} passHref className="w-full">
                    <Button className="w-full" disabled={summaries.geral.totalAvaliacoes === 0}>
                        <BarChart3 className="mr-2 h-4 w-4" />
                        Ver Detalhes
                    </Button>
                </Link>
            </CardFooter>
        </Card>
    );
}
