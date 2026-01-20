'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ParticipacaoSummary } from "@/lib/types";
import { Users, Sun, Sunset, BarChart3 } from "lucide-react";
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { RelatorioPeriodoContent } from "./relatorio-periodo-content";

type RelatorioCardProps = {
    summary: ParticipacaoSummary;
};

export function RelatorioCard({ summary }: RelatorioCardProps) {
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
