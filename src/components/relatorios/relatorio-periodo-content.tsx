
'use client';

import { Progress } from "@/components/ui/progress";
import type { FrequenciaPeriodoSummary } from "@/lib/types";

type RelatorioPeriodoContentProps = {
    periodoSummary: FrequenciaPeriodoSummary;
    totalInscritos: number;
    periodo: 'geral' | 'matutino' | 'vespertino';
};

export function RelatorioPeriodoContent({ periodoSummary, totalInscritos, periodo }: RelatorioPeriodoContentProps) {
    const { 
        total, 
        inscritos,
        totalAvulsosOrigemMatutino,
        totalAvulsosOrigemVespertino,
        crossoverAvulsos,
    } = periodoSummary;

    const progressValue = totalInscritos > 0 ? (inscritos / totalInscritos) * 100 : 0;
    
    if (totalInscritos === 0 && total === 0) {
        return (
            <div className="text-center text-muted-foreground py-10">
                <p>Nenhum participante previsto ou presente neste período.</p>
            </div>
        );
    }
    
    const renderAvulsosInfo = () => {
        if (periodo === 'geral') {
            return (
                <div className="pt-4 space-y-3">
                    <h4 className="text-sm font-medium text-muted-foreground">Participantes Avulsos (Inscritos no Ato)</h4>
                    <div className="p-3 border rounded-md space-y-2 text-sm">
                        <div className="flex justify-between items-center">
                            <span>Inscrições no Período da Manhã:</span>
                            <span className="font-bold">{totalAvulsosOrigemMatutino ?? 0}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span>Inscrições no Período da Tarde:</span>
                            <span className="font-bold">{totalAvulsosOrigemVespertino ?? 0}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span>Retenção (Manhã → Tarde):</span>
                            <span className="font-bold">{crossoverAvulsos ?? 0}</span>
                        </div>
                    </div>
                </div>
            )
        }
        
        const avulsosCount = periodo === 'matutino' 
            ? totalAvulsosOrigemMatutino 
            : totalAvulsosOrigemVespertino;

        return (
            <div className="grid grid-cols-2 gap-4 pt-2">
                 <div className="p-3 border rounded-md text-center">
                    <p className="text-2xl font-bold">{inscritos}</p>
                    <p className="text-sm text-muted-foreground">Inscritos Presentes</p>
                </div>
                <div className="p-3 border rounded-md text-center">
                    <p className="text-2xl font-bold">{avulsosCount ?? 0}</p>
                    <p className="text-sm text-muted-foreground">Inscrições no Ato</p>
                </div>
            </div>
        )
    }

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

            {renderAvulsosInfo()}
        </div>
    );
}
