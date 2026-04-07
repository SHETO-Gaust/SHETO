'use client';

import { useState, useMemo, useTransition, useEffect } from 'react';
import type { HorarioCompleto, Turno, LivreDocenciaPeriodo } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { AlertCircle, AlertTriangle, CheckCircle2, Loader2, Save, User, Calendar, Undo2, Printer, Layout, Move, MousePointer2, X, Star, PenSquare, Coffee, Layers, CalendarDays } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { consolidarHorario, reverterParaRascunho, swapAulasManualmente } from '../actions';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"

type Props = {
  horario: HorarioCompleto;
};

const DIAS_SEMANA_MAP = [
  { id: 'segunda', label: 'Segunda' }, { id: 'terca', label: 'Terça' },
  { id: 'quarta', label: 'Quarta' }, { id: 'quinta', label: 'Quinta' },
  { id: 'sexta', label: 'Sexta' }, { id: 'sabado', label: 'Sábado' },
];

function getPeriodoDaAula(turno: Turno, aulaIdx: number): LivreDocenciaPeriodo {
    const nome = turno.nome.toLowerCase();
    if (nome.includes('matutino')) return 'matutino';
    if (nome.includes('vespertino')) return 'vespertino';
    if (nome.includes('noturno')) return 'noturno';
    
    const h = turno.horarios?.[aulaIdx];
    if (h?.inicio) {
        const hora = parseInt(h.inicio.split(':')[0]);
        if (hora < 13) return 'matutino';
        if (hora < 18) return 'vespertino';
        return 'noturno';
    }
    
    return aulaIdx < 5 ? 'matutino' : 'vespertino';
}

export function VisualizadorHorarioClient({ horario }: Props) {
  const [viewMode, setViewMode] = useState<'single' | 'all' | 'teachers' | 'by-day'>('single');
  const [teacherViewMode, setTeacherViewMode] = useState<'individual' | 'all'>('individual');
  const [isActionPending, startAction] = useTransition();
  const { toast } = useToast();

  const [selectedSlot, setSelectedSlot] = useState<{ 
    id: string, 
    dia: string, 
    index: number, 
    professorId: string | null,
    componenteNome: string,
    turmaId: string
  } | null>(null);

  const turmas = useMemo(() => {
    const map = new Map();
    horario.aulas.forEach(aula => {
      if (!map.has(aula.turma_id)) {
        map.set(aula.turma_id, aula.turma);
      }
    });
    return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [horario.aulas]);

  const professores = useMemo(() => {
    const map = new Map();
    horario.aulas.forEach(aula => {
      if (aula.professor_id && !map.has(aula.professor_id)) {
        map.set(aula.professor_id, aula.professor);
      }
    });
    horario.outras_aulas_publicadas?.forEach(aula => {
        if (aula.professor_id && !map.has(aula.professor_id)) {
            map.set(aula.professor_id, aula.professor);
        }
    });
    return Array.from(map.values()).sort((a, b) => a.nome_horario.localeCompare(b.nome_horario));
  }, [horario.aulas, horario.outras_aulas_publicadas]);

  const diasAtivos = useMemo(() => 
    DIAS_SEMANA_MAP.filter(d => horario.turno.dias_semana.includes(d.id)),
    [horario.turno.dias_semana]
  );

  const [selectedTurmaId, setSelectedTurmaId] = useState<string>('');
  const [selectedProfessorId, setSelectedProfessorId] = useState<string>('');
  const [selectedDayId, setSelectedDayId] = useState<string>('');

  useEffect(() => {
    if (turmas.length > 0 && !selectedTurmaId) setSelectedTurmaId(turmas[0].id);
    if (professores.length > 0 && !selectedProfessorId) setSelectedProfessorId(professores[0].id);
    if (diasAtivos.length > 0 && !selectedDayId) setSelectedDayId(diasAtivos[0].id);
  }, [turmas, professores, diasAtivos]);

  const handleCellClick = (diaDestino: string, indexDestino: number, targetAula?: any) => {
    if (horario.status === 'publicado' || isActionPending) return;

    if (!selectedSlot) {
        if (targetAula) {
            setSelectedSlot({
                id: targetAula.id,
                dia: targetAula.dia_semana,
                index: targetAula.aula_index,
                professorId: targetAula.professor_id,
                componenteNome: targetAula.componente.sigla || targetAula.componente.nome,
                turmaId: targetAula.turma_id
            });
        }
        return;
    }

    if (selectedSlot.dia === diaDestino && selectedSlot.index === indexDestino) {
        setSelectedSlot(null);
        return;
    }

    const targetAulaId = targetAula?.id || null;

    const hasConflictOrigemNoDestino = horario.aulas.some(a => 
        a.id !== selectedSlot.id &&
        (targetAulaId ? a.id !== targetAulaId : true) &&
        a.professor_id === selectedSlot.professorId && 
        a.dia_semana === diaDestino && 
        a.aula_index === indexDestino &&
        a.tipo === 'presencial'
    );

    if (hasConflictOrigemNoDestino) {
        toast({ title: 'Conflito de Professor!', description: 'O professor já tem aula neste horário em outra turma.', variant: 'destructive' });
        setSelectedSlot(null);
        return;
    }

    if (targetAulaId) {
        const hasConflictDestinoNaOrigem = horario.aulas.some(a => 
            a.id !== targetAulaId &&
            a.id !== selectedSlot.id &&
            a.professor_id === targetAula.professor_id &&
            a.dia_semana === selectedSlot.dia &&
            a.aula_index === selectedSlot.index &&
            a.tipo === 'presencial'
        );

        if (hasConflictDestinoNaOrigem) {
            toast({ title: 'Conflito de Professor!', description: `O professor ${targetAula?.professor?.nome_horario} já possui aula na posição de origem deste movimento.`, variant: 'destructive' });
            setSelectedSlot(null);
            return;
        }
    }

    startAction(async () => {
        const result = await swapAulasManualmente(
            selectedSlot.id, selectedSlot.dia, selectedSlot.index,
            targetAulaId, diaDestino, indexDestino
        );
        
        if (result.error) {
            toast({ title: 'Erro ao mover', description: result.error, variant: 'destructive' });
        } else {
            toast({ title: 'Grade Ajustada!', description: 'A alteração manual foi salva com sucesso.' });
            setSelectedSlot(null);
            window.location.reload();
        }
    });
  };

  const handleConsolidar = () => {
      startAction(async () => {
          const result = await consolidarHorario(horario.id);
          if (result.error) {
              toast({ title: 'Erro ao publicar', description: result.error, variant: 'destructive' });
          } else {
              toast({ title: 'Horário Publicado!', description: 'Esta grade agora é a oficial para este turno.' });
              window.location.reload();
          }
      });
  };

  const handleReverter = () => {
      startAction(async () => {
          const result = await reverterParaRascunho(horario.id);
          if (result.error) {
              toast({ title: 'Erro ao reverter', description: result.error, variant: 'destructive' });
          } else {
              toast({ title: 'Publicação Cancelada', description: 'O horário voltou ao estado de rascunho.' });
              window.location.reload();
          }
      });
  }

  const GradeHoraria = ({ targetId, isProfessorView, label, turnoInfo, dataset, tipo }: any) => {
    if (!turnoInfo) return null;

    const sourceData = dataset || (tipo ? horario.aulas.filter(a => a.tipo === tipo) : horario.aulas);

    const getAulaNoSlot = (dia: string, index: number) => {
        return sourceData.find((a: any) => 
            (isProfessorView ? true : a.turma_id === targetId) && 
            a.dia_semana === dia && 
            a.aula_index === index
        );
    };

    const isLivreDocencia = (dia: string, index: number) => {
        if (!isProfessorView) return false;
        const prof = professores.find(p => p.id === targetId);
        if (!prof || prof.sem_preferencia_livre_docencia) return false;
        
        const periodo = getPeriodoDaAula(turnoInfo, index);
        return prof.livre_docencia?.some((ld: any) => ld.dia === dia && ld.periodo === periodo);
    };

    const isPlanejamento = (dia: string, index: number) => {
        if (!isProfessorView) return false;
        const prof = professores.find(p => p.id === targetId);
        return prof?.restricoes?.[turnoInfo.id]?.[dia]?.[index] === 'planejamento';
    };

    const hasAulas = sourceData.some((a: any) => (isProfessorView ? true : a.turma_id === targetId));
    if (!hasAulas && !isProfessorView && tipo === 'nao_presencial') return null;
    
    const diasAtivosLocal = DIAS_SEMANA_MAP.filter(d => turnoInfo.dias_semana.includes(d.id));

    return (
        <div className="space-y-3 print:space-y-1 break-inside-avoid w-full">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2 print:text-black print:text-[8px] print:font-black">
                <div className={cn("w-2 h-2 rounded-full print:hidden", tipo === 'nao_presencial' ? "bg-orange-400" : "bg-primary")} />
                {label} ({turnoInfo.nome})
            </h3>
            <div className="rounded-xl border bg-card overflow-hidden print:border-black print:rounded-none shadow-sm">
                <div className="overflow-x-auto">
                <table className="w-full text-sm print:table-fixed border-collapse">
                    <thead>
                    <tr className="bg-muted/50 border-b print:bg-gray-100 print:border-black">
                        <th className="p-2 print:p-1 text-left font-medium border-r w-24 print:w-20 print:border-black print:text-[8px]">Horário</th>
                        {diasAtivosLocal.map(dia => (
                        <th key={dia.id} className="p-2 print:p-1 text-center font-medium min-w-[100px] print:min-w-0 print:border-black print:text-[8px]">
                            {dia.label}
                        </th>
                        ))}
                    </tr>
                    </thead>
                    <tbody>
                    {Array.from({ length: turnoInfo.aulas_por_dia }).map((_, aulaIndex) => {
                        const horarioConfig = turnoInfo.horarios?.[aulaIndex];
                        const rows = [];

                        rows.push(
                            <tr key={`aula-${aulaIndex}`} className="border-b last:border-0 hover:bg-muted/10 transition-colors h-16 print:h-auto print:border-black">
                                <td className="p-2 print:p-1 font-medium bg-muted/20 border-r print:border-black print:bg-white">
                                    <div className="font-bold text-primary print:text-black print:text-[8px]">{aulaIndex + 1}ª Aula</div>
                                    <div className="text-[9px] text-muted-foreground font-normal print:text-[7px]">
                                    {horarioConfig?.inicio || '--:--'} - {horarioConfig?.fim || '--:--'}
                                    </div>
                                </td>
                                {diasAtivosLocal.map(dia => {
                                    const aula = getAulaNoSlot(dia.id, aulaIndex);
                                    const isLD = isLivreDocencia(dia.id, aulaIndex);
                                    const isPlan = isPlanejamento(dia.id, aulaIndex);
                                    
                                    const isSelected = selectedSlot?.dia === dia.id && selectedSlot?.index === aulaIndex && !isProfessorView;

                                    return (
                                    <td 
                                        key={dia.id} 
                                        className={cn(
                                            "p-1 text-center border-r last:border-r-0 print:border-black transition-all group", 
                                            isPlan && !aula && "bg-blue-50/50 print:bg-transparent",
                                            isLD && !aula && "bg-amber-50/50 print:bg-transparent",
                                            !isProfessorView && !isActionPending && horario.status !== 'publicado' && "cursor-pointer hover:bg-primary/5",
                                            isSelected && "bg-primary/20 ring-2 ring-primary ring-inset",
                                        )}
                                        onClick={() => !isProfessorView && handleCellClick(dia.id, aulaIndex, aula)}
                                    >
                                        {aula ? (
                                        <div className="flex flex-col items-center justify-center gap-0.5 print:static">
                                            <div className={cn(
                                                "font-bold text-[10px] leading-tight uppercase px-1 py-0.5 rounded w-full line-clamp-2 shadow-sm print:shadow-none print:border-none print:bg-transparent print:text-[8px] transition-all",
                                                aula.tipo === 'presencial' ? "bg-primary/10 text-primary border border-primary/20 print:text-black" : "bg-orange-100 text-orange-700 border border-orange-200 print:text-black print:font-black",
                                                isSelected && "scale-105 shadow-md border-primary"
                                            )}>
                                            {aula.componente.sigla || aula.componente.nome}
                                            </div>
                                            <div className="text-[8px] text-muted-foreground font-bold truncate w-full uppercase print:text-black print:text-[7px] print:opacity-70">
                                                {isProfessorView ? `Turma ${aula.turma.nome}` : (aula.professor?.nome_horario || 'SEM PROF.')}
                                            </div>
                                        </div>
                                        ) : isLD ? (
                                            <div className="flex flex-col items-center justify-center gap-0.5 text-amber-600 print:text-black">
                                                <Star className="h-3 w-3 fill-amber-500 print:hidden" />
                                                <span className="text-[8px] font-black uppercase leading-tight">Livre Docência</span>
                                            </div>
                                        ) : isPlan ? (
                                            <div className="flex flex-col items-center justify-center gap-0.5 text-blue-600 print:text-black">
                                                <PenSquare className="h-3 w-3 text-blue-500 print:hidden" />
                                                <span className="text-[8px] font-black uppercase leading-tight">Planejamento</span>
                                            </div>
                                        ) : (
                                        <span className="text-muted-foreground/10">-</span>
                                        )}
                                    </td>
                                    )
                                })}
                            </tr>
                        );

                        if (horarioConfig?.tem_intervalo_depois && aulaIndex < turnoInfo.aulas_por_dia - 1) {
                            rows.push(
                                <tr key={`intervalo-${aulaIndex}`} className="bg-orange-50/20 h-10 border-b print:border-black">
                                    <td className="p-2 text-center font-bold text-[9px] uppercase bg-orange-100/30 border-r print:border-black print:bg-white flex items-center justify-center gap-1">
                                        <Coffee className="h-3 w-3 text-orange-500 print:hidden" />
                                        Intervalo
                                    </td>
                                    <td colSpan={diasAtivosLocal.length} className="p-2 text-center text-[10px] font-bold text-orange-700/60 uppercase tracking-widest print:text-black print:text-[8px]">
                                        {horarioConfig.fim} às {turnoInfo.horarios?.[aulaIndex + 1]?.inicio || '--:--'}
                                    </td>
                                </tr>
                            );
                        }

                        return rows;
                    })}
                    </tbody>
                </table>
                </div>
            </div>
        </div>
    );
  };

  const TeacherIndividualView = ({ professorId }: { professorId: string }) => {
    const prof = professores.find(p => p.id === professorId);
    if (!prof) return null;

    const allTeacherAulas = [
        ...horario.aulas.filter(a => a.professor_id === professorId),
        ...(horario.outras_aulas_publicadas?.filter(a => a.professor_id === professorId) || [])
    ];

    const turnosEnvolvidos = useMemo(() => {
        const turnosMap = new Map<string, Turno>();
        
        turnosMap.set(horario.turno.id, horario.turno);
        if (horario.turno_oposto) turnosMap.set(horario.turno_oposto.id, horario.turno_oposto);

        horario.outras_aulas_publicadas?.filter(a => a.professor_id === professorId).forEach(a => {
            const turnoAula = (a as any).horario?.turno;
            if (turnoAula) turnosMap.set(turnoAula.id, turnoAula);
        });

        return Array.from(turnosMap.values()).sort((a,b) => a.nome.localeCompare(b.nome));
    }, [professorId]);

    return (
        <div className="space-y-8 pt-4 break-after-page print:pt-0 print:space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4 print:border-black print:pb-2 print:mb-2">
                <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center print:hidden">
                        <User className="h-6 w-6" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold tracking-tight print:text-black print:text-lg">
                            {prof.nome_horario}
                        </h2>
                        <p className="text-sm text-muted-foreground print:text-black print:text-xs">Grade Docente Consolidada</p>
                    </div>
                </div>

                <div className="flex flex-wrap gap-4 p-3 bg-muted/30 rounded-xl border border-dashed print:hidden">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-primary/20 border border-primary/30" />
                        <span className="text-[10px] font-bold uppercase text-muted-foreground">Presencial</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-orange-100 border border-orange-200" />
                        <span className="text-[10px] font-bold uppercase text-muted-foreground">Não Presencial (NP)</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-amber-100 border border-amber-200" />
                        <span className="text-[10px] font-bold uppercase text-muted-foreground">Livre Docência</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded bg-blue-100 border border-blue-200" />
                        <span className="text-[10px] font-bold uppercase text-muted-foreground">Planejamento</span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-12 print:gap-6">
                {turnosEnvolvidos.map(turno => {
                    const aulasDesteTurno = allTeacherAulas.filter(a => {
                        const isMainHorario = a.horario_id === horario.id;
                        if (isMainHorario) {
                            if (a.tipo === 'nao_presencial') return turno.id === horario.turno_oposto?.id;
                            return turno.id === horario.turno_id;
                        }
                        return (a as any).horario.turno_id === turno.id;
                    });

                    return (
                        <GradeHoraria 
                            key={turno.id}
                            targetId={professorId} 
                            isProfessorView={true}
                            label={`Grade: ${turno.nome}`} 
                            turnoInfo={turno} 
                            dataset={aulasDesteTurno}
                        />
                    );
                })}
            </div>
        </div>
    );
  }

  const RenderByDay = () => {
    return (
        <div className="space-y-6 pt-4 print:pt-0 print:space-y-2">
            <div className="flex items-center gap-4 bg-muted/30 p-4 rounded-xl border print:hidden">
                <span className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-2">
                    <CalendarDays className="h-4 w-4" /> Selecione o Dia:
                </span>
                <Tabs value={selectedDayId} onValueChange={setSelectedDayId} className="w-auto">
                    <TabsList className="bg-background border h-10">
                        {diasAtivos.map(dia => (
                            <TabsTrigger key={dia.id} value={dia.id} className="text-xs px-4">{dia.label}</TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>
            </div>

            <h2 className="hidden print:block text-base font-black uppercase text-center border-b border-black pb-2 mb-4">
                Visão Operacional: {DIAS_SEMANA_MAP.find(d => d.id === selectedDayId)?.label} - {horario.turno.nome}
            </h2>

            <div className="rounded-xl border bg-card overflow-hidden shadow-sm print:border-black print:rounded-none">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse print:table-fixed">
                        <thead>
                            <tr className="bg-muted/50 border-b print:bg-gray-100 print:border-black">
                                <th className="p-4 text-left font-bold border-r w-32 print:w-20 print:p-2 print:border-black print:text-[8px]">Horário</th>
                                {turmas.map(t => (
                                    <th key={t.id} className="p-4 text-center font-bold min-w-[150px] border-r last:border-r-0 print:border-black print:p-2 print:text-[8px] print:min-w-0">
                                        TURMA {t.nome}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {Array.from({ length: horario.turno.aulas_por_dia }).map((_, aulaIndex) => {
                                const hConfig = horario.turno.horarios?.[aulaIndex];
                                const rows = [];

                                rows.push(
                                    <tr key={aulaIndex} className="border-b last:border-0 h-24 hover:bg-muted/5 print:h-auto print:border-black">
                                        <td className="p-4 font-bold bg-muted/10 border-r print:bg-white print:border-black print:p-2">
                                            <div className="text-primary print:text-black print:text-[8px]">{aulaIndex + 1}ª Aula</div>
                                            <div className="text-[10px] text-muted-foreground font-normal print:text-[7px]">
                                                {hConfig?.inicio || '--:--'} - {hConfig?.fim || '--:--'}
                                            </div>
                                        </td>
                                        {turmas.map(t => {
                                            const aula = horario.aulas.find(a => 
                                                a.turma_id === t.id && 
                                                a.dia_semana === selectedDayId && 
                                                a.aula_index === aulaIndex &&
                                                a.tipo === 'presencial'
                                            );
                                            return (
                                                <td key={t.id} className="p-2 text-center border-r last:border-r-0 print:border-black print:p-1">
                                                    {aula ? (
                                                        <div className="flex flex-col items-center justify-center gap-1 print:static">
                                                            <div className="font-bold text-[10px] leading-tight uppercase px-2 py-1 rounded bg-primary/5 border border-primary/10 text-primary w-full shadow-sm print:text-[8px] print:bg-transparent print:border-none print:text-black print:font-black">
                                                                {aula.componente.sigla || aula.componente.nome}
                                                            </div>
                                                            <div className="text-[9px] text-muted-foreground font-bold uppercase truncate w-full print:text-[7px] print:text-black print:opacity-70">
                                                                {aula.professor?.nome_horario || 'SEM PROF.'}
                                                            </div>
                                                        </div>
                                                    ) : <span className="text-muted-foreground/10">-</span>}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );

                                if (hConfig?.tem_intervalo_depois && aulaIndex < horario.turno.aulas_por_dia - 1) {
                                    rows.push(
                                        <tr key={`intervalo-${aulaIndex}`} className="bg-orange-50/20 h-10 border-b print:border-black">
                                            <td className="p-2 text-center font-bold text-[9px] uppercase bg-orange-100/30 border-r print:border-black print:bg-white">
                                                Intervalo
                                            </td>
                                            <td colSpan={turmas.length} className="p-2 text-center text-[10px] font-bold text-orange-700/60 uppercase tracking-widest print:text-black print:text-[8px]">
                                                {hConfig.fim} às {horario.turno.horarios?.[aulaIndex + 1]?.inicio || '--:--'}
                                            </td>
                                        </tr>
                                    );
                                }

                                return rows;
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
  };

  return (
    <div className="space-y-6 print:space-y-0">
      {horario.status !== 'publicado' && viewMode !== 'teachers' && viewMode !== 'by-day' && (
          <div className="sticky top-16 z-20 print:hidden">
            <Alert className={cn(
                "transition-all border-2", 
                selectedSlot ? "bg-primary/10 border-primary shadow-lg" : "bg-primary/5 border-primary/20"
            )}>
                {selectedSlot ? (
                    <MousePointer2 className="h-5 w-5 text-primary animate-bounce" />
                ) : (
                    <Move className="h-4 w-4 text-primary" />
                )}
                <AlertTitle className="text-xs font-bold uppercase flex items-center justify-between">
                    {selectedSlot ? 'Aula Selecionada' : 'Edição Manual Ativada'}
                    {selectedSlot && (
                        <Button variant="ghost" size="sm" onClick={() => setSelectedSlot(null)} className="h-6 px-2 text-xs">
                            <X className="h-3 w-3 mr-1" /> Cancelar Seleção
                        </Button>
                    )}
                </AlertTitle>
                <AlertDescription className="text-xs">
                    {selectedSlot ? (
                        <>Você selecionou **{selectedSlot.componenteNome}**. Agora, **clique no destino** para mover ou trocar de lugar.</>
                    ) : (
                        'Clique em uma disciplina na "Grade Regular" para selecioná-la e depois clique em outro horário para realizar a troca.'
                    )}
                </AlertDescription>
            </Alert>
          </div>
      )}

      <Card className="print:border-none print:shadow-none">
        <CardHeader className="flex flex-col md:flex-row md:items-center justify-between space-y-4 md:space-y-0 pb-6 border-b mb-6 print:hidden">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-3">
                <span>{horario.nome}</span>
                {horario.status === 'publicado' ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500 print:hidden" />
                ) : (
                    <Badge variant="outline" className="text-orange-500 border-orange-200 bg-orange-50 print:hidden whitespace-nowrap">
                        Rascunho
                    </Badge>
                )}
            </CardTitle>
            <CardDescription className="print:hidden">Visualize o horário gerado para as turmas do turno {horario.turno.nome}.</CardDescription>
          </div>
          
          <div className="flex flex-wrap items-center gap-4 print:hidden">
            <Button variant="outline" onClick={() => window.print()}>
                <Printer className="mr-2 h-4 w-4" />
                Imprimir Grade
            </Button>

            {horario.status !== 'publicado' ? (
                <Button 
                    onClick={handleConsolidar} 
                    disabled={isActionPending} 
                    className="bg-green-600 hover:bg-green-700 text-white shadow-md"
                >
                    {isActionPending ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}
                    Publicar Horário
                </Button>
            ) : (
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button variant="outline" className="text-orange-600 border-orange-200 hover:bg-orange-50" disabled={isActionPending}>
                            {isActionPending ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Undo2 className="mr-2 h-4 w-4" />}
                            Reverter para Rascunho
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent onPointerDownOutside={(e) => e.preventDefault()}>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Cancelar Publicação?</AlertDialogTitle>
                            <AlertDialogDescription>
                                Este horário deixará de ser o oficial para o turno {horario.turno.nome} e será removido da consulta pública imediatamente.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Voltar</AlertDialogCancel>
                            <AlertDialogAction onClick={handleReverter} className="bg-orange-600 hover:bg-orange-700">Confirmar</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            )}

            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)} className="w-auto">
                <TabsList className="h-10">
                    <TabsTrigger value="single" className="gap-2"><Layout className="h-3.5 w-3.5" /> Turmas</TabsTrigger>
                    <TabsTrigger value="all" className="gap-2"><Layers className="h-3.5 w-3.5" /> Todas</TabsTrigger>
                    <TabsTrigger value="teachers" className="gap-2"><User className="h-3.5 w-3.5" /> Docentes</TabsTrigger>
                    <TabsTrigger value="by-day" className="gap-2"><CalendarDays className="h-3.5 w-3.5" /> Por Dia</TabsTrigger>
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

            {viewMode === 'teachers' && (
                <div className="flex items-center gap-2">
                    <Tabs value={teacherViewMode} onValueChange={(v) => setTeacherViewMode(v as any)} className="w-auto">
                        <TabsList className="bg-muted/50">
                            <TabsTrigger value="individual" className="text-[10px] h-8">Individual</TabsTrigger>
                            <TabsTrigger value="all" className="text-[10px] h-8">Ver Todos</TabsTrigger>
                        </TabsList>
                    </Tabs>

                    {teacherViewMode === 'individual' && (
                        <Select value={selectedProfessorId} onValueChange={setSelectedProfessorId}>
                            <SelectTrigger className="w-[220px]">
                                <SelectValue placeholder="Selecione o professor" />
                            </SelectTrigger>
                            <SelectContent>
                                {professores.map(p => (
                                    <SelectItem key={p.id} value={p.id}>{p.nome_horario}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                </div>
            )}
          </div>
        </CardHeader>
        
        <CardContent className="print:p-0">
          {viewMode === 'single' ? (
            <div className="space-y-12 pt-4 print:pt-0 print:space-y-8">
                <GradeHoraria 
                    targetId={selectedTurmaId} 
                    isProfessorView={false}
                    label="Grade Regular" 
                    turnoInfo={horario.turno} 
                    tipo="presencial"
                />
                <GradeHoraria 
                    targetId={selectedTurmaId} 
                    isProfessorView={false}
                    label="Grade do Contraturno (NP)" 
                    turnoInfo={horario.turno_oposto || null} 
                    tipo="nao_presencial"
                />
            </div>
          ) : viewMode === 'all' ? (
            <div className="space-y-16 pt-4 print:pt-0 print:space-y-4">
                {turmas.map(turma => (
                    <div key={turma.id} className="space-y-8 pb-12 border-b last:border-0 print:break-after-page print:border-none print:pb-0 print:space-y-4">
                        <div className="flex items-center gap-3 print:gap-0">
                            <div className="h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg print:hidden">
                                {turma.nome.charAt(0)}
                            </div>
                            <h2 className="text-2xl font-black tracking-tight print:text-xl print:font-black">TURMA {turma.nome}</h2>
                        </div>
                        <GradeHoraria 
                            targetId={turma.id} 
                            isProfessorView={false}
                            label="Grade Regular" 
                            turnoInfo={horario.turno} 
                            tipo="presencial"
                        />
                        <GradeHoraria 
                            targetId={turma.id} 
                            isProfessorView={false}
                            label="Grade do Contraturno" 
                            turnoInfo={horario.turno_oposto || null} 
                            tipo="nao_presencial"
                        />
                    </div>
                ))}
            </div>
          ) : viewMode === 'teachers' ? (
            teacherViewMode === 'individual' ? (
                <TeacherIndividualView professorId={selectedProfessorId} />
            ) : (
                <div className="space-y-16 pt-4 print:pt-0 print:space-y-4">
                    {professores.map(prof => (
                        <div key={prof.id} className="pb-16 border-b last:border-0 print:pb-0 print:border-none print:break-after-page">
                            <TeacherIndividualView professorId={prof.id} />
                        </div>
                    ))}
                </div>
            )
          ) : viewMode === 'by-day' ? (
            <RenderByDay />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}