
'use client';

import { useState, useMemo, useTransition, useEffect } from 'react';
import type { HorarioCompleto, Turno } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { AlertCircle, AlertTriangle, CheckCircle2, Loader2, Save, User, Users } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { consolidarHorario } from '../actions';
import { useToast } from '@/hooks/use-toast';

type Props = {
  horario: HorarioCompleto;
};

const DIAS_SEMANA_MAP = [
  { id: 'segunda', label: 'Seg' }, { id: 'terca', label: 'Ter' },
  { id: 'quarta', label: 'Qua' }, { id: 'quinta', label: 'Qui' },
  { id: 'sexta', label: 'Sex' }, { id: 'sabado', label: 'Sáb' },
];

export function VisualizadorHorarioClient({ horario }: Props) {
  const [viewMode, setViewMode] = useState<'single' | 'all' | 'teachers'>('single');
  const [teacherViewMode, setTeacherViewMode] = useState<'individual' | 'all'>('individual');
  const [isConsolidating, startConsolidating] = useTransition();
  const { toast } = useToast();

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
    return Array.from(map.values()).sort((a, b) => a.nome_horario.localeCompare(b.nome_horario));
  }, [horario.aulas]);

  const [selectedTurmaId, setSelectedTurmaId] = useState<string>('');
  const [selectedProfessorId, setSelectedProfessorId] = useState<string>('');

  useEffect(() => {
    if (turmas.length > 0 && !selectedTurmaId) setSelectedTurmaId(turmas[0].id);
    if (professores.length > 0 && !selectedProfessorId) setSelectedProfessorId(professores[0].id);
  }, [turmas, professores]);

  const diasAtivos = useMemo(() => 
    DIAS_SEMANA_MAP.filter(d => horario.turno.dias_semana.includes(d.id)),
    [horario.turno.dias_semana]
  );

  const getPendencias = (turmaId: string) => {
    const config = horario.turmas_config?.find(c => c.id === turmaId);
    if (!config) return [];

    const aulasDestaTurma = horario.aulas.filter(a => a.turma_id === turmaId);
    const pendencias: { componente: string, missing: number, tipo: string, professor: string }[] = [];

    config.serie.componentes.forEach((sc: any) => {
        const profInfo = config.professores?.find((p: any) => p.componente_id === sc.componente.id);
        const professorNome = profInfo?.professor?.nome_horario || 'SEM PROFESSOR';

        const alocadasPresencial = aulasDestaTurma.filter(a => a.componente_id === sc.componente.id && a.tipo === 'presencial').length;
        const faltamPresencial = sc.aulas_presenciais - alocadasPresencial;
        if (faltamPresencial > 0) {
            pendencias.push({ 
                componente: sc.componente.sigla || sc.componente.nome, 
                missing: faltamPresencial, 
                tipo: 'Presencial',
                professor: professorNome
            });
        }

        const alocadasNP = aulasDestaTurma.filter(a => a.componente_id === sc.componente.id && a.tipo === 'nao_presencial').length;
        const faltamNP = sc.aulas_nao_presenciais - alocadasNP;
        if (faltamNP > 0) {
            pendencias.push({ 
                componente: sc.componente.sigla || sc.componente.nome, 
                missing: faltamNP, 
                tipo: 'NP (Contraturno)',
                professor: professorNome
            });
        }
    });

    return pendencias;
  };

  const handleConsolidar = () => {
      startConsolidating(async () => {
          const result = await consolidarHorario(horario.id);
          if (result.error) {
              toast({ title: 'Erro ao consolidar', description: result.error, variant: 'destructive' });
          } else {
              toast({ title: 'Horário Consolidado!', description: 'Esta grade agora é a oficial para este turno.' });
              window.location.reload();
          }
      });
  };

  const RenderPendencias = ({ turmaId }: { turmaId: string }) => {
    const pendencias = getPendencias(turmaId);
    if (pendencias.length === 0) return null;

    return (
        <Alert variant="destructive" className="bg-destructive/5 border-destructive/20 mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle className="text-xs font-bold uppercase tracking-tight">Aulas não alocadas nesta turma:</AlertTitle>
            <AlertDescription className="text-xs mt-2">
                <div className="flex flex-wrap gap-3">
                    {pendencias.map((p, i) => (
                        <div key={i} className="bg-destructive/10 text-destructive px-3 py-2 rounded font-medium border border-destructive/20 flex flex-col items-center text-center min-w-[120px] shadow-sm">
                            <span className="font-bold text-[11px] leading-tight">{p.componente}</span>
                            <span className="text-[10px] opacity-90">{p.missing} aula(s) {p.tipo}</span>
                            <div className="mt-1.5 pt-1 border-t border-destructive/10 w-full text-[9px] uppercase font-bold text-destructive/70">
                                {p.professor}
                            </div>
                        </div>
                    ))}
                </div>
            </AlertDescription>
        </Alert>
    );
  };

  const GradeHoraria = ({ targetId, isProfessorView, tipo, label, turnoInfo }: { targetId: string, isProfessorView: boolean, tipo: 'presencial' | 'nao_presencial', label: string, turnoInfo: Turno | null }) => {
    if (!turnoInfo) return null;

    const getAulaNoSlot = (dia: string, index: number) => {
        return horario.aulas.find(a => 
            (isProfessorView ? a.professor_id === targetId : a.turma_id === targetId) && 
            a.dia_semana === dia && 
            a.aula_index === index &&
            a.tipo === tipo
        );
    };

    const hasAulas = horario.aulas.some(a => (isProfessorView ? a.professor_id === targetId : a.turma_id === targetId) && a.tipo === tipo);
    if (!hasAulas && tipo === 'nao_presencial') return null;

    const isInconsistent = (dia: string, index: number) => {
        if (tipo !== 'presencial' || isProfessorView) return false;
        const aula = getAulaNoSlot(dia, index);
        return !aula;
    };

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
                            const hole = isInconsistent(dia.id, aulaIndex);

                            return (
                            <td key={dia.id} className={cn("p-2 text-center border-r last:border-r-0", hole && "bg-destructive/5")}>
                                {aula ? (
                                <div className="flex flex-col items-center justify-center gap-1">
                                    <div className={cn(
                                        "font-bold text-xs leading-tight uppercase px-2 py-1 rounded w-full line-clamp-2 shadow-sm",
                                        tipo === 'presencial' ? "bg-primary/10 text-primary border border-primary/20" : "bg-orange-100 text-orange-700 border border-orange-200"
                                    )}>
                                    {aula.componente.sigla || aula.componente.nome}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground font-bold truncate w-full uppercase" title={isProfessorView ? `Turma ${aula.turma.nome}` : aula.professor?.nome_horario}>
                                        {isProfessorView ? `Turma ${aula.turma.nome}` : (aula.professor?.nome_horario || 'SEM PROF.')}
                                    </div>
                                </div>
                                ) : hole ? (
                                    <div className="flex flex-col items-center justify-center gap-1 text-destructive/60 animate-pulse">
                                        <AlertCircle className="h-4 w-4" />
                                        <span className="text-[9px] font-bold uppercase">Vago</span>
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

  const TeacherIndividualView = ({ professorId }: { professorId: string }) => {
    const prof = professores.find(p => p.id === professorId);
    if (!prof) return null;

    return (
        <div className="space-y-8 pt-4">
            <div className="flex items-center gap-3 border-b pb-4">
                <div className="h-12 w-12 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center">
                    <User className="h-6 w-6" />
                </div>
                <div>
                    <h2 className="text-xl font-bold tracking-tight">
                        {prof.nome_horario}
                    </h2>
                    <p className="text-sm text-muted-foreground">Visualizando grade individual do docente.</p>
                </div>
            </div>
            <GradeHoraria 
                targetId={professorId} 
                isProfessorView={true}
                tipo="presencial" 
                label="Horário Regular" 
                turnoInfo={horario.turno} 
            />
            <GradeHoraria 
                targetId={professorId} 
                isProfessorView={true}
                tipo="nao_presencial" 
                label="Horário no Contraturno" 
                turnoInfo={horario.turno_oposto || null} 
            />
        </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col md:flex-row md:items-center justify-between space-y-4 md:space-y-0 pb-6 border-b mb-6">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-3">
                {horario.nome}
                {horario.status === 'publicado' ? (
                    <Badge className="bg-green-500 hover:bg-green-600 text-white gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Consolidado
                    </Badge>
                ) : (
                    <Badge variant="outline" className="text-orange-500 border-orange-200 bg-orange-50">
                        Rascunho
                    </Badge>
                )}
            </CardTitle>
            <CardDescription>Visualize o horário gerado para as turmas do turno {horario.turno.nome}.</CardDescription>
          </div>
          
          <div className="flex flex-wrap items-center gap-4">
            {horario.status !== 'publicado' && (
                <Button 
                    onClick={handleConsolidar} 
                    disabled={isConsolidating} 
                    className="bg-green-600 hover:bg-green-700 text-white shadow-md"
                >
                    {isConsolidating ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}
                    Consolidar Horário
                </Button>
            )}

            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)} className="w-auto">
                <TabsList>
                    <TabsTrigger value="single">Turma por Turma</TabsTrigger>
                    <TabsTrigger value="all">Todas as Turmas</TabsTrigger>
                    <TabsTrigger value="teachers">Por Professor</TabsTrigger>
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
        
        <CardContent>
          {viewMode === 'single' ? (
            <div className="space-y-8 pt-4">
                <RenderPendencias turmaId={selectedTurmaId} />
                <GradeHoraria 
                    targetId={selectedTurmaId} 
                    isProfessorView={false}
                    tipo="presencial" 
                    label="Grade Regular" 
                    turnoInfo={horario.turno} 
                />
                <GradeHoraria 
                    targetId={selectedTurmaId} 
                    isProfessorView={false}
                    tipo="nao_presencial" 
                    label="Grade do Contraturno" 
                    turnoInfo={horario.turno_oposto || null} 
                />
            </div>
          ) : viewMode === 'teachers' ? (
            teacherViewMode === 'individual' ? (
                <TeacherIndividualView professorId={selectedProfessorId} />
            ) : (
                <div className="grid grid-cols-1 gap-16 pt-4">
                    {professores.map(prof => (
                        <div key={prof.id} className="pb-16 border-b last:border-0">
                            <TeacherIndividualView professorId={prof.id} />
                        </div>
                    ))}
                </div>
            )
          ) : (
            <div className="grid grid-cols-1 gap-12 pt-4">
                {turmas.map(turma => (
                    <div key={turma.id} className="space-y-6 pb-12 border-b last:border-0">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg">
                                {turma.nome.charAt(0)}
                            </div>
                            <h2 className="text-xl font-bold tracking-tight">Turma {turma.nome}</h2>
                        </div>
                        
                        <RenderPendencias turmaId={turma.id} />

                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                            <GradeHoraria 
                                targetId={turma.id} 
                                isProfessorView={false}
                                tipo="presencial" 
                                label="Grade Regular" 
                                turnoInfo={horario.turno} 
                            />
                            <GradeHoraria 
                                targetId={turma.id} 
                                isProfessorView={false}
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

function Badge({ children, className, variant = 'default' }: any) {
    return (
        <span className={cn(
            "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border",
            variant === 'default' ? "bg-primary text-primary-foreground border-transparent" : "border-input",
            className
        )}>
            {children}
        </span>
    );
}
