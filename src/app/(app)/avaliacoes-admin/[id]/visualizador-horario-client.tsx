'use client';

import { useState, useMemo } from 'react';
import type { HorarioCompleto, HorarioAulaGerada } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

  const getAulaNoSlot = (dia: string, index: number) => {
    return horario.aulas.find(a => 
        a.turma_id === selectedTurmaId && 
        a.dia_semana === dia && 
        a.aula_index === index &&
        a.tipo === 'presencial'
    );
  };

  const aulasNP = useMemo(() => {
    return horario.aulas.filter(a => a.turma_id === selectedTurmaId && a.tipo === 'nao_presencial');
  }, [horario.aulas, selectedTurmaId]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div className="space-y-1">
            <CardTitle>Grade Horária por Turma</CardTitle>
            <CardDescription>Selecione a turma para visualizar a organização das aulas.</CardDescription>
          </div>
          <Select value={selectedTurmaId} onValueChange={setSelectedTurmaId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Selecione a turma" />
            </SelectTrigger>
            <SelectContent>
              {turmas.map(t => (
                <SelectItem key={t.id} value={t.id}>Turma {t.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
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
                  {Array.from({ length: horario.turno.aulas_por_dia }).map((_, aulaIndex) => (
                    <tr key={aulaIndex} className="border-b last:border-0 hover:bg-muted/10 transition-colors h-24">
                      <td className="p-3 font-medium bg-muted/20 border-r">
                        <div className="font-semibold text-primary">{aulaIndex + 1}ª Aula</div>
                        <div className="text-[10px] text-muted-foreground font-normal">
                          {horario.turno.horarios?.[aulaIndex]?.inicio || '--:--'} às {horario.turno.horarios?.[aulaIndex]?.fim || '--:--'}
                        </div>
                      </td>
                      {diasAtivos.map(dia => {
                        const aula = getAulaNoSlot(dia.id, aulaIndex);
                        return (
                          <td key={dia.id} className="p-2 text-center border-r last:border-r-0">
                            {aula ? (
                              <div className="flex flex-col items-center justify-center gap-1">
                                <div className="font-bold text-xs leading-tight uppercase bg-primary/10 text-primary px-2 py-1 rounded w-full line-clamp-2">
                                  {aula.componente.sigla}
                                </div>
                                <div className="text-[10px] text-muted-foreground font-medium truncate w-full" title={aula.professor?.nome_horario}>
                                  {aula.professor?.nome_horario || 'SEM PROF.'}
                                </div>
                              </div>
                            ) : (
                              <span className="text-muted-foreground/20">-</span>
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
        </CardContent>
      </Card>

      {aulasNP.length > 0 && (
        <Card className="border-orange-200 bg-orange-50/20">
            <CardHeader className="pb-2">
                <CardTitle className="text-base text-orange-800">Aulas Não Presenciais (Contraturno)</CardTitle>
                <CardDescription>Disciplinas que devem ser trabalhadas fora do horário regular.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex flex-wrap gap-2">
                    {aulasNP.map((aula, idx) => (
                        <div key={idx} className="bg-white border-orange-200 border rounded-md px-3 py-2 text-xs flex flex-col gap-0.5">
                            <span className="font-bold text-orange-700">{aula.componente.nome}</span>
                            <span className="text-muted-foreground">{aula.professor?.nome_horario || 'Sem Professor'}</span>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
      )}
    </div>
  );
}
