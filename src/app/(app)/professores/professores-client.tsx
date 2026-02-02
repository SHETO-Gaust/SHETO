'use client';

import { useState } from 'react';
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
import { PlusCircle, BookCopy, CalendarX, Trash2, Pencil } from 'lucide-react';
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
import { getProfessores } from './actions';
import { useToast } from '@/hooks/use-toast';

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
  const { toast } = useToast();

  const fetchAndUpdateProfessores = async () => {
    const { data, error } = await getProfessores(escolaId);
    if (error) {
      toast({
        title: 'Erro ao atualizar lista',
        description: 'Não foi possível buscar os professores atualizados.',
        variant: 'destructive',
      });
    } else if (data) {
      setProfessores(data);
    }
  };

  const openSheet = (professor: ProfessorComDados | null, type: SheetType) => {
    setSelectedProfessor(professor);
    setActiveSheet(type);
  };
  
  const openDialog = (professor: ProfessorComDados) => {
    setSelectedProfessor(professor);
    setIsDialogOpen(true);
  };
  
  const closeModals = () => {
    setActiveSheet(null);
    setIsDialogOpen(false);
    setTimeout(() => {
        setSelectedProfessor(null);
    }, 300);
  };
  
  const onProfessorDeleted = () => {
    if (selectedProfessor) {
      setProfessores(current => current.filter(p => p.id !== selectedProfessor.id));
    }
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
              <TableHead className="w-[200px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {professores.map((prof) => (
              <TableRow key={prof.id}>
                <TableCell>
                  <div className="font-medium">{prof.nome_completo}</div>
                  <div className="text-sm text-muted-foreground">{prof.nome_horario}</div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {prof.componentes.length > 0 ? (
                      prof.componentes.map(c => <Badge key={c.id} variant="secondary">{c.sigla}</Badge>)
                    ) : (
                      <span className="text-xs text-muted-foreground">Nenhuma</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                   <div className="flex flex-wrap gap-1">
                     {prof.turnos.length > 0 ? (
                       prof.turnos.map(t => <Badge key={t.id} variant="outline">{t.nome}</Badge>)
                     ) : (
                       <span className="text-xs text-muted-foreground">Nenhum</span>
                     )}
                   </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                      <Tooltip>
                          <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={() => openSheet(prof, 'edit')}>
                                  <Pencil className="h-4 w-4" />
                                  <span className="sr-only">Editar Dados</span>
                              </Button>
                          </TooltipTrigger>
                          <TooltipContent><p>Editar Dados</p></TooltipContent>
                      </Tooltip>
                      <Tooltip>
                          <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={() => openSheet(prof, 'disciplinas')}>
                                  <BookCopy className="h-4 w-4" />
                                  <span className="sr-only">Gerenciar Disciplinas</span>
                              </Button>
                          </TooltipTrigger>
                          <TooltipContent><p>Gerenciar Disciplinas</p></TooltipContent>
                      </Tooltip>
                      <Tooltip>
                          <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={() => openSheet(prof, 'restricoes')}>
                                  <CalendarX className="h-4 w-4" />
                                  <span className="sr-only">Restrições de Horário</span>
                              </Button>
                          </TooltipTrigger>
                          <TooltipContent><p>Restrições de Horário</p></TooltipContent>
                      </Tooltip>
                      <Tooltip>
                          <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => openDialog(prof)}>
                                  <Trash2 className="h-4 w-4" />
                                  <span className="sr-only">Deletar</span>
                              </Button>
                          </TooltipTrigger>
                          <TooltipContent><p>Deletar Professor</p></TooltipContent>
                      </Tooltip>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
            <Pencil className="h-4 w-4" />
            <span>Editar Dados</span>
        </div>
        <div className="flex items-center gap-2">
            <BookCopy className="h-4 w-4" />
            <span>Gerenciar Disciplinas</span>
        </div>
        <div className="flex items-center gap-2">
            <CalendarX className="h-4 w-4" />
            <span>Restrições de Horário</span>
        </div>
        <div className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-destructive" />
            <span className="text-destructive">Deletar Professor</span>
        </div>
      </div>
      
      <EditProfessorSheet
          isOpen={isSheetOpenFor('edit')}
          setIsOpen={setSheetOpenFor('edit')}
          professor={selectedProfessor}
          escolaId={escolaId}
          turnosDaEscola={turnosDaEscola}
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
