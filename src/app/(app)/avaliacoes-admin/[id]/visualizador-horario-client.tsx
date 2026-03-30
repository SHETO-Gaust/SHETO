
'use client';

import { useState, useMemo } from 'react';
import type { HorarioCompleto, HorarioAulaGerada, Turno } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

type Props = {
  horario: HorarioCompleto;
};

const DIAS_SEMANA_MAP = [
  { id: 'segunda', label: 'Seg' }, { id: 'terca', label: 'Ter' },
  { id: 'quarta', label: 'Qua' }, { id: 'quinta', label: 'Qui' },
  { id: 'sexta', label: 'Sex' }, { id: 'sabado', label: 'Sáb' },
];

export function VisualizadorHorarioClient({ horario }: Props) {
  const [viewMode, setViewMode] = useState<'single' | 'all'>('single');

  // Obter turmas únicas que têm aulas neste horário
  const turmas = useMemo(() => {
    const map = new Map();
    horario.aulas.forEach(aula => {
      if (!map.has(aula.turma_id)) {
        map.set(aula.turma_id, aula.turma);
      }
    });
    return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [horario.aulas]);

  const [selectedTurmaId, setSelectedTurmaId] = useState<string>(turmas[0]?.id || '');

  const diasAtivos = useMemo(() => 
    DIAS_SEMANA_MAP.filter(d => horario.turno.dias_semana.includes(d.id)),
    [horario.turno.dias_semana]
  );

  const GradeHoraria = ({ turmaId, tipo, label, turnoInfo }: { turmaId: string, tipo: 'presencial' | 'nao_presencial', label: string, turnoInfo: Turno | null }) => {
    if (!turnoInfo) return null;

    const getAulaNoSlot = (dia: string, index: number) => {
        return horario.aulas.find(a => 
            a.turma_id === turmaId && 
            a.dia_semana === dia && 
            a.aula_index === index &&
            a.tipo === tipo
        );
    };

    // Verifica se há alguma aula deste tipo para esta turma antes de renderizar
    const hasAulas = horario.aulas.some(a => a.turma_id === turmaId && a.tipo === tipo);
    if (!hasAulas && tipo === 'nao_presencial') return null;

    return (
        <div className="space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <div className={cn("w-2 h-2 rounded-full", tipo === 'presencial' ? "bg-primary" : "bg-orange-400")} />
                {label} ({turnoInfo.nome})
            </h3>
            <div className="rounded-xl border bg-card overflow-hidden">
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                    <tr className="bg-muted/50 border-b">
                        <th className="p-3 text-left font-medium border-r w-32">Horário</th>
                        {diasAtivos.map(dia => (
                        <th key={dia.id} className="p-3 text-center font-medium min-w-[120px]">
                            {dia.label}
                        </th>
                        ))}
                    </tr>
                    </thead>
                    <tbody>
                    {Array.from({ length: turnoInfo.aulas_por_dia }).map((_, aulaIndex) => (
                        <tr key={aulaIndex} className="border-b last:border-0 hover:bg-muted/10 transition-colors h-20">
                        <td className="p-3 font-medium bg-muted/20 border-r">
                            <div className="font-semibold text-primary">{aulaIndex + 1}ª Aula</div>
                            <div className="text-[10px] text-muted-foreground font-normal">
                            {turnoInfo.horarios?.[aulaIndex]?.inicio || '--:--'} às {turnoInfo.horarios?.[aulaIndex]?.fim || '--:--'}
                            </div>
                        </td>
                        {diasAtivos.map(dia => {
                            const aula = getAulaNoSlot(dia.id, aulaIndex);
                            return (
                            <td key={dia.id} className="p-2 text-center border-r last:border-r-0">
                                {aula ? (
                                <div className="flex flex-col items-center justify-center gap-1">
                                    <div className={cn(
                                        "font-bold text-xs leading-tight uppercase px-2 py-1 rounded w-full line-clamp-2",
                                        tipo === 'presencial' ? "bg-primary/10 text-primary" : "bg-orange-100 text-orange-700"
                                    )}>
                                    {aula.componente.sigla}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground font-medium truncate w-full" title={aula.professor?.nome_horario}>
                                    {aula.professor?.nome_horario || 'SEM PROF.'}
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
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col md:flex-row md:items-center justify-between space-y-4 md:space-y-0 pb-6">
          <div className="space-y-1">
            <CardTitle>Visualização da Grade</CardTitle>
            <CardDescription>Visualize o horário gerado para as turmas do turno {horario.turno.nome}.</CardDescription>
          </div>
          
          <div className="flex items-center gap-4">
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)} className="w-auto">
                <TabsList>
                    <TabsTrigger value="single">Turma por Turma</TabsTrigger>
                    <TabsTrigger value="all">Todas as Turmas</TabsTrigger>
                </TabsList>
            </Tabs>

            {viewMode === 'single' && (
                <Select value={selectedTurmaId} onValueChange={setSelectedTurmaId}>
                    <SelectTrigger className="w-[220px]">
                        <SelectValue placeholder="Selecione a turma" />
                    </SelectTrigger>
                    <SelectContent>
                        {turmas.map(t => (
                            <SelectItem key={t.id} value={t.id}>Turma {t.nome}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )}
          </div>
        </CardHeader>
        
        <CardContent>
          {viewMode === 'single' ? (
            <div className="space-y-8">
                <GradeHoraria 
                    turmaId={selectedTurmaId} 
                    tipo="presencial" 
                    label="Grade Regular" 
                    turnoInfo={horario.turno} 
                />
                <GradeHoraria 
                    turmaId={selectedTurmaId} 
                    tipo="nao_presencial" 
                    label="Grade do Contraturno" 
                    turnoInfo={horario.turno_oposto || null} 
                />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-12">
                {turmas.map(turma => (
                    <div key={turma.id} className="space-y-6 pb-12 border-b last:border-0">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg">
                                {turma.nome.charAt(0)}
                            </div>
                            <h2 className="text-xl font-bold tracking-tight">Turma {turma.nome}</h2>
                        </div>
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                            <GradeHoraria 
                                turmaId={turma.id} 
                                tipo="presencial" 
                                label="Grade Regular" 
                                turnoInfo={horario.turno} 
                            />
                            <GradeHoraria 
                                turmaId={turma.id} 
                                tipo="nao_presencial" 
                                label="Grade do Contraturno" 
                                turnoInfo={horario.turno_oposto || null} 
                            />
                        </div>
                    </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
