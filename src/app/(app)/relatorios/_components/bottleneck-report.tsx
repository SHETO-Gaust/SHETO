
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

const DIAS_LABELS: Record<string, string> = {
    segunda: 'Seg', terca: 'Ter', quarta: 'Qua', quinta: 'Qui', sexta: 'Sex', sabado: 'Sáb'
};

export function BottleneckReport({ data }: { data: any }) {
  const { heatmap, numTurmas, turnoNome } = data;

  return (
    <div className="space-y-6">
      <Alert className="bg-primary/5 border-primary/20">
        <Info className="h-4 w-4 text-primary" />
        <AlertTitle className="font-bold text-primary">Como ler este mapa?</AlertTitle>
        <AlertDescription className="text-sm">
          Este mapa mostra quantos professores estão disponíveis para dar aula em cada horário do turno <strong>{turnoNome}</strong>. 
          Como você tem <strong>{numTurmas} turmas</strong>, cada horário precisa de pelo menos <strong>{numTurmas} professores</strong> livres.
          Células em <span className="text-destructive font-bold">vermelho</span> indicam que o horário não poderá ser gerado sem ajustes.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Mapa de Disponibilidade Docente</CardTitle>
          <CardDescription>Visualização de gargalos baseada nas restrições e planejamentos marcados.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border overflow-hidden bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="p-4 text-left border-r w-32 font-bold">Horário</th>
                    {heatmap.map((d: any) => (
                      <th key={d.dia} className="p-4 text-center font-bold">{DIAS_LABELS[d.dia] || d.dia}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {heatmap[0]?.slots.map((_: any, aulaIdx: number) => (
                    <tr key={aulaIdx} className="border-b last:border-0 h-20">
                      <td className="p-4 font-bold bg-muted/20 border-r">{aulaIdx + 1}ª Aula</td>
                      {heatmap.map((d: any) => {
                        const slot = d.slots[aulaIdx];
                        const isCritical = slot.disponiveis < numTurmas;
                        
                        return (
                          <td key={d.dia} className={cn("p-2 text-center transition-colors", isCritical ? "bg-destructive/10" : "bg-green-50/30 dark:bg-green-950/10")}>
                            <div className={cn(
                                "flex flex-col items-center justify-center p-2 rounded-lg border shadow-sm h-full",
                                isCritical ? "border-destructive/30 bg-background" : "border-green-200 bg-background dark:border-green-900"
                            )}>
                                <span className={cn("text-lg font-black", isCritical ? "text-destructive" : "text-green-700 dark:text-green-400")}>
                                    {slot.disponiveis}
                                </span>
                                <span className="text-[9px] uppercase font-bold text-muted-foreground tracking-tighter">
                                    Prof. Disponíveis
                                </span>
                                {isCritical && (
                                    <div className="mt-1 flex items-center gap-1 text-[9px] font-black text-destructive animate-pulse">
                                        <AlertCircle className="h-2 w-2" /> FALTA {numTurmas - slot.disponiveis}
                                    </div>
                                )}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
