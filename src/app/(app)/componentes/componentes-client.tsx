'use client';

import { useState, useEffect } from 'react';
import type { ComponenteCurricular } from '@/lib/types';
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
import { EditComponenteSheet } from './edit-componente-sheet';
import { DeleteComponenteDialog } from './delete-componente-dialog';

type ComponentesClientProps = {
  initialComponentes: ComponenteCurricular[];
  escolaId: string;
};

export function ComponentesClient({ initialComponentes, escolaId }: ComponentesClientProps) {
  const [mounted, setMounted] = useState(false);
  
  const [componentes, setComponentes] = useState(initialComponentes);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedComponente, setSelectedComponente] = useState<ComponenteCurricular | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleEdit = (componente: ComponenteCurricular | null) => {
    setSelectedComponente(componente);
    setIsSheetOpen(true);
  };

  const handleDelete = (componente: ComponenteCurricular) => {
    setSelectedComponente(componente);
    setIsDialogOpen(true);
  };

  const closeAllModals = () => {
    setIsSheetOpen(false);
    setIsDialogOpen(false);
    setTimeout(() => setSelectedComponente(null), 300);
  };

  const onComponenteUpdated = (updatedComponente: ComponenteCurricular) => {
    const exists = componentes.some(c => c.id === updatedComponente.id);
    if (exists) {
      setComponentes(current => current.map(c => c.id === updatedComponente.id ? updatedComponente : c));
    } else {
      setComponentes(current => [...current, updatedComponente].sort((a,b) => a.nome.localeCompare(b.nome)));
    }
  };

  const onComponenteDeleted = () => {
    if (selectedComponente) {
      setComponentes(current => current.filter(c => c.id !== selectedComponente.id));
    }
  };

  if (!mounted) return null;

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button onClick={() => handleEdit(null)}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Adicionar Componente
        </Button>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome do Componente</TableHead>
              <TableHead className="w-[150px]">Sigla</TableHead>
              <TableHead className="w-[80px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {componentes.map(componente => (
              <TableRow key={componente.id}>
                <TableCell className="font-medium">{componente.nome}</TableCell>
                <TableCell>{componente.sigla}</TableCell>
                <TableCell className="text-right">
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <span className="sr-only">Abrir menu</span>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent 
                      align="end"
                      onCloseAutoFocus={(e) => e.preventDefault()}
                    >
                      <DropdownMenuItem onClick={() => handleEdit(componente)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        <span>Editar</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleDelete(componente)}
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

      <EditComponenteSheet
        isOpen={isSheetOpen}
        setIsOpen={(open) => { if(!open) closeAllModals(); else setIsSheetOpen(true); }}
        componente={selectedComponente}
        escolaId={escolaId}
        onComponenteUpdated={onComponenteUpdated}
      />
      
      {selectedComponente && (
        <DeleteComponenteDialog
          isOpen={isDialogOpen}
          setIsOpen={(open) => { if(!open) closeAllModals(); else setIsDialogOpen(true); }}
          componente={selectedComponente}
          onComponenteDeleted={onComponenteDeleted}
        />
      )}
    </>
  );
}
