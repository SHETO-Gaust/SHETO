
'use client';

import { useState } from 'react';
import type { NivelEnsino } from '@/lib/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, PlusCircle, Pencil, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EditEnsinoSheet } from './edit-ensino-sheet';
import { DeleteEnsinoDialog } from './delete-ensino-dialog';

type EnsinoClientProps = {
  initialNiveisEnsino: NivelEnsino[];
  escolaId: string;
};

export function EnsinoClient({ initialNiveisEnsino, escolaId }: EnsinoClientProps) {
  const [niveisEnsino, setNiveisEnsino] = useState(initialNiveisEnsino);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedNivel, setSelectedNivel] = useState<NivelEnsino | null>(null);

  const handleEdit = (nivel: NivelEnsino | null) => {
    setSelectedNivel(nivel);
    setIsSheetOpen(true);
  };

  const handleDelete = (nivel: NivelEnsino) => {
    setSelectedNivel(nivel);
    setIsDialogOpen(true);
  };

  const onNivelUpdated = (updatedNivel: NivelEnsino) => {
    const exists = niveisEnsino.some(n => n.id === updatedNivel.id);
    if (exists) {
      setNiveisEnsino(current => current.map(n => n.id === updatedNivel.id ? updatedNivel : n));
    } else {
      setNiveisEnsino(current => [...current, updatedNivel].sort((a,b) => a.nome.localeCompare(b.nome)));
    }
  };

  const onNivelDeleted = () => {
    if (selectedNivel) {
      setNiveisEnsino(current => current.filter(n => n.id !== selectedNivel.id));
    }
  };

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button onClick={() => handleEdit(null)}>
          <PlusCircle className="mr-2" />
          Adicionar Etapa
        </Button>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome da Etapa</TableHead>
              <TableHead className="w-[150px]">Sigla</TableHead>
              <TableHead className="w-[80px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {niveisEnsino.map(nivel => (
              <TableRow key={nivel.id}>
                <TableCell className="font-medium">{nivel.nome}</TableCell>
                <TableCell>{nivel.sigla}</TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <span className="sr-only">Abrir menu</span>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEdit(nivel)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        <span>Editar</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleDelete(nivel)}
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
      </div>

      <EditEnsinoSheet
        isOpen={isSheetOpen}
        setIsOpen={setIsSheetOpen}
        nivelEnsino={selectedNivel}
        escolaId={escolaId}
        onNivelUpdated={onNivelUpdated}
      />
      
      {selectedNivel && (
        <DeleteEnsinoDialog
          isOpen={isDialogOpen}
          setIsOpen={setIsDialogOpen}
          nivelEnsino={selectedNivel}
          onNivelDeleted={onNivelDeleted}
        />
      )}
    </>
  );
}
