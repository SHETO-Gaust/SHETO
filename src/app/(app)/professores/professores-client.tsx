'use client';

import { useState, useTransition, useEffect, useMemo } from 'react';
import type { ProfessorComDados, Turno, ComponenteCurricular, LivreDocenciaItem, LivreDocenciaPeriodo } from '@/lib/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PlusCircle, CalendarX, Trash2, Pencil, Mail, Loader2, CheckCircle2, XCircle, AlertCircle, Ban, PenSquare, MousePointer2, Info, Star, MessageSquare, CalendarDays } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { EditProfessorSheet } from './edit-professor-sheet';
import { DisciplinasProfessorSheet } from './disciplinas-professor-sheet';
import { RestricoesProfessorSheet } from './restricoes-professor-sheet';
import { DeleteProfessorDialog } from './delete-professor-dialog';
import { ExportarRestricoes } from './exportar-restricoes';
import { getProfessores, solicitarRestricoesEmail, processarRespostaRestricao } from './actions';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

type ProfessoresClientProps = {
  initialProfessores: ProfessorComDados[];
  escolaId: string;
  turnosDaEscola: Turno[];
  componentesDaEscola: ComponenteCurricular[];
};

type SheetType = 'edit' | 'disciplinas' | 'restricoes' | null;

const DIAS_SEMANA_MAP = [
  { id: 'segunda', label: 'Seg' }, { id: 'terca', label: 'Ter' },
  { id: 'quarta', label: 'Qua' }, { id: 'quinta', label: 'Qui' },
  { id: 'sexta', label: 'Sex' }, { id: 'sabado', label: 'Sáb' },
];

const PERIODOS_LABELS: Record<LivreDocenciaPeriodo, string> = {
    matutino: 'Manhã',
    vespertino: 'Tarde',
    noturno: 'Noite'
};

export function ProfessoresClient({
  initialProfessores,
  escolaId,
  turnosDaEscola,
  componentesDaEscola,
}: ProfessoresClientProps) {
  const [professores, setProfessores] = useState(initialProfessores);
  const [selectedProfessor, setSelectedProfessor] = useState<ProfessorComDados | null>(null);
  const [activeSheet, setActiveSheet] = useState<SheetType>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [reviewData, setReviewData] = useState<any>(null);
  const [reviewLivreDocencia, setReviewLivreDocencia] = useState<LivreDocenciaItem[]>([]);
  const [reviewSemPreferencia, setReviewSemPreferencia] = useState(false);
  const [reviewDiasPreferidos, setReviewDiasPreferidos] = useState<string[]>([]);
  const [reviewEnviarEmail, setReviewEnviarEmail] = useState(false);
  const [reviewJustificativa, setReviewJustificativa] = useState('');
  const [isSendingMail, setIsSendingMail] = useState<string | null>(null);
  const [isActionPending, startAction] = useTransition();
  const { toast } = useToast();

  const availablePeriods = useMemo(() => {
      const periods = new Set<LivreDocenciaPeriodo>();
      turnosDaEscola.forEach(t => {
          const n = t.nome.toLowerCase();
          if (n.includes('matutino') || n.includes('integral')) periods.add('matutino');
          if (n.includes('vespertino') || n.includes('integral')) periods.add('vespertino');
          if (n.includes('noturno')) periods.add('noturno');
      });
      return Array.from(periods);
  }, [turnosDaEscola]);

  const fetchAndUpdateProfessores = async () => {
    const { data, error } = await getProfessores(escolaId);
    if (error) {
      toast({ title: 'Erro ao atualizar', variant: 'destructive' });
    } else if (data) {
      setProfessores(data);
    }
  };

  const handleRequestMail = (id: string) => {
      setIsSendingMail(id);
      startAction(async () => {
          const result = await solicitarRestricoesEmail(id);
          setIsSendingMail(null);
          if (result.error) {
              toast({ title: 'Erro no envio', description: result.error, variant: 'destructive' });
          } else {
              toast({ title: 'E-mail enviado!', description: 'O professor recebeu o link para preencher preferências e livre docência.' });
              fetchAndUpdateProfessores();
          }
      });
  };

  const handleReviewCellClick = (turnoId: string, diaId: string, aulaIdx: number) => {
      setReviewData((prev: any) => {
          const newData = JSON.parse(JSON.stringify(prev || {}));
          if (!newData[turnoId]) newData[turnoId] = {};
          if (!newData[turnoId][diaId]) newData[turnoId][diaId] = {};

          const currentVal = newData[turnoId][diaId][aulaIdx];
          
          if (currentVal === 'planejamento') {
              toast({ title: 'Campo Bloqueado', description: 'O planejamento deve ser editado no cadastro principal do professor.' });
              return prev;
          }

          if (currentVal === 'indisponivel') {
              delete newData[turnoId][diaId][aulaIdx];
          } else {
              newData[turnoId][diaId][aulaIdx] = 'indisponivel';
          }
          return newData;
      });
  };

  const toggleReviewLivreDocencia = (periodo: LivreDocenciaPeriodo, diaId: string) => {
      if (reviewSemPreferencia) return;
      const isSelected = reviewLivreDocencia.some(item => item.periodo === periodo && item.dia === diaId);
      if (isSelected) {
          setReviewLivreDocencia(prev => prev.filter(item => !(item.periodo === periodo && item.dia === diaId)));
      } else {
          if (reviewLivreDocencia.length >= 2) return;
          setReviewLivreDocencia(prev => [...prev, { periodo, dia: diaId }]);
      }
  };

  const handleReviewAction = (solicitacaoId: string, acao: 'confirmar' | 'rejeitar') => {
      startAction(async () => {
          const result = await processarRespostaRestricao(
              solicitacaoId, acao,
              reviewData, reviewLivreDocencia, reviewSemPreferencia, reviewJustificativa,
              reviewDiasPreferidos,
              acao === 'confirmar' ? reviewEnviarEmail : false
          );
          if (result.error) {
              toast({ title: 'Erro ao processar', description: result.error, variant: 'destructive' });
          } else {
              toast({ 
                  title: acao === 'confirmar' ? 'Dados Aplicados!' : 'Resposta Descartada',
                  description: acao === 'confirmar'
                      ? `Preferências aplicadas${reviewEnviarEmail ? ' — e-mail enviado ao professor.' : '.'}`
                      : 'A sugestão do professor foi ignorada.'
              });
              setIsReviewOpen(false);
              setReviewData(null);
              setReviewLivreDocencia([]);
              fetchAndUpdateProfessores();
          }
      });
  }

  const openSheet = (professor: ProfessorComDados | null, type: SheetType) => {
    setSelectedProfessor(professor);
    setActiveSheet(type);
  };
  
  const openDialog = (professor: ProfessorComDados) => {
    setSelectedProfessor(professor);
    setIsDialogOpen(true);
  };

  const openReview = (professor: ProfessorComDados) => {
      setSelectedProfessor(professor);
      setReviewData(professor.solicitacao_pendente?.dados_temp || {});
      setReviewLivreDocencia(professor.solicitacao_pendente?.livre_docencia_temp || []);
      setReviewSemPreferencia(professor.solicitacao_pendente?.sem_preferencia_livre_docencia_temp || false);
      setReviewDiasPreferidos((professor.solicitacao_pendente as any)?.dias_preferidos_temp || []);
      setReviewJustificativa(professor.solicitacao_pendente?.justificativa || '');
      setIsReviewOpen(true);
  };
  
  const closeModals = () => {
    setActiveSheet(null);
    setIsDialogOpen(false);
    setIsReviewOpen(false);
    setReviewData(null);
    setReviewLivreDocencia([]);
    setReviewSemPreferencia(false);
    setReviewDiasPreferidos([]);
    setReviewEnviarEmail(false);
    setReviewJustificativa('');
    setTimeout(() => {
        setSelectedProfessor(null);
    }, 300);
  };

  const isSheetOpenFor = (type: SheetType) => activeSheet === type;
  const setSheetOpenFor = (type: SheetType) => (open: boolean) => {
    if (!open) {
        closeModals();
    } else {
        setActiveSheet(type);
    }
  };

  return (
    <TooltipProvider>
      <div className="flex justify-end items-center gap-2 mb-4">
        <ExportarRestricoes professores={professores} turnosDaEscola={turnosDaEscola} />
        <Button onClick={() => openSheet(null, 'edit')}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Adicionar Professor
        </Button>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Disciplinas</TableHead>
              <TableHead>Turnos</TableHead>
              <TableHead className="text-center">Aulas</TableHead>
              <TableHead className="w-[240px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {professores.map((prof) => {
              const sol = prof.solicitacao_pendente;
              const hasResponse = sol?.status === 'respondido';
              const isWaiting = sol?.status === 'pendente';
              const isPendente = !prof.sem_preferencia_livre_docencia && (!prof.livre_docencia || prof.livre_docencia.length === 0);

              return (
                <TableRow key={prof.id}>
                  <TableCell>
                    <div className="flex items-center gap-2 flex-wrap">
                        <div>
                            <div className="font-medium">{prof.nome_completo}</div>
                            <div className="text-xs text-muted-foreground">{prof.nome_horario} | {prof.email || 'Sem e-mail'}</div>
                        </div>
                        {isPendente && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Badge className="bg-orange-500 hover:bg-orange-500 text-white text-[10px] gap-1 cursor-default animate-pulse border-0 select-none">
                                        <AlertCircle className="h-2.5 w-2.5" /> Pendente
                                    </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Aguardando restrições e livre docência do professor</p>
                                </TooltipContent>
                            </Tooltip>
                        )}
                        {hasResponse && (
                            <Badge className="bg-blue-600 hover:bg-blue-700 animate-pulse cursor-pointer gap-1" onClick={() => openReview(prof)}>
                                <AlertCircle className="h-3 w-3" /> Resposta Disponível
                            </Badge>
                        )}
                        {isWaiting && (
                            <Badge variant="outline" className="text-[10px] text-orange-600 border-orange-200 dark:text-orange-400 dark:border-orange-800">
                                Aguardando Professor
                            </Badge>
                        )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {prof.componentes.length > 0 ? (
                        prof.componentes.map(c => <Badge key={c.id} variant="secondary" className="text-[10px]">{c.sigla}</Badge>)
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Nenhuma</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                     <div className="flex flex-wrap gap-1">
                       {prof.turnos.length > 0 ? (
                         prof.turnos.map(t => <Badge key={t.id} variant="outline" className="text-[10px] uppercase">{t.nome}</Badge>)
                       ) : (
                         <span className="text-xs text-muted-foreground italic">Nenhum</span>
                       )}
                     </div>
                  </TableCell>
                  <TableCell className="text-center font-medium">
                      <div className="text-xs">{prof.aulas_disponiveis} disp.</div>
                      <div className="text-[10px] text-muted-foreground">{prof.aulas_planejamento} plan.</div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className={cn(prof.email ? "text-primary" : "text-muted-foreground/30")} disabled={!prof.email || isSendingMail === prof.id} onClick={() => handleRequestMail(prof.id)}>
                                    {isSendingMail === prof.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent><p>{prof.email ? "Solicitar Preferências via E-mail" : "Cadastre o e-mail institucional"}</p></TooltipContent>
                        </Tooltip>

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={() => openSheet(prof, 'edit')}>
                                    <Pencil className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent><p>Editar Dados e Livre Docência</p></TooltipContent>
                        </Tooltip>

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className={cn(isPendente && "hover:bg-orange-50 dark:hover:bg-orange-950/30")}
                                    onClick={() => openSheet(prof, 'restricoes')}
                                >
                                    <CalendarX className={cn("h-4 w-4", isPendente && "animate-pendente")} />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent><p>Restrições Manuais{isPendente ? ' (Pendente)' : ''}</p></TooltipContent>
                        </Tooltip>

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => openDialog(prof)}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent><p>Deletar Professor</p></TooltipContent>
                        </Tooltip>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* REVISÃO DE RESPOSTA DO PROFESSOR */}
      <AlertDialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
          <AlertDialogContent className="sm:max-w-5xl max-h-[95vh] flex flex-col p-0 overflow-hidden">
              <AlertDialogHeader className="p-6 pb-2">
                  <AlertDialogTitle className="flex items-center gap-2">
                      <CheckCircle2 className="text-blue-600" /> 
                      Revisar Preferências do Professor
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                      Confira a livre docência e indisponibilidades enviadas por <strong>{selectedProfessor?.nome_completo}</strong>.
                  </AlertDialogDescription>
              </AlertDialogHeader>
              
              <div className="flex-1 min-h-0 overflow-y-auto px-6">
                <div className="space-y-8 pb-6 pt-2">
                    <div className="bg-primary/10 dark:bg-primary/20 border border-primary/20 dark:border-primary/40 p-4 rounded-xl flex items-start gap-3">
                        <Info className="h-5 w-5 text-primary shrink-0" />
                        <div className="space-y-1">
                            <p className="text-xs font-bold text-primary uppercase tracking-tight">Legenda de Edição:</p>
                            <div className="flex gap-4 text-[10px] text-muted-foreground">
                                <span className="flex items-center gap-1"><Ban className="h-3 w-3 text-red-500" /> Indisponibilidade (Edita)</span>
                                <span className="flex items-center gap-1"><PenSquare className="h-3 w-3 text-blue-500" /> Planejamento (Protegido)</span>
                                <span className="flex items-center gap-1"><Star className="h-3 w-3 text-primary fill-primary" /> Livre Docência (Edita)</span>
                            </div>
                        </div>
                    </div>

                    {/* SEÇÃO JUSTIFICATIVA REVISÃO */}
                    {reviewJustificativa && (
                        <div className="bg-orange-50 dark:bg-orange-950/50 border border-orange-200 dark:border-orange-800 p-4 rounded-xl space-y-2">
                            <p className="text-xs font-bold text-orange-800 dark:text-orange-200 uppercase flex items-center gap-2">
                                <MessageSquare className="h-4 w-4" /> Justificativa do Docente:
                            </p>
                            <p className="text-sm italic text-orange-900 dark:text-orange-100 leading-relaxed">
                                "{reviewJustificativa}"
                            </p>
                        </div>
                    )}

                    {/* DIAS PREFERIDOS (editável pelo coordenador) */}
                    <div className="rounded-xl border border-violet-200/60 dark:border-violet-800/60 bg-violet-50/40 dark:bg-violet-950/30 p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <CalendarDays className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                            <p className="text-xs font-bold text-violet-900 dark:text-violet-100 uppercase tracking-widest">Dias Preferidos para Concentração de Aulas</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {DIAS_SEMANA_MAP.map(dia => {
                                const isSelected = reviewDiasPreferidos.includes(dia.id);
                                return (
                                    <button
                                        key={dia.id}
                                        type="button"
                                        onClick={() => setReviewDiasPreferidos(prev =>
                                            isSelected ? prev.filter(d => d !== dia.id) : [...prev, dia.id]
                                        )}
                                        className={cn(
                                            'px-4 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest border-2 transition-all select-none',
                                            isSelected
                                                ? 'bg-violet-600 border-violet-600 text-white shadow-md scale-[1.03]'
                                                : 'bg-background border-border text-muted-foreground hover:border-violet-300'
                                        )}
                                    >
                                        {dia.label}
                                    </button>
                                );
                            })}
                        </div>
                        {reviewDiasPreferidos.length === 0 && (
                            <p className="text-[10px] text-violet-700/60 dark:text-violet-400 mt-2 italic">Nenhum dia selecionado — o motor usará qualquer dia disponível.</p>
                        )}
                    </div>

                    {/* SEÇÃO LIVRE DOCÊNCIA REVISÃO */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between border-b pb-2">
                            <div className="flex items-center gap-2 text-primary font-bold uppercase text-xs tracking-widest">
                                <Star className="h-4 w-4 fill-primary" /> Sugestão de Livre Docência
                            </div>
                            <div className="flex items-center gap-3">
                                <Label className="text-[10px] font-black uppercase text-primary">Sem Preferência</Label>
                                <Switch 
                                    checked={reviewSemPreferencia} 
                                    onCheckedChange={(checked) => {
                                        setReviewSemPreferencia(checked);
                                        if (checked) setReviewLivreDocencia([]);
                                    }} 
                                />
                            </div>
                        </div>
                        
                        {!reviewSemPreferencia ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {availablePeriods.map(periodo => (
                                    <div key={periodo} className="space-y-2">
                                        <p className="text-[10px] font-black text-muted-foreground uppercase">{PERIODOS_LABELS[periodo]}</p>
                                        <div className="flex flex-wrap gap-2">
                                            {DIAS_SEMANA_MAP.map(dia => {
                                                const isSelected = reviewLivreDocencia.some(item => item.periodo === periodo && item.dia === dia.id);
                                                return (
                                                    <Button 
                                                        key={dia.id}
                                                        variant={isSelected ? "default" : "outline"}
                                                        size="sm"
                                                        className={cn("h-8 text-[10px] font-bold", isSelected && "bg-primary")}
                                                        onClick={() => toggleReviewLivreDocencia(periodo, dia.id)}
                                                    >
                                                        {dia.label}
                                                    </Button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="p-6 text-center border-2 border-dashed rounded-xl bg-muted/5">
                                <p className="text-sm font-medium text-muted-foreground">O docente optou por não escolher dias específicos.</p>
                            </div>
                        )}
                    </div>

                    {/* SEÇÃO INDISPONIBILIDADE REVISÃO */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-primary font-bold uppercase text-xs tracking-widest border-b pb-2">
                            <Ban className="h-4 w-4" /> Grade de Indisponibilidades
                        </div>
                        {selectedProfessor && reviewData && (
                            <Tabs defaultValue={selectedProfessor.turnos_ids[0]} className="w-full">
                                <TabsList className="bg-muted w-full justify-start overflow-x-auto h-auto p-1">
                                    {selectedProfessor.turnos.map(t => (
                                        <TabsTrigger key={t.id} value={t.id} className="text-xs font-bold uppercase py-2 px-4">
                                            {t.nome}
                                        </TabsTrigger>
                                    ))}
                                </TabsList>
                                {selectedProfessor.turnos.map(turno => (
                                    <TabsContent key={turno.id} value={turno.id} className="mt-4 animate-in fade-in zoom-in-95 duration-300">
                                        <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
                                            <table className="w-full text-sm text-center border-collapse">
                                                <thead>
                                                    <tr className="bg-muted/30 border-b">
                                                        <th className="p-3 font-bold border-r w-24">Aula</th>
                                                        {DIAS_SEMANA_MAP.filter(d => turno.dias_semana.includes(d.id)).map(dia => (
                                                            <th key={dia.id} className="p-3 font-bold">{dia.label}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {Array.from({ length: turno.aulas_por_dia }).map((_, aulaIdx) => (
                                                        <tr key={aulaIdx} className="border-b last:border-0 h-16">
                                                            <td className="p-2 font-bold bg-muted/10 border-r">
                                                                <div className="text-primary">{aulaIdx + 1}ª</div>
                                                                <div className="text-[9px] text-muted-foreground uppercase">
                                                                    {turno.horarios?.[aulaIdx]?.inicio || '--:--'}
                                                                </div>
                                                            </td>
                                                            {DIAS_SEMANA_MAP.filter(d => turno.dias_semana.includes(d.id)).map(dia => {
                                                                const val = reviewData[turno.id]?.[dia.id]?.[aulaIdx];
                                                                const isIndisponivel = val === 'indisponivel';
                                                                const isPlanejamento = val === 'planejamento';
                                                                
                                                                return (
                                                                    <td 
                                                                        key={dia.id} 
                                                                        className={cn(
                                                                            "p-1 border-r last:border-r-0 transition-colors group",
                                                                            !isPlanejamento && "cursor-pointer hover:bg-muted/50",
                                                                            isIndisponivel ? "bg-red-50 dark:bg-red-950/50" : isPlanejamento ? "bg-blue-50 dark:bg-blue-950/50" : ""
                                                                        )}
                                                                        onClick={() => handleReviewCellClick(turno.id, dia.id, aulaIdx)}
                                                                    >
                                                                        <div className="flex items-center justify-center h-full relative">
                                                                            {isIndisponivel && <Ban className="h-5 w-5 text-red-500" />}
                                                                            {isPlanejamento && <PenSquare className="h-5 w-5 text-blue-500" />}
                                                                            {!val && <div className="h-1.5 w-1.5 rounded-full bg-slate-200 dark:bg-slate-600" />}
                                                                            
                                                                            {!isPlanejamento && (
                                                                                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 flex items-center justify-center bg-black/5 rounded">
                                                                                    <MousePointer2 className="h-3 w-3 text-muted-foreground" />
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
                                    </TabsContent>
                                ))}
                            </Tabs>
                        )}
                    </div>
                </div>
              </div>

              <AlertDialogFooter className="p-6 border-t bg-muted/50 flex-row items-center justify-between sm:justify-between gap-4">
                  <div className="flex gap-2">
                    <Button 
                        variant="ghost" 
                        disabled={isActionPending} 
                        onClick={() => handleReviewAction(selectedProfessor!.solicitacao_pendente!.id, 'rejeitar')} 
                        className="text-destructive hover:bg-destructive/10 font-bold"
                    >
                        <XCircle className="mr-2 h-4 w-4" /> Descartar
                    </Button>
                    <AlertDialogCancel className="mt-0">Fechar</AlertDialogCancel>
                  </div>

                  {/* Checkbox: enviar cópia ao professor */}
                  <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg cursor-pointer select-none dark:bg-blue-950/30 dark:border-blue-900" onClick={() => setReviewEnviarEmail(v => !v)}>
                      <Checkbox id="enviar-email-prof" checked={reviewEnviarEmail} onCheckedChange={(c) => setReviewEnviarEmail(!!c)} />
                      <label htmlFor="enviar-email-prof" className="text-xs font-bold text-blue-800 dark:text-blue-300 cursor-pointer whitespace-nowrap">
                          Enviar cópia ao professor
                      </label>
                  </div>

                  <Button 
                    disabled={isActionPending || (!reviewSemPreferencia && reviewLivreDocencia.length !== 2)} 
                    onClick={() => handleReviewAction(selectedProfessor!.solicitacao_pendente!.id, 'confirmar')} 
                    className="bg-blue-600 hover:bg-blue-700 font-bold px-8 shadow-lg"
                  >
                      {isActionPending ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                      Confirmar e Oficializar
                  </Button>
              </AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>
      
      <EditProfessorSheet
          isOpen={isSheetOpenFor('edit')}
          setIsOpen={setSheetOpenFor('edit')}
          professor={selectedProfessor}
          escolaId={escolaId}
          turnosDaEscola={turnosDaEscola}
          componentesDaEscola={componentesDaEscola}
          onProfessorUpdated={fetchAndUpdateProfessores}
          onCadastrarRestricoes={async (professorId: string) => {
              const { data } = await getProfessores(escolaId);
              if (data) {
                  setProfessores(data);
                  setTimeout(() => {
                      const prof = data.find(p => p.id === professorId);
                      if (prof) openSheet(prof, 'restricoes');
                  }, 450);
              }
          }}
      />
      
      {selectedProfessor && (
          <>
            <DisciplinasProfessorSheet
                isOpen={isSheetOpenFor('disciplinas')}
                setIsOpen={setSheetOpenFor('disciplinas')}
                professor={selectedProfessor}
                componentesDaEscola={componentesDaEscola}
                onDisciplinasUpdated={fetchAndUpdateProfessores}
            />

            <RestricoesProfessorSheet
                isOpen={isSheetOpenFor('restricoes')}
                setIsOpen={setSheetOpenFor('restricoes')}
                professor={selectedProfessor}
                onRestricoesUpdated={fetchAndUpdateProfessores}
            />
            
            <DeleteProfessorDialog
                isOpen={isDialogOpen}
                setIsOpen={setIsDialogOpen}
                professor={selectedProfessor}
                onProfessorDeleted={() => {
                    fetchAndUpdateProfessores();
                    closeModals();
                }}
            />
          </>
      )}
    </TooltipProvider>
  );
}
