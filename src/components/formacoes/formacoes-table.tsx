'use client';

import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Pencil, Trash2, Copy } from 'lucide-react';
import type { Formacao } from '@/lib/types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DeleteFormacaoDialog } from './delete-formacao-dialog';
import { DuplicateFormacaoDialog } from './duplicate-formacao-dialog';
import { EditFormacaoSheet } from './edit-formacao-sheet';

type FormacoesTableProps = {
  data: Formacao[];
};

export function FormacoesTable({ data }: FormacoesTableProps) {
    const [selectedFormacao, setSelectedFormacao] = useState<Formacao | null>(null);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isDuplicateDialogOpen, setIsDuplicateDialogOpen] = useState(false);
    const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);

    const handleDeleteClick = (formacao: Formacao) => {
        setSelectedFormacao(formacao);
        setIsDeleteDialogOpen(true);
    };

    const handleDuplicateClick = (formacao: Formacao) => {
        setSelectedFormacao(formacao);
        setIsDuplicateDialogOpen(true);
    };

    const handleEditClick = (formacao: Formacao) => {
        setSelectedFormacao(formacao);
        setIsEditSheetOpen(true);
    };


    const formatDateRange = (dates: any) => {
        if (!dates || !Array.isArray(dates) || dates.length === 0) {
            return 'N/A';
        }
        const dateObjects = dates.map((d: any) => new Date(d.date)).sort((a, b) => a.getTime() - b.getTime());
        const firstDate = format(dateObjects[0], 'dd/MM/yy');
        if (dateObjects.length === 1) {
            return firstDate;
        }
        const lastDate = format(dateObjects[dateObjects.length - 1], 'dd/MM/yy');
        return `${firstDate} - ${lastDate}`;
    };

    if (data.length === 0) {
        return <p className="text-center text-muted-foreground">Nenhuma formação cadastrada ainda.</p>
    }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Modalidade</TableHead>
              <TableHead>Período</TableHead>
              <TableHead>Criado em</TableHead>
              <TableHead>
                <span className="sr-only">Ações</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((formacao) => (
              <TableRow key={formacao.id}>
                <TableCell className="font-medium">{formacao.name}</TableCell>
                <TableCell>
                  <Badge variant={formacao.modality === 'presencial' ? 'secondary' : 'default'}>
                    {formacao.modality.charAt(0).toUpperCase() + formacao.modality.slice(1)}
                  </Badge>
                </TableCell>
                <TableCell>{formatDateRange(formacao.dates)}</TableCell>
                <TableCell>
                  {format(new Date(formacao.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button aria-haspopup="true" size="icon" variant="ghost">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Toggle menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Ações</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => handleEditClick(formacao)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDuplicateClick(formacao)}>
                        <Copy className="mr-2 h-4 w-4" />
                        Duplicar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleDeleteClick(formacao)} className="text-destructive focus:text-destructive">
                        <Trash2 className="mr-2 h-4 w-4" />
                        Deletar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {selectedFormacao && (
         <DeleteFormacaoDialog 
            isOpen={isDeleteDialogOpen}
            setIsOpen={setIsDeleteDialogOpen}
            formacao={selectedFormacao}
         />
      )}
       {selectedFormacao && (
         <DuplicateFormacaoDialog 
            isOpen={isDuplicateDialogOpen}
            setIsOpen={setIsDuplicateDialogOpen}
            formacao={selectedFormacao}
         />
      )}
      {selectedFormacao && (
          <EditFormacaoSheet
            isOpen={isEditSheetOpen}
            setIsOpen={setIsEditSheetOpen}
            formacao={selectedFormacao}
          />
      )}
    </>
  );
}
