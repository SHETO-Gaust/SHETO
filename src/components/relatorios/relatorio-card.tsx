
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ParticipacaoSummary } from "@/lib/types";
import { Users, Sun, Sunset, BarChart3 } from "lucide-react";
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { RelatorioPeriodoContent } from "./relatorio-periodo-content";
import { getParticipationSummary } from '@/app/(app)/relatorios/actions';
import { Skeleton } from '@/components/ui/skeleton';

type RelatorioCardProps = {
    formacaoId: string;
};

export function RelatorioCard({ formacaoId }: RelatorioCardProps) {
    const [summary, setSummary] = useState<ParticipacaoSummary | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchSummary = async () => {
            setLoading(true);
            const data = await getParticipationSummary(formacaoId);
            setSummary(data);
            setLoading(false);
        };
        fetchSummary();
    }, [formacaoId]);

    if (loading) {
        return <Skeleton className="h-96 w-full rounded-xl" />;
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
    
    const { formacao, frequencia, totalInscritos } = summary;

    return (
        <Card key={formacao.id} className="flex flex-col">
            <CardHeader>
                <CardTitle>{formacao.name}</CardTitle>
                 <CardDescription>
                    {totalInscritos} inscrito(s) previsto(s)
                </CardDescription>
            </CardHeader>
            <CardContent className="flex-grow">
                <Tabs defaultValue="geral" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="geral">
                            <Users className="mr-2 h-4 w-4" /> Geral
                        </TabsTrigger>
                        <TabsTrigger value="matutino" disabled={frequencia.matutino.total === 0 && totalInscritos === 0}>
                            <Sun className="mr-2 h-4 w-4" /> Manhã
                        </TabsTrigger>
                        <TabsTrigger value="vespertino" disabled={frequencia.vespertino.total === 0 && totalInscritos === 0}>
                            <Sunset className="mr-2 h-4 w-4" /> Tarde
                        </TabsTrigger>
                    </TabsList>
                    <TabsContent value="geral" className="pt-4">
                        <RelatorioPeriodoContent 
                            periodoSummary={frequencia.geral} 
                            totalInscritos={totalInscritos}
                            periodo="geral" 
                        />
                    </TabsContent>
                    <TabsContent value="matutino" className="pt-4">
                        <RelatorioPeriodoContent 
                            periodoSummary={frequencia.matutino} 
                            totalInscritos={totalInscritos}
                            periodo="matutino" 
                        />
                    </TabsContent>
                    <TabsContent value="vespertino" className="pt-4">
                        <RelatorioPeriodoContent 
                            periodoSummary={frequencia.vespertino} 
                            totalInscritos={totalInscritos}
                            periodo="vespertino" 
                        />
                    </TabsContent>
                </Tabs>
            </CardContent>
            <CardFooter>
                <Link href={`/relatorios/${formacao.id}`} passHref className="w-full">
                    <Button className="w-full">
                        <BarChart3 className="mr-2 h-4 w-4" />
                        Ver Detalhes
                    </Button>
                </Link>
            </CardFooter>
        </Card>
    );
}
