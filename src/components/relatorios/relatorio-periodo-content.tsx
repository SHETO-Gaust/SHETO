
'use client';

import { Progress } from "@/components/ui/progress";
import type { FrequenciaPeriodoSummary } from "@/lib/types";

const MetricCard = ({ title, value }: { title: string, value: number }) => (
    <div className="p-3 border rounded-md text-center">
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-sm text-muted-foreground">{title}</p>
    </div>
);

type RelatorioPeriodoContentProps = {
    periodoSummary: FrequenciaPeriodoSummary;
    totalInscritos: number;
    periodo: 'geral' | 'matutino' | 'vespertino';
};

export function RelatorioPeriodoContent({ periodoSummary, totalInscritos, periodo }: RelatorioPeriodoContentProps) {
    const { 
        total, 
        inscritos,
        avulsos,
    } = periodoSummary;

    const progressValue = totalInscritos > 0 ? (inscritos / totalInscritos) * 100 : 0;
    
    if (totalInscritos === 0 && total === 0) {
        return (
            <div className="text-center text-muted-foreground py-10">
                <p>Nenhum participante previsto ou presente neste período.</p>
            </div>
        );
    }
    
    if (periodo === 'geral') {
        return (
            <div className="space-y-4">
                <div>
                    <div className="flex justify-between items-baseline mb-1">
                        <p className="text-sm font-medium text-muted-foreground">Comparecimento dos Inscritos</p>
                        <p className="text-lg font-bold">{inscritos} <span className="text-sm font-normal text-muted-foreground">de {totalInscritos}</span></p>
                    </div>
                    <Progress value={progressValue} aria-label={`${progressValue.toFixed(0)}% de participação dos inscritos`} />
                    <p className="text-xs text-muted-foreground text-right mt-1">{progressValue.toFixed(1)}% de participação dos inscritos</p>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-2">
                    <MetricCard title="Total de Participantes (Únicos)" value={total} />
                    <MetricCard title="Total de Avulsos Presentes (Únicos)" value={avulsos} />
                </div>
            </div>
        )
    }

    // For 'matutino' and 'vespertino'
    return (
        <div className="grid grid-cols-2 gap-4 pt-2">
            <MetricCard title="Inscritos Presentes" value={inscritos} />
            <MetricCard title="Avulsos Presentes" value={avulsos} />
        </div>
    )
}
