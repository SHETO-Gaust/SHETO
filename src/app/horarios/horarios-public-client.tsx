
'use client';

import { useState, useMemo } from 'react';
import type { HorarioCompleto, Turno } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { Clock, Calendar } from 'lucide-react';

type Props = {
  horarios: HorarioCompleto[];
};

const DIAS_SEMANA_MAP = [
  { id: 'segunda', label: 'Segunda' }, { id: 'terca', label: 'Terça' },
  { id: 'quarta', label: 'Quarta' }, { id: 'quinta', label: 'Quinta' },
  { id: 'sexta', label: 'Sexta' }, { id: 'sabado', label: 'Sábado' },
];

export function HorariosPublicClient({ horarios }: Props) {
  const [selectedHorarioId, setSelectedHorarioId] = useState<string>(horarios[0]?.id || '');
  
  const currentHorario = useMemo(() => 
    horarios.find(h => h.id === selectedHorarioId) || horarios[0],
    [horarios, selectedHorarioId]
  );

  const turmas = useMemo(() => {
    if (!currentHorario) return [];
    const map = new Map();
    currentHorario.aulas.forEach(aula => {
      if (!map.has(aula.turma_id)) {
        map.set(aula.turma_id, aula.turma);
      }
    });
    return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [currentHorario]);

  const [selectedTurmaId, setSelectedTurmaId] = useState<string>(turmas[0]?.id || '');

  const diasAtivos = useMemo(() => {
    if (!currentHorario) return [];
    return DIAS_SEMANA_MAP.filter(d => currentHorario.turno.dias_semana.includes(d.id));
  }, [currentHorario]);

  const GradeHoraria = ({ turmaId, tipo, label, turnoInfo }: { turmaId: string, tipo: 'presencial' | 'nao_presencial', label: string, turnoInfo: Turno | null }) => {
    if (!turnoInfo || !currentHorario) return null;

    const getAulaNoSlot = (dia: string, index: number) => {
        return currentHorario.aulas.find(a => 
            a.turma_id === turmaId && 
            a.dia_semana === dia && 
            a.aula_index === index &&
            a.tipo === tipo
        );
    };

    const hasAulas = currentHorario.aulas.some(a => a.turma_id === turmaId && a.tipo === tipo);
    if (!hasAulas && tipo === 'nao_presencial') return null;

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 border-l-4 border-primary pl-3 py-1">
                <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
                    {label} <span className="text-muted-foreground font-normal">({turnoInfo.nome})</span>
                </h3>
            </div>
            <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                    <tr className="bg-muted/50 border-b">
                        <th className="p-4 text-left font-semibold border-r w-32">Horário</th>
                        {diasAtivos.map(dia => (
                        <th key={dia.id} className="p-4 text-center font-semibold min-w-[140px]">
                            {dia.label}
                        </th>
                        ))}
                    </tr>
                    </thead>
                    <tbody>
                    {Array.from({ length: turnoInfo.aulas_por_dia }).map((_, aulaIndex) => (
                        <tr key={aulaIndex} className="border-b last:border-0 hover:bg-muted/5 transition-colors h-24">
                        <td className="p-4 font-medium bg-muted/10 border-r">
                            <div className="font-bold text-primary">{aulaIndex + 1}ª Aula</div>
                            <div className="text-[11px] text-muted-foreground font-normal flex items-center gap-1 mt-1">
                                <Clock className="h-3 w-3" />
                                {turnoInfo.horarios?.[aulaIndex]?.inicio || '--:--'} - {turnoInfo.horarios?.[aulaIndex]?.fim || '--:--'}
                            </div>
                        </td>
                        {diasAtivos.map(dia => {
                            const aula = getAulaNoSlot(dia.id, aulaIndex);

                            return (
                            <td key={dia.id} className="p-2 text-center border-r last:border-r-0">
                                {aula ? (
                                <div className="flex flex-col items-center justify-center h-full space-y-1.5">
                                    <div className={cn(
                                        "font-bold text-xs leading-tight uppercase px-3 py-2 rounded-lg w-full shadow-sm border",
                                        tipo === 'presencial' 
                                            ? "bg-primary/5 text-primary border-primary/20" 
                                            : "bg-orange-50 text-orange-700 border-orange-200"
                                    )}>
                                    {aula.componente.nome}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-tighter truncate w-full" title={aula.professor?.nome_horario}>
                                        {aula.professor?.nome_horario || '---'}
                                    </div>
                                </div>
                                ) : (
                                <span className="text-muted-foreground/10">-</span>
                                )}
                            </td>
                            )
                        })}
                        </tr>
                    ))}
                    </tbody>
                </table>
                </div>
            </div>
        </div>
    );
  };

  return (
    <div className="grid grid-cols-1 gap-6">
      <Card className="border-none shadow-none bg-transparent">
        <div className="flex flex-col md:flex-row md:items-center gap-4 mb-6">
            <div className="flex-1">
                <Tabs value={selectedHorarioId} onValueChange={setSelectedHorarioId} className="w-full">
                    <TabsList className="h-auto p-1 bg-background border flex-wrap">
                        {horarios.map(h => (
                            <TabsTrigger key={h.id} value={h.id} className="py-2 px-4 data-[state=active]:bg-primary data-[state=active]:text-white">
                                {h.turno.nome}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>
            </div>
            
            <div className="w-full md:w-[280px]">
                <Select value={selectedTurmaId} onValueChange={setSelectedTurmaId}>
                    <SelectTrigger className="h-11 bg-background">
                        <SelectValue placeholder="Selecione a turma" />
                    </SelectTrigger>
                    <SelectContent>
                        {turmas.map(t => (
                            <SelectItem key={t.id} value={t.id}>Turma {t.nome}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </div>

        <div className="space-y-12">
            <div className="animate-in fade-in zoom-in-95 duration-300">
                <GradeHoraria 
                    turmaId={selectedTurmaId} 
                    tipo="presencial" 
                    label="Grade Regular" 
                    turnoInfo={currentHorario.turno} 
                />
            </div>
            
            {currentHorario.turno_oposto && (
                <div className="animate-in fade-in zoom-in-95 duration-500 delay-150">
                    <GradeHoraria 
                        turmaId={selectedTurmaId} 
                        tipo="nao_presencial" 
                        label="Grade do Contraturno (Atividades Não Presenciais)" 
                        turnoInfo={currentHorario.turno_oposto} 
                    />
                </div>
            )}
        </div>
      </Card>
    </div>
  );
}
