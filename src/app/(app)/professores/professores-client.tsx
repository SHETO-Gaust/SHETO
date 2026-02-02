'use client';

import { useState } from 'react';
import type { ProfessorComDados, ComponenteCurricular, Turno } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { PlusCircle, MoreHorizontal, Pencil, BookCopy, CalendarX, Trash2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EditProfessorSheet } from './edit-professor-sheet';
import { DeleteProfessorDialog } from './delete-professor-dialog';
import { DisciplinasProfessorSheet } from './disciplinas-professor-sheet';
import { RestricoesProfessorSheet } from './restricoes-professor-sheet';

type ProfessoresClientProps = {
  initialProfessores: ProfessorComDados[];
  escolaId: string;
  turnosDaEscola: Turno[];
  componentesDaEscola: ComponenteCurricular[];
};

export function ProfessoresClient({
  initialProfessores,
  escolaId,
  turnosDaEscola,
  componentesDaEscola,
}: ProfessoresClientProps) {
  const [professores, setProfessores] = useState(initialProfessores);
  const [selectedProfessor, setSelectedProfessor] = useState<ProfessorComDados | null>(null);

  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);
  const [isDisciplinasSheetOpen, setIsDisciplinasSheetOpen] = useState(false);
  const [isRestricoesSheetOpen, setIsRestricoesSheetOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const handleOpenSheet = (
    sheet: 'edit' | 'disciplinas' | 'restricoes' | 'delete',
    professor: ProfessorComDados | null
  ) => {
    setSelectedProfessor(professor);
    if (sheet === 'edit') setIsEditSheetOpen(true);
    if (sheet === 'disciplinas') setIsDisciplinasSheetOpen(true);
    if (sheet === 'restricoes') setIsRestricoesSheetOpen(true);
    if (sheet === 'delete') setIsDeleteDialogOpen(true);
  };
  
  const handleCloseModals = () => {
    setIsEditSheetOpen(false);
    setIsDisciplinasSheetOpen(false);
    setIsRestricoesSheetOpen(false);
    setIsDeleteDialogOpen(false);
  };
  
  // This function will be called by the child components to update the main list
  const refreshProfessores = async () => {
    // In a real app, you might re-fetch from the server. For now, we rely on revalidation.
    // For client-side updates without full re-fetch, we'd need more complex state management.
  };

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button onClick={() => handleOpenSheet('edit', null)}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Adicionar Professor
        </Button>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome Completo</TableHead>
              <TableHead>Nome (Horário)</TableHead>
              <TableHead>Turnos</TableHead>
              <TableHead>Disciplinas</TableHead>
              <TableHead className="w-[80px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {professores.map(prof => (
              <TableRow key={prof.id}>
                <TableCell className="font-medium">{prof.nome_completo}</TableCell>
                <TableCell>{prof.nome_horario}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {prof.turnos.map(t => <Badge key={t.id} variant="secondary">{t.nome}</Badge>)}
                  </div>
                </TableCell>
                <TableCell className="max-w-xs">
                  <div className="flex flex-wrap gap-1">
                     {prof.componentes.length > 0 ? (
                        prof.componentes.map(c => <Badge key={c.id} variant="outline">{c.sigla}</Badge>)
                     ) : (
                        <span className="text-xs text-muted-foreground">Nenhuma</span>
                     )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <span className="sr-only">Abrir menu</span>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
                       <DropdownMenuItem onClick={() => handleOpenSheet('edit', prof)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        <span>Editar</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleOpenSheet('disciplinas', prof)}>
                        <BookCopy className="mr-2 h-4 w-4" />
                        <span>Disciplinas</span>
                      </DropdownMenuItem>
                       <DropdownMenuItem onClick={() => handleOpenSheet('restricoes', prof)}>
                        <CalendarX className="mr-2 h-4 w-4" />
                        <span>Restrições</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleOpenSheet('delete', prof)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        <span>Deletar</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {professores.length === 0 && (
            <div className="text-center p-8 text-muted-foreground">
                Nenhum professor cadastrado.
            </div>
        )}
      </div>

      <EditProfessorSheet
        isOpen={isEditSheetOpen}
        setIsOpen={setIsEditSheetOpen}
        professor={selectedProfessor}
        escolaId={escolaId}
        turnosDaEscola={turnosDaEscola}
        onProfessorUpdated={refreshProfessores}
      />
      
      {selectedProfessor && (
        <DisciplinasProfessorSheet
            isOpen={isDisciplinasSheetOpen}
            setIsOpen={setIsDisciplinasSheetOpen}
            professor={selectedProfessor}
            componentesDaEscola={componentesDaEscola}
            onDisciplinasUpdated={refreshProfessores}
        />
      )}

      {selectedProfessor && (
        <RestricoesProfessorSheet
            isOpen={isRestricoesSheetOpen}
            setIsOpen={setIsRestricoesSheetOpen}
            professor={selectedProfessor}
            onRestricoesUpdated={refreshProfessores}
        />
      )}
      
      {selectedProfessor && (
        <DeleteProfessorDialog
            isOpen={isDeleteDialogOpen}
            setIsOpen={setIsDeleteDialogOpen}
            professor={selectedProfessor}
            onProfessorDeleted={refreshProfessores}
        />
      )}
    </>
  );
}
