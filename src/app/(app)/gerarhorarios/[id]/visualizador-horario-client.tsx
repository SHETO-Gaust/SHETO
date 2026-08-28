'use client';

import { useState, useMemo, useTransition, useEffect } from 'react';
import type { HorarioCompleto, Turno, LivreDocenciaPeriodo } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { AlertCircle, AlertTriangle, CheckCircle2, Loader2, Save, User, Calendar, Undo2, Printer, FileDown, FileText, Layout, Move, MousePointer2, X, Star, PenSquare, Coffee, Layers, CalendarDays, Users, Ban, Users2, Tag } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { consolidarHorario, reverterParaRascunho } from '../actions';
import { useToast } from '@/hooks/use-toast';
import { exportarHorarioXLSX, exportarHorarioPDF } from '@/lib/export-horario';
import { Badge } from '@/components/ui/badge';
import { etiquetaDoSlot, temRestricaoNoTurno, type EtiquetaSlot, type TomEtiqueta } from '@/lib/restricoes-slot';
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

type Props = {
  horario: HorarioCompleto;
  forceView?: 'single' | 'all' | 'teachers' | 'by-day';
  forceTeacherId?: string;
  /**
   * Turnos da unidade, para a agenda consolidada do professor.
   *
   * Sem esta lista a agenda só sabe olhar o turno do `horario` recebido e o
   * contraturno dele. No portal de consulta o `horario` é um qualquer da escola,
   * então esses dois turnos não têm relação nenhuma com o professor escolhido.
   */
  turnosDisponiveis?: Turno[];
};

/** Fundo da célula por tipo de etiqueta. */
const TOM_CELULA: Record<TomEtiqueta, string> = {
  vermelho: 'bg-red-50/60 dark:bg-red-950/20',
  roxo: 'bg-purple-50/60 dark:bg-purple-950/20',
  ambar: 'bg-amber-50/50 dark:bg-amber-950/20',
  azul: 'bg-blue-50/50 dark:bg-blue-950/20',
  neutro: 'bg-muted/40',
};

const TOM_TEXTO: Record<TomEtiqueta, string> = {
  vermelho: 'text-red-600 dark:text-red-400',
  roxo: 'text-purple-600 dark:text-purple-400',
  ambar: 'text-amber-600 dark:text-amber-400',
  azul: 'text-blue-600 dark:text-blue-400',
  neutro: 'text-muted-foreground',
};

const ICONE_ETIQUETA: Record<string, typeof Star> = {
  indisponivel: Ban,
  planejamento: PenSquare,
  livre_docencia: Star,
  reuniao_fluxo: Users2,
};

function IconeDaEtiqueta({ etiqueta }: { etiqueta: EtiquetaSlot }) {
  const Icone = ICONE_ETIQUETA[etiqueta.id] ?? Tag;
  return <Icone className={cn('h-3 w-3', etiqueta.id === 'livre_docencia' && 'fill-amber-500 dark:fill-amber-400')} />;
}

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

export function VisualizadorHorarioClient({ horario, forceView, forceTeacherId, turnosDisponiveis }: Props) {
  const [viewMode, setViewMode] = useState<'none' | 'single' | 'all' | 'teachers' | 'by-day'>(forceView || 'none');
  const [teacherViewMode, setTeacherViewMode] = useState<'individual' | 'all'>(forceTeacherId ? 'individual' : 'all');
  const [isActionPending, startAction] = useTransition();
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

  /**
   * Aulas gravadas sem professor definido, agrupadas por turma/componente.
   *
   * Elas ocupam o slot da turma como qualquer outra aula — sem este resumo a
   * grade parece completa, e a ausência só apareceria no dia em que ninguém
   * entra na sala. Aparece em grades salvas com pendências.
   */
  const componentesSemProfessor = useMemo(() => {
    const map = new Map<string, { turma: string; componente: string; aulas: number }>();
    horario.aulas.forEach(aula => {
      if (aula.professor_id) return;
      const chave = `${aula.turma_id}|${aula.componente_id}`;
      const atual = map.get(chave);
      if (atual) atual.aulas++;
      else map.set(chave, {
        turma: aula.turma?.nome ?? '—',
        componente: aula.componente?.sigla || aula.componente?.nome || '—',
        aulas: 1,
      });
    });
    return Array.from(map.values()).sort((a, b) => a.turma.localeCompare(b.turma));
  }, [horario.aulas]);

  const [selectedTurmaId, setSelectedTurmaId] = useState<string>('');
  const [selectedProfessorId, setSelectedProfessorId] = useState<string>(forceTeacherId || '');
  const [selectedDayId, setSelectedDayId] = useState<string>('');

  useEffect(() => {
    if (turmas.length > 0 && !selectedTurmaId) setSelectedTurmaId(turmas[0].id);
    if (professores.length > 0 && !selectedProfessorId && !forceTeacherId) setSelectedProfessorId(professores[0].id);
    if (diasAtivos.length > 0 && !selectedDayId) setSelectedDayId(diasAtivos[0].id);
  }, [turmas, professores, diasAtivos, forceTeacherId]);

  const isIntegral = horario.turno.nome.toLowerCase().includes('integral');

  const handleConsolidar = () => {
      startAction(async () => {
          const result = await consolidarHorario(horario.id);
          if (result.error) {
              toast({ title: 'Erro ao publicar', description: result.error, variant: 'destructive' });
          } else {
              toast({ title: 'Horário Publicado!', description: 'Esta grade agora é a oficial para consulta pública.' });
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
              toast({ title: 'Rascunho Reativado', description: 'O horário não é mais exibido publicamente.' });
              window.location.reload();
          }
      });
  };

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

    /**
     * Etiqueta de restrição do slot na grade do professor.
     *
     * Vale para todos os tipos que o professor cadastrou — indisponibilidade,
     * reunião de fluxo, planejamento, livre docência (por período ou marcada
     * célula a célula) e os tipos personalizados. A regra de quais bloqueiam de
     * fato é a mesma que o motor aplica; ver `@/lib/restricoes-slot`.
     */
    const profDaGrade = isProfessorView ? professores.find(p => p.id === targetId) : undefined;
    const getEtiqueta = (dia: string, index: number): EtiquetaSlot | null =>
        isProfessorView ? etiquetaDoSlot(profDaGrade, turnoInfo, dia, index) : null;

    const diasAtivosLocal = DIAS_SEMANA_MAP.filter(d => turnoInfo.dias_semana.includes(d.id));

    /** Legenda: só os tipos que realmente aparecem nesta grade. */
    const etiquetasNaGrade: EtiquetaSlot[] = [];
    if (isProfessorView) {
        const vistas = new Set<string>();
        for (const dia of diasAtivosLocal) {
            for (let i = 0; i < turnoInfo.aulas_por_dia; i++) {
                const et = getEtiqueta(dia.id, i);
                if (et && !vistas.has(et.id)) {
                    vistas.add(et.id);
                    etiquetasNaGrade.push(et);
                }
            }
        }
    }

    /**
     * Pendências desta turma. Elas não têm dia/horário — justamente por não
     * terem sido alocadas — então não dá para apontar a célula exata de cada
     * uma. O que a grade faz é marcar os slots vazios como VAGA e listar aqui
     * quais componentes ficaram de fora, com o motivo que o motor apurou.
     */
    const nomeDaTurma = isProfessorView ? null : turmas.find(t => t.id === targetId)?.nome;
    const pendenciasDaTurma = nomeDaTurma
        ? (horario.pendencias ?? []).filter(p => p.turma_nome === nomeDaTurma)
        : [];
    const temPendencias = pendenciasDaTurma.length > 0;

    return (
        <div className="space-y-3 print:space-y-1 break-inside-avoid w-full">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2 print:text-black">
                <div className={cn("w-2 h-2 rounded-full", tipo === 'nao_presencial' ? "bg-orange-400" : "bg-primary")} />
                {label} ({turnoInfo.nome})
            </h3>

            {etiquetasNaGrade.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    {etiquetasNaGrade.map(et => (
                        <span key={et.id} className={cn("flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide", TOM_TEXTO[et.tom])}>
                            <IconeDaEtiqueta etiqueta={et} />
                            {et.label}
                        </span>
                    ))}
                </div>
            )}

            {temPendencias && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-destructive">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {pendenciasDaTurma.length} aula(s) não alocada(s) nesta turma
                    </div>
                    <ul className="space-y-0.5">
                        {pendenciasDaTurma.map((p, i) => (
                            <li key={i} className="text-[11px] leading-snug">
                                <span className="font-semibold">{p.disciplina_nome}</span>
                                {p.professor_nome && <span className="text-muted-foreground"> · {p.professor_nome}</span>}
                                <span className="text-destructive"> — {p.motivo_real}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            <div className="rounded-xl border bg-card overflow-hidden print:border-black print:rounded-none shadow-sm">
                <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                    <thead>
                    <tr className="bg-muted/50 border-b print:bg-muted print:border-black">
                        <th className="p-2 text-left font-medium border-r w-24 print:w-20 print:border-black print:text-[8px]">Horário</th>
                        {diasAtivosLocal.map(dia => (
                        <th key={dia.id} className="p-2 text-center font-medium min-w-[100px] print:border-black print:text-[8px]">
                            {dia.label}
                        </th>
                        ))}
                    </tr>
                    </thead>
                    <tbody>
                    {Array.from({ length: turnoInfo.aulas_por_dia }).map((_, aulaIndex) => {
                        const hConfig = turnoInfo.horarios?.[aulaIndex];
                        const rows = [];

                        rows.push(
                            <tr key={`aula-${aulaIndex}`} className="border-b last:border-0 hover:bg-muted/10 transition-colors h-16 print:h-auto print:border-black">
                                <td className="p-2 print:p-1 font-medium bg-muted/20 border-r print:border-black print:bg-background">
                                    <div className="font-bold text-primary print:text-black print:text-[8px]">{aulaIndex + 1}ª Aula</div>
                                    <div className="text-[9px] text-muted-foreground font-normal print:text-[7px]">
                                    {hConfig?.inicio || '--:--'} - {hConfig?.fim || '--:--'}
                                    </div>
                                </td>
                                {diasAtivosLocal.map(dia => {
                                    const aula = getAulaNoSlot(dia.id, aulaIndex);
                                    const etiqueta = getEtiqueta(dia.id, aulaIndex);

                                    return (
                                    <td 
                                        key={dia.id} 
                                        className={cn(
                                            "p-1 text-center border-r last:border-r-0 print:border-black", 
                                            etiqueta && !aula && TOM_CELULA[etiqueta.tom]
                                        )}
                                    >
                                        {aula ? (
                                        <div className="flex flex-col items-center justify-center gap-0.5">
                                            <div className={cn(
                                                "font-bold text-[10px] leading-tight uppercase px-1 py-0.5 rounded w-full line-clamp-2 shadow-sm border",
                                                // Aula sem professor tem aparência própria: ela ocupa o slot da
                                                // turma como qualquer outra, então sem marcação a grade parece
                                                // completa e o buraco só aparece no dia em que a aula não acontece.
                                                !aula.professor_id
                                                    ? "bg-destructive/10 text-destructive border-destructive/30 border-dashed"
                                                    : aula.tipo === 'presencial'
                                                        ? "bg-primary/10 text-primary border-primary/20"
                                                        : "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800"
                                            )}>
                                            {aula.componente.sigla || aula.componente.nome}
                                            </div>
                                            <div className={cn(
                                                "text-[8px] font-bold truncate w-full uppercase",
                                                !aula.professor_id && !isProfessorView ? "text-destructive" : "text-muted-foreground"
                                            )}>
                                                {isProfessorView ? `Turma ${aula.turma.nome}` : (aula.professor?.nome_horario || 'SEM PROFESSOR')}
                                            </div>
                                        </div>
                                        ) : etiqueta ? (
                                            <div className={cn("flex flex-col items-center justify-center gap-0.5", TOM_TEXTO[etiqueta.tom])}>
                                                <IconeDaEtiqueta etiqueta={etiqueta} />
                                                <span className="text-[8px] font-black uppercase leading-tight">{etiqueta.label}</span>
                                            </div>
                                        ) : temPendencias ? (
                                            // Slot vago numa turma que ficou com aulas de fora. Sem esta marca
                                            // o buraco é indistinguível de um intervalo previsto na grade.
                                            <div className="border border-dashed border-destructive/40 bg-destructive/5 rounded px-1 py-1.5">
                                                <span className="text-[8px] font-black uppercase text-destructive/70">Vaga</span>
                                            </div>
                                        ) : <span className="text-muted-foreground/10">-</span>}
                                    </td>
                                    )
                                })}
                            </tr>
                        );

                        if (hConfig?.tem_intervalo_depois && aulaIndex < turnoInfo.aulas_por_dia - 1) {
                            rows.push(
                                <tr key={`intervalo-${aulaIndex}`} className="bg-orange-50/20 dark:bg-orange-950/10 h-10 border-b print:border-black">
                                    <td className="p-2 text-center font-bold text-[9px] uppercase bg-orange-100/30 dark:bg-orange-900/20 border-r flex items-center justify-center gap-1">
                                        <Coffee className="h-3 w-3 text-orange-500 dark:text-orange-400" /> Intervalo
                                    </td>
                                    <td colSpan={diasAtivosLocal.length} className="p-2 text-center text-[10px] font-bold text-orange-700/60 dark:text-orange-400/70 uppercase tracking-widest">
                                        {hConfig.fim} às {turnoInfo.horarios?.[aulaIndex + 1]?.inicio || '--:--'}
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

    const globalTurnos = new Map<string, Turno>();
    globalTurnos.set(horario.turno.id, horario.turno);
    if (horario.turno_oposto) globalTurnos.set(horario.turno_oposto.id, horario.turno_oposto);
    turnosDisponiveis?.forEach(t => globalTurnos.set(t.id, t));
    allTeacherAulas.forEach(a => {
        const baseT = (a as any).horario?.turno;
        if (baseT) globalTurnos.set(baseT.id, baseT);
    });

    // 1. Todo turno onde o professor tem aula entra na agenda.
    const turnosMap = new Map<string, Turno>();
    allTeacherAulas.forEach(aula => {
        let turnoFisico: Turno | undefined;
        if (aula.turno_id && globalTurnos.has(aula.turno_id)) {
            turnoFisico = globalTurnos.get(aula.turno_id);
        } else if (aula.horario_id === horario.id) {
            turnoFisico = aula.tipo === 'nao_presencial' ? horario.turno_oposto : horario.turno;
        } else {
            turnoFisico = (aula as any).horario?.turno;
        }

        if (turnoFisico) {
            turnosMap.set(turnoFisico.id, turnoFisico);
        }
    });

    /**
     * 2. Turno sem aula só entra se o professor for lotado nele E tiver
     * restrição cadastrada lá.
     *
     * Os dois filtros importam. Antes os candidatos eram o turno do `horario`
     * recebido e o contraturno dele — no portal de consulta esse `horario` é um
     * qualquer da escola, e `turno_oposto` de um Integral cai num turno
     * arbitrário. Bastava a livre docência do professor ser de manhã para um
     * Matutino fantasma, sem nenhuma aula, aparecer ao lado do Integral dele.
     */
    const lotacao = prof.turnos_ids ?? [];
    const candidatos = turnosDisponiveis?.length ? turnosDisponiveis : Array.from(globalTurnos.values());

    candidatos.forEach(t => {
        if (turnosMap.has(t.id)) return;
        if (!lotacao.includes(t.id)) return;
        if (temRestricaoNoTurno(prof, t)) turnosMap.set(t.id, t);
    });

    const turnosEnvolvidos = Array.from(turnosMap.values()).sort((a, b) => a.nome.localeCompare(b.nome));

    return (
        <div className="space-y-8 pt-4 break-after-page print:pt-0">
            <div className="flex items-center gap-3 border-b pb-4">
                <div className="h-12 w-12 rounded-full bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400 flex items-center justify-center print:hidden">
                    <User className="h-6 w-6" />
                </div>
                <div>
                    <h2 className="text-xl font-bold tracking-tight">{prof.nome_horario}</h2>
                    <p className="text-sm text-muted-foreground">Grade Docente Consolidada</p>
                </div>
            </div>
            
            {turnosEnvolvidos.length > 0 ? (
                turnosEnvolvidos.map(turno => {
                    const aulasDesteTurno = allTeacherAulas.filter(a => {
                        if (a.turno_id) return a.turno_id === turno.id;
                        
                        // Fallback legado se a.turno_id não estiver presente:
                        if (a.horario_id === horario.id) {
                            return a.tipo === 'nao_presencial' ? turno.id === horario.turno_oposto?.id : turno.id === horario.turno_id;
                        }
                        return (a as any).horario?.turno_id === turno.id;
                    });
                    return (
                        <GradeHoraria 
                            key={turno.id} 
                            targetId={professorId} 
                            isProfessorView={true} 
                            label={`Turno: ${turno.nome}`} 
                            turnoInfo={turno} 
                            dataset={aulasDesteTurno} 
                        />
                    );
                })
            ) : (
                <div className="p-12 text-center border-2 border-dashed rounded-2xl bg-muted/5">
                    <p className="text-muted-foreground">Este professor não possui aulas ou restrições em nenhum turno publicado.</p>
                </div>
            )}
        </div>
    );
  }

  const RenderByDay = () => {
    return (
        <div className="space-y-12 pt-4">
            {diasAtivos.map(dia => (
                <div key={dia.id} className="space-y-4 break-after-page">
                    <h2 className="text-xl font-black uppercase flex items-center gap-2 border-b-2 border-primary pb-2">
                        <CalendarDays className="h-6 w-6 text-primary" /> {dia.label} - {horario.turno.nome}
                    </h2>
                    <div className="rounded-xl border bg-card overflow-hidden shadow-md">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm border-collapse">
                                <thead>
                                    <tr className="bg-muted/50 border-b">
                                        <th className="p-4 text-left font-bold border-r w-32">Horário</th>
                                        {turmas.map(t => (
                                            <th key={t.id} className="p-4 text-center font-bold min-w-[150px] border-r last:border-r-0">
                                                TURMA {t.nome}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {Array.from({ length: horario.turno.aulas_por_dia }).map((_, aulaIndex) => (
                                        <tr key={aulaIndex} className="border-b last:border-0 h-24 hover:bg-muted/5">
                                            <td className="p-4 font-bold bg-muted/10 border-r">
                                                <div className="text-primary">{aulaIndex + 1}ª Aula</div>
                                                <div className="text-[10px] text-muted-foreground font-normal">
                                                    {horario.turno.horarios?.[aulaIndex]?.inicio || '--:--'} - {horario.turno.horarios?.[aulaIndex]?.fim || '--:--'}
                                                </div>
                                            </td>
                                            {turmas.map(t => {
                                                const aula = horario.aulas.find(a => 
                                                    a.turma_id === t.id && a.dia_semana === dia.id && a.aula_index === aulaIndex && a.tipo === 'presencial'
                                                );
                                                return (
                                                    <td key={t.id} className="p-2 text-center border-r last:border-r-0">
                                                        {aula ? (
                                                            <div className="flex flex-col items-center justify-center gap-1">
                                                                <div className={cn(
                                                                    "font-bold text-[10px] leading-tight uppercase px-2 py-1 rounded border w-full shadow-sm",
                                                                    aula.professor_id
                                                                        ? "bg-primary/5 border-primary/10 text-primary"
                                                                        : "bg-destructive/10 border-destructive/30 border-dashed text-destructive"
                                                                )}>
                                                                    {aula.componente.sigla || aula.componente.nome}
                                                                </div>
                                                                <div className={cn(
                                                                    "text-[9px] font-bold uppercase truncate w-full",
                                                                    aula.professor_id ? "text-muted-foreground" : "text-destructive"
                                                                )}>
                                                                    {aula.professor?.nome_horario || 'SEM PROFESSOR'}
                                                                </div>
                                                            </div>
                                                        ) : <span className="text-muted-foreground/10">-</span>}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
  };

  if (viewMode === 'none') {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 py-8">
            {[
                { id: 'single', label: 'Turma por Turma', icon: Layout, desc: 'Foco em uma sala individual.' },
                { id: 'all', label: 'Todas as Turmas', icon: Layers, desc: 'Lista vertical completa.' },
                { id: 'by-day', label: 'Visão por Dia', icon: CalendarDays, desc: 'Tabela operacional diária.' }
            ].map(opt => (
                <Card 
                    key={opt.id} 
                    className="hover:border-primary cursor-pointer group transition-all"
                    onClick={() => setViewMode(opt.id as any)}
                >
                    <CardHeader className="text-center pb-6">
                        <div className="mx-auto h-12 w-12 rounded-lg bg-muted flex items-center justify-center group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                            <opt.icon className="h-6 w-6" />
                        </div>
                        <CardTitle className="text-sm font-bold pt-4">{opt.label}</CardTitle>
                        <CardDescription className="text-[10px]">{opt.desc}</CardDescription>
                    </CardHeader>
                </Card>
            ))}
        </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 bg-muted/20 p-4 rounded-xl border print:hidden">
          <div className="flex-1">
              <span className="text-xs font-bold uppercase text-muted-foreground block mb-1">Status do Horário</span>
              {horario.status === 'publicado' ? (
                  <div className="flex items-center gap-2">
                      <Badge className="bg-green-500 text-white gap-1"><CheckCircle2 className="h-3 w-3"/> Oficializado (Público)</Badge>
                      <Button variant="outline" size="sm" onClick={handleReverter} disabled={isActionPending} className="h-7 text-[10px] font-bold">
                          {isActionPending ? <Loader2 className="animate-spin h-3 w-3"/> : <Undo2 className="h-3 w-3 mr-1"/>}
                          Reverter para Rascunho
                      </Button>
                  </div>
              ) : (
                  <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-orange-600 border-orange-200 bg-orange-50 dark:text-orange-400 dark:border-orange-800 dark:bg-orange-950/30">Rascunho (Privado)</Badge>
                      <Button size="sm" onClick={handleConsolidar} disabled={isActionPending} className="h-7 text-[10px] font-bold bg-green-600 hover:bg-green-700">
                          {isActionPending ? <Loader2 className="animate-spin h-3 w-3"/> : <Save className="h-3 w-3 mr-1"/>}
                          Publicar Grade Oficial
                      </Button>
                  </div>
              )}
          </div>
          <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => exportarHorarioXLSX(horario)} className="gap-2 text-emerald-700 border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800 dark:text-emerald-400 dark:border-emerald-800 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-300">
                  <FileDown className="h-4 w-4" /> Exportar .xlsx
              </Button>
              {/*
                  PDF do horário INTEIRO, montado a partir dos dados — não do que
                  está na tela. É a diferença para o botão ao lado: "Imprimir
                  tela" reproduz a visualização atual, então em modo "turma única"
                  ou "por dia" ele sai com uma turma só, que é o que se esperava
                  dele mas não o que se espera de um PDF do horário.
              */}
              <Button variant="outline" size="sm" onClick={() => exportarHorarioPDF(horario)} className="gap-2 text-rose-700 border-rose-200 hover:bg-rose-50 hover:text-rose-800 dark:text-rose-400 dark:border-rose-800 dark:hover:bg-rose-950/30 dark:hover:text-rose-300">
                  <FileText className="h-4 w-4" /> PDF completo
              </Button>
              <Button variant="outline" size="sm" onClick={() => window.print()} title="Imprime exatamente o que está sendo exibido nesta tela">
                  <Printer className="mr-2 h-4 w-4" /> Imprimir tela
              </Button>
          </div>
      </div>

      {componentesSemProfessor.length > 0 && (
        <Alert variant="destructive" className="bg-destructive/5 border-destructive/20">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle className="font-bold">
            {componentesSemProfessor.reduce((s, c) => s + c.aulas, 0)} aula(s) sem professor definido
          </AlertTitle>
          <AlertDescription className="mt-2 space-y-2 text-sm">
            <p>
              Estes componentes ocupam o horário da turma, mas não têm professor vinculado —
              na grade eles aparecem com borda tracejada e o rótulo <strong>SEM PROFESSOR</strong>.
              Vincule o professor em <strong>Turmas</strong> e gere a grade de novo, ou ajuste pelo Refino.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {componentesSemProfessor.map((c, i) => (
                <span key={i} className="text-xs bg-background border border-destructive/20 rounded-md px-2 py-1">
                  <strong>{c.turma}</strong> · {c.componente}
                  <span className="text-muted-foreground"> ({c.aulas} aula{c.aulas > 1 ? 's' : ''})</span>
                </span>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      <Card className="print:border-none print:shadow-none">
        {forceView !== 'teachers' && (
            <CardHeader className="flex flex-col md:flex-row md:items-center justify-between space-y-4 md:space-y-0 pb-6 border-b mb-6 print:hidden">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)} className="w-auto">
                <TabsList className="h-10">
                    <TabsTrigger value="single" className="gap-2"><Layout className="h-3.5 w-3.5" /> Turmas</TabsTrigger>
                    <TabsTrigger value="all" className="gap-2"><Layers className="h-3.5 w-3.5" /> Todas</TabsTrigger>
                    <TabsTrigger value="by-day" className="gap-2"><CalendarDays className="h-3.5 w-3.5" /> Por Dia</TabsTrigger>
                </TabsList>
          </Tabs>
          
          <div className="flex flex-wrap items-center gap-4">
            {viewMode === 'single' && (
                <Select value={selectedTurmaId} onValueChange={setSelectedTurmaId}>
                    <SelectTrigger className="w-[200px] h-9"><SelectValue placeholder="Turma" /></SelectTrigger>
                    <SelectContent>{turmas.map(t => <SelectItem key={t.id} value={t.id}>Turma {t.nome}</SelectItem>)}</SelectContent>
                </Select>
            )}
            {viewMode === 'teachers' && teacherViewMode === 'individual' && (
                <Select value={selectedProfessorId} onValueChange={setSelectedProfessorId}>
                    <SelectTrigger className="w-[200px] h-9"><SelectValue placeholder="Professor" /></SelectTrigger>
                    <SelectContent>{professores.map(p => <SelectItem key={p.id} value={p.id}>{p.nome_horario}</SelectItem>)}</SelectContent>
                </Select>
            )}
          </div>
        </CardHeader>
        )}
        
        <CardContent className="print:p-0">
          {viewMode === 'single' ? (
            <div className="space-y-8 animate-in fade-in duration-500">
                <GradeHoraria targetId={selectedTurmaId} label="Grade Regular" turnoInfo={horario.turno} tipo="presencial" />
                {!isIntegral && <GradeHoraria targetId={selectedTurmaId} label="Grade do Contraturno" turnoInfo={horario.turno_oposto} tipo="nao_presencial" />}
            </div>
          ) : viewMode === 'all' ? (
            <div className="space-y-16 animate-in fade-in duration-500">
                {turmas.map(turma => (
                    <div key={turma.id} className="space-y-6 break-after-page">
                        <h2 className="text-xl font-black uppercase">TURMA {turma.nome}</h2>
                        <GradeHoraria targetId={turma.id} label="Grade Regular" turnoInfo={horario.turno} tipo="presencial" />
                        {!isIntegral && <GradeHoraria targetId={turma.id} label="Grade do Contraturno" turnoInfo={horario.turno_oposto} tipo="nao_presencial" />}
                    </div>
                ))}
            </div>
          ) : viewMode === 'teachers' ? (
            <div className="animate-in fade-in duration-500">
                <TeacherIndividualView professorId={selectedProfessorId} />
            </div>
          ) : <RenderByDay />}
        </CardContent>
      </Card>
    </div>
  );
}