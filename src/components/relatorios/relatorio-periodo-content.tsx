'use client';

import { Progress } from "@/components/ui/progress";
import type { FrequenciaPeriodoSummary } from "@/lib/types";

type RelatorioPeriodoContentProps = {
    periodoSummary: FrequenciaPeriodoSummary;
    totalInscritos: number;
};

export function RelatorioPeriodoContent({ periodoSummary, totalInscritos }: RelatorioPeriodoContentProps) {
    const { total, inscritos, avulsos } = periodoSummary;
    const progressValue = totalInscritos > 0 ? (total / totalInscritos) * 100 : 0;
    
    if (totalInscritos === 0 && total === 0) {
        return (
            <div className="text-center text-muted-foreground py-10">
                <p>Nenhum participante previsto ou presente neste período.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div>
                <div className="flex justify-between items-baseline mb-1">
                    <p className="text-sm font-medium text-muted-foreground">Progresso da Frequência</p>
                    <p className="text-lg font-bold">{total} <span className="text-sm font-normal text-muted-foreground">de {totalInscritos}</span></p>
                </div>
                <Progress value={progressValue} aria-label={`${progressValue.toFixed(0)}% de participação`} />
                 <p className="text-xs text-muted-foreground text-right mt-1">{progressValue.toFixed(1)}% de participação</p>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2">
                 <div className="p-3 border rounded-md text-center">
                    <p className="text-2xl font-bold">{inscritos}</p>
                    <p className="text-sm text-muted-foreground">Inscritos Presentes</p>
                </div>
                <div className="p-3 border rounded-md text-center">
                    <p className="text-2xl font-bold">{avulsos}</p>
                    <p className="text-sm text-muted-foreground">Avulsos Presentes</p>
                </div>
            </div>
        </div>
    );
}
