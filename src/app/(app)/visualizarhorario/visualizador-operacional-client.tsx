
'use client';

import { useState, useEffect, useTransition } from 'react';
import type { Turno, HorarioCompleto } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Calendar, AlertCircle } from 'lucide-react';
import { getHorarioPublicadoPorTurno } from './actions';
import { VisualizadorHorarioClient } from '@/app/(app)/gerarhorarios/[id]/visualizador-horario-client';

type Props = {
  turnosAtivos: Turno[];
};

export function VisualizadorOperacionalClient({ turnosAtivos }: Props) {
  const [selectedTurnoId, setSelectedTurnoId] = useState<string>(turnosAtivos[0]?.id || '');
  const [horario, setHorario] = useState<HorarioCompleto | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedTurnoId) {
        startTransition(async () => {
            setError(null);
            const result = await getHorarioPublicadoPorTurno(selectedTurnoId);
            if (result.error) {
                setError(result.error);
                setHorario(null);
            } else {
                setHorario(result.data || null);
            }
        });
    }
  }, [selectedTurnoId]);

  return (
    <div className="space-y-6">
      <Card className="bg-muted/30 border-none shadow-none">
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
                <CardTitle className="text-lg">Selecione o Turno</CardTitle>
                <CardDescription>Alterne entre os turnos para visualizar a grade oficial correspondente.</CardDescription>
            </div>
            <div className="w-full md:w-[300px]">
                <Select value={selectedTurnoId} onValueChange={setSelectedTurnoId}>
                    <SelectTrigger className="h-12 bg-background border-2">
                        <SelectValue placeholder="Escolha um turno..." />
                    </SelectTrigger>
                    <SelectContent>
                        {turnosAtivos.map(turno => (
                            <SelectItem key={turno.id} value={turno.id}>{turno.nome}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
          </div>
        </CardHeader>
      </Card>

      {isPending ? (
        <div className="flex flex-col items-center justify-center p-20 space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary/40" />
            <p className="text-muted-foreground font-medium">Carregando grade oficial...</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center p-20 text-center border-2 border-dashed rounded-xl bg-muted/5">
            <Calendar className="h-16 w-16 text-muted-foreground/20 mb-4" />
            <h3 className="text-lg font-semibold text-muted-foreground">Sem Grade Consolidada</h3>
            <p className="text-sm text-muted-foreground/60 max-w-sm mt-1">
                Ainda não existe um horário marcado como **"Publicado"** para o turno selecionado.
            </p>
        </div>
      ) : horario ? (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            {/* Reusando o visualizador rico que já criamos para o passo 7, que agora suporta a visão global do professor */}
            <VisualizadorHorarioClient horario={horario} />
        </div>
      ) : null}
    </div>
  );
}
