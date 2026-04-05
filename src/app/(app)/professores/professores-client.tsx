
'use client';

import { useState, useTransition, useEffect } from 'react';
import type { ProfessorComDados, Turno, ComponenteCurricular } from '@/lib/types';
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
import { PlusCircle, BookCopy, CalendarX, Trash2, Pencil, Mail, Loader2, CheckCircle2, XCircle, AlertCircle, Eye, Ban, PenSquare, MousePointer2 } from 'lucide-react';
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
  const [isSendingMail, setIsSendingMail] = useState<string | null>(null);
  const [isActionPending, startAction] = useTransition();
  const { toast } = useToast();

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
              toast({ title: 'E-mail enviado!', description: 'O professor recebeu o link para preenchimento.' });
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
          
          // Impede mexer no planejamento (regra da coordenação)
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

  const handleReviewAction = (solicitacaoId: string, acao: 'confirmar' | 'rejeitar') => {
      startAction(async () => {
          const result = await processarRespostaRestricao(solicitacaoId, acao, reviewData);
          if (result.error) {
              toast({ title: 'Erro ao processar', description: result.error, variant: 'destructive' });
          } else {
              toast({ 
                  title: acao === 'confirmar' ? 'Restrições Aplicadas!' : 'Resposta Descartada',
                  description: acao === 'confirmar' ? 'O cadastro do professor foi atualizado com seus ajustes.' : 'A sugestão do professor foi ignorada.'
              });
              setIsReviewOpen(false);
              setReviewData(null);
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
      setIsReviewOpen(true);
  };
  
  const closeModals = () => {
    setActiveSheet(null);
    setIsDialogOpen(false);
    setIsReviewOpen(false);
    setReviewData(null);
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
      <div className="flex justify-end mb-4">
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

              return (
                <TableRow key={prof.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                        <div>
                            <div className="font-medium">{prof.nome_completo}</div>
                            <div className="text-xs text-muted-foreground">{prof.nome_horario} | {prof.email || 'Sem e-mail'}</div>
                        </div>
                        {hasResponse && (
                            <Badge className="bg-blue-600 hover:bg-blue-700 animate-pulse cursor-pointer gap-1" onClick={() => openReview(prof)}>
                                <AlertCircle className="h-3 w-3" /> Resposta Disponível
                            </Badge>
                        )}
                        {isWaiting && (
                            <Badge variant="outline" className="text-[10px] text-orange-600 border-orange-200">
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
                            <TooltipContent><p>{prof.email ? "Enviar Link de Restrições" : "Cadastre o e-mail primeiro"}</p></TooltipContent>
                        </Tooltip>

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={() => openSheet(prof, 'edit')}>
                                    <Pencil className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent><p>Editar Dados</p></TooltipContent>
                        </Tooltip>

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={() => openSheet(prof, 'restricoes')}>
                                    <CalendarX className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent><p>Restrições Manuais</p></TooltipContent>
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
          <AlertDialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
              <AlertDialogHeader className="p-6 pb-2">
                  <AlertDialogTitle className="flex items-center gap-2">
                      <CheckCircle2 className="text-blue-600" /> 
                      Revisar e Ajustar Disponibilidade
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                      Confira o que o professor <strong>{selectedProfessor?.nome_completo}</strong> preencheu. <br />
                      <strong>Dica:</strong> Você pode clicar nos campos para adicionar ou remover indisponibilidades antes de salvar.
                  </AlertDialogDescription>
              </AlertDialogHeader>
              
              <ScrollArea className="flex-1 px-6">
                <div className="space-y-6 pb-6 pt-2">
                    <div className="bg-primary/5 border border-primary/20 p-4 rounded-xl flex items-start gap-3">
                        <Info className="h-5 w-5 text-primary shrink-0" />
                        <div className="space-y-1">
                            <p className="text-xs font-bold text-primary uppercase tracking-tight">Legenda de Edição:</p>
                            <div className="flex gap-4 text-[10px] text-muted-foreground">
                                <div className="flex items-center gap-1"><div className="w-3 h-3 bg-red-500 rounded-sm"/> Indisponível (Clicável)</div>
                                <div className="flex items-center gap-1"><div className="w-3 h-3 bg-blue-500 rounded-sm"/> Planejamento (Bloqueado)</div>
                                <div className="flex items-center gap-1"><div className="w-3 h-3 bg-white border rounded-sm"/> Livre (Clicável)</div>
                            </div>
                        </div>
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
                                                                        !isPlanejamento && "cursor-pointer hover:bg-slate-50",
                                                                        isIndisponivel ? "bg-red-50" : isPlanejamento ? "bg-blue-50" : ""
                                                                    )}
                                                                    onClick={() => handleReviewCellClick(turno.id, dia.id, aulaIdx)}
                                                                >
                                                                    <div className="flex items-center justify-center h-full relative">
                                                                        {isIndisponivel && <Ban className="h-5 w-5 text-red-500" />}
                                                                        {isPlanejamento && <PenSquare className="h-5 w-5 text-blue-500" />}
                                                                        {!val && <div className="h-1.5 w-1.5 rounded-full bg-slate-200" />}
                                                                        
                                                                        {!isPlanejamento && (
                                                                            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 flex items-center justify-center bg-black/5 rounded">
                                                                                <MousePointer2 className="h-3 w-3 text-slate-400" />
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
              </ScrollArea>

              <AlertDialogFooter className="p-6 border-t bg-slate-50 flex-row items-center justify-between sm:justify-between gap-4">
                  <div className="flex gap-2">
                    <Button 
                        variant="ghost" 
                        disabled={isActionPending} 
                        onClick={() => handleReviewAction(selectedProfessor!.solicitacao_pendente!.id, 'rejeitar')} 
                        className="text-destructive hover:bg-destructive/10 font-bold"
                    >
                        <XCircle className="mr-2 h-4 w-4" /> Descartar Resposta
                    </Button>
                    <AlertDialogCancel className="mt-0">Fechar sem Salvar</AlertDialogCancel>
                  </div>
                  <Button 
                    disabled={isActionPending} 
                    onClick={() => handleReviewAction(selectedProfessor!.solicitacao_pendente!.id, 'confirmar')} 
                    className="bg-blue-600 hover:bg-blue-700 font-bold px-8 shadow-lg"
                  >
                      {isActionPending ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                      Confirmar e Aplicar
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
                    onProfessorDeleted();
                    closeModals();
                }}
            />
          </>
      )}
    </TooltipProvider>
  );
}
