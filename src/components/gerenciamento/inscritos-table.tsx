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
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Pencil, Trash2, Eye } from 'lucide-react';
import type { Formacao, Inscricao } from '@/lib/types';
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
import { 
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { deleteInscricao } from '@/app/(app)/gerenciamento/actions';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { EditInscricaoSheet } from './edit-inscricao-sheet';
import { DetailsInscricaoDialog } from './details-inscricao-dialog';

type InscritosTableProps = {
  data: Inscricao[];
  formacao: Formacao;
};

export function InscritosTable({ data, formacao }: InscritosTableProps) {
    const { toast } = useToast();
    const [selectedInscricao, setSelectedInscricao] = useState<Inscricao | null>(null);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isDeleteLoading, setIsDeleteLoading] = useState(false);
    const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);
    const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);

    const handleDeleteClick = (inscricao: Inscricao) => {
        setSelectedInscricao(inscricao);
        setIsDeleteDialogOpen(true);
    };

    const handleEditClick = (inscricao: Inscricao) => {
        setSelectedInscricao(inscricao);
        setIsEditSheetOpen(true);
    };

    const handleDetailsClick = (inscricao: Inscricao) => {
        setSelectedInscricao(inscricao);
        setIsDetailsDialogOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!selectedInscricao) return;

        setIsDeleteLoading(true);
        const result = await deleteInscricao(selectedInscricao.id);
        setIsDeleteLoading(false);

        if (result.error) {
            toast({
                title: 'Erro ao deletar',
                description: result.error,
                variant: 'destructive',
            });
        } else {
            toast({
                title: 'Inscrição Removida',
                description: 'A inscrição foi removida com sucesso.',
            });
            setIsDeleteDialogOpen(false);
            setSelectedInscricao(null);
        }
    }

    if (data.length === 0) {
        return <p className="text-center text-muted-foreground p-8">Nenhum participante inscrito ainda.</p>
    }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome Completo</TableHead>
              <TableHead>CPF</TableHead>
              <TableHead>Regional</TableHead>
              <TableHead>Data da Inscrição</TableHead>
              <TableHead>
                <span className="sr-only">Ações</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((inscricao) => (
              <TableRow key={inscricao.id}>
                <TableCell className="font-medium">{inscricao.nome_completo}</TableCell>
                <TableCell>{inscricao.cpf}</TableCell>
                <TableCell>{inscricao.dados?.regional || 'N/A'}</TableCell>
                <TableCell>
                  {inscricao.created_at ? format(new Date(inscricao.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : 'N/A'}
                </TableCell>
                <TableCell className="flex items-center justify-end gap-2">
                   <Button variant="outline" size="sm" onClick={() => handleDetailsClick(inscricao)}>
                        <Eye className="mr-2 h-4 w-4" />
                        Detalhes
                   </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button aria-haspopup="true" size="icon" variant="ghost">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Toggle menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Ações</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => handleEditClick(inscricao)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleDeleteClick(inscricao)} className="text-destructive focus:text-destructive">
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

       <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Essa ação não pode ser desfeita. Isso irá deletar permanentemente a inscrição de <span className="font-semibold text-foreground">{selectedInscricao?.nome_completo}</span>.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={handleConfirmDelete}
                        disabled={isDeleteLoading}
                        className="bg-destructive hover:bg-destructive/90"
                    >
                        {isDeleteLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Sim, deletar inscrição
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        {selectedInscricao && (
            <EditInscricaoSheet 
                isOpen={isEditSheetOpen}
                setIsOpen={setIsEditSheetOpen}
                inscricao={selectedInscricao}
                formacao={formacao}
            />
        )}
        
        {selectedInscricao && (
            <DetailsInscricaoDialog
                isOpen={isDetailsDialogOpen}
                setIsOpen={setIsDetailsDialogOpen}
                inscricao={selectedInscricao}
            />
        )}
    </>
  );
}
