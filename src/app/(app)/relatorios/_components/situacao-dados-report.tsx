'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SituacaoDados } from "@/lib/types";
import { BookOpen, GraduationCap, Layers, Sun, Users } from "lucide-react";

type SituacaoDadosReportProps = {
    data: SituacaoDados;
};

const MetricCard = ({ title, value, icon: Icon }: { title: string, value: number, icon: React.ElementType }) => (
    <div className="flex items-center p-4 border rounded-lg gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon className="h-6 w-6" />
        </div>
        <div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-sm text-muted-foreground">{title}</p>
        </div>
    </div>
);


export function SituacaoDadosReport({ data }: SituacaoDadosReportProps) {
  return (
    <Card>
        <CardHeader>
            <CardTitle>Situação dos Dados Cadastrados</CardTitle>
            <CardDescription>Visão geral da quantidade de registros em cada etapa do sistema.</CardDescription>
        </CardHeader>
        <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <MetricCard title="Turnos" value={data.turnos} icon={Sun} />
                <MetricCard title="Níveis de Ensino" value={data.niveisEnsino} icon={GraduationCap} />
                <MetricCard title="Componentes" value={data.componentes} icon={BookOpen} />
                <MetricCard title="Professores" value={data.professores} icon={Users} />
                <MetricCard title="Séries" value={data.series} icon={Layers} />
            </div>
        </CardContent>
    </Card>
  );
}
