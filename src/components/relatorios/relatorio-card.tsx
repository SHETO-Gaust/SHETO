'use client';

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Formacao, ParticipacaoSummary } from "@/lib/types";
import { Users, Sun, Sunset, BarChart3 } from "lucide-react";
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { RelatorioPeriodoContent } from "./relatorio-periodo-content";
import { getSingleParticipacaoSummary } from "@/app/(app)/relatorios/actions";
import { Skeleton } from "@/components/ui/skeleton";

type RelatorioCardProps = {
    formacao: Formacao;
};

const RelatorioCardSkeleton = () => (
    <Card className="flex flex-col">
        <CardHeader>
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
        </CardHeader>
        <CardContent className="flex-grow">
            <Skeleton className="h-10 w-full" />
            <div className="pt-4 space-y-4">
                <div className="space-y-2">
                    <div className="flex justify-between items-baseline mb-1">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-5 w-16" />
                    </div>
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-20 ml-auto" />
                </div>
                 <div className="grid grid-cols-2 gap-4 pt-2">
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                 </div>
            </div>
        </CardContent>
        <CardFooter>
            <Skeleton className="h-10 w-full" />
        </CardFooter>
    </Card>
);


export function RelatorioCard({ formacao }: RelatorioCardProps) {
    const [summary, setSummary] = useState<Omit<ParticipacaoSummary, 'formacao'> | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchSummary = async () => {
            setLoading(true);
            const summaryData = await getSingleParticipacaoSummary(formacao.id);
            setSummary(summaryData);
            setLoading(false);
        };
        fetchSummary();
    }, [formacao.id]);

    if (loading || !summary) {
        return <RelatorioCardSkeleton />;
    }

    const { frequencia, totalInscritos } = summary;

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
                        />
                    </TabsContent>
                    <TabsContent value="matutino" className="pt-4">
                        <RelatorioPeriodoContent 
                            periodoSummary={frequencia.matutino} 
                            totalInscritos={totalInscritos} 
                        />
                    </TabsContent>
                    <TabsContent value="vespertino" className="pt-4">
                        <RelatorioPeriodoContent 
                            periodoSummary={frequencia.vespertino} 
                            totalInscritos={totalInscritos} 
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
