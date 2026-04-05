
'use client';

import { useState, useTransition } from 'react';
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
import { PlusCircle, BookCopy, CalendarX, Trash2, Pencil, Mail, Loader2, CheckCircle2, XCircle, AlertCircle, Eye } from 'lucide-react';
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

type ProfessoresClientProps = {
  initialProfessores: ProfessorComDados[];
  escolaId: string;
  turnosDaEscola: Turno[];
  componentesDaEscola: ComponenteCurricular[];
};

type SheetType = 'edit' | 'disciplinas' | 'restricoes' | null;

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

  const handleReviewAction = (solicitacaoId: string, acao: 'confirmar' | 'rejeitar') => {
      startAction(async () => {
          const result = await processarRespostaRestricao(solicitacaoId, acao);
          if (result.error) {
              toast({ title: 'Erro ao processar', description: result.error, variant: 'destructive' });
          } else {
              toast({ 
                  title: acao === 'confirmar' ? 'Restrições Aplicadas!' : 'Resposta Descartada',
                  description: acao === 'confirmar' ? 'O cadastro do professor foi atualizado.' : 'A sugestão do professor foi ignorada.'
              });
              setIsReviewOpen(false);
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
      setIsReviewOpen(true);
  };
  
  const closeModals = () => {
    setActiveSheet(null);
    setIsDialogOpen(false);
    setIsReviewOpen(false);
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
                            <Badge className="bg-blue-600 hover:bg-blue-700 animate-pulse cursor-help" onClick={() => openReview(prof)}>
                                Resposta Disponível
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
          <AlertDialogContent className="sm:max-w-xl">
              <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                      <CheckCircle2 className="text-blue-600" /> 
                      Revisar Disponibilidade Enviada
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                      O professor <strong>{selectedProfessor?.nome_completo}</strong> preencheu sua grade através do link enviado. Deseja substituir as restrições atuais pelas novas?
                  </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="bg-muted/50 p-4 rounded-lg border space-y-3">
                  <p className="text-sm font-bold uppercase tracking-tight text-muted-foreground">Resumo do Preenchimento:</p>
                  <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white p-3 rounded border">
                          <p className="text-xs text-muted-foreground font-bold">Indisponíveis</p>
                          <p className="text-xl font-black">
                              {selectedProfessor?.solicitacao_pendente?.dados_temp ? 
                                Object.values(selectedProfessor.solicitacao_pendente.dados_temp).reduce((acc: number, turno: any) => 
                                    acc + Object.values(turno).reduce((acc2: number, dia: any) => 
                                        acc2 + Object.values(dia).filter(v => v === 'indisponivel').length, 0
                                    ), 0
                                ) : 0
                              }
                          </p>
                      </div>
                      <div className="bg-white p-3 rounded border">
                          <p className="text-xs text-muted-foreground font-bold">Planejamentos</p>
                          <p className="text-xl font-black">
                              {selectedProfessor?.solicitacao_pendente?.dados_temp ? 
                                Object.values(selectedProfessor.solicitacao_pendente.dados_temp).reduce((acc: number, turno: any) => 
                                    acc + Object.values(turno).reduce((acc2: number, dia: any) => 
                                        acc2 + Object.values(dia).filter(v => v === 'planejamento').length, 0
                                    ), 0
                                ) : 0
                              }
                          </p>
                      </div>
                  </div>
              </div>
              <AlertDialogFooter>
                  <Button variant="ghost" disabled={isActionPending} onClick={() => handleReviewAction(selectedProfessor!.solicitacao_pendente!.id, 'rejeitar')} className="text-destructive hover:bg-destructive/10">
                      <XCircle className="mr-2 h-4 w-4" /> Descartar Resposta
                  </Button>
                  <AlertDialogCancel>Fechar</AlertDialogCancel>
                  <Button disabled={isActionPending} onClick={() => handleReviewAction(selectedProfessor!.solicitacao_pendente!.id, 'confirmar')} className="bg-blue-600 hover:bg-blue-700">
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
