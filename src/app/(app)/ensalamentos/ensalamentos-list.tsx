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
import { MoreHorizontal, Trash2, Eye } from 'lucide-react';
import type { SavedEnsalamento } from './actions';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { deleteEnsalamento } from './actions';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

type EnsalamentosListProps = {
  initialEnsalamentos: SavedEnsalamento[];
};

export function EnsalamentosList({ initialEnsalamentos }: EnsalamentosListProps) {
    const { toast } = useToast();
    const router = useRouter();
    const [ensalamentos, setEnsalamentos] = useState(initialEnsalamentos);
    const [selectedEnsalamento, setSelectedEnsalamento] = useState<SavedEnsalamento | null>(null);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isDeleteLoading, setIsDeleteLoading] = useState(false);

    const handleDeleteClick = (ensalamento: SavedEnsalamento) => {
        setSelectedEnsalamento(ensalamento);
        setIsDeleteDialogOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!selectedEnsalamento) return;
        setIsDeleteLoading(true);
        const result = await deleteEnsalamento(selectedEnsalamento.id);
        setIsDeleteLoading(false);
        if (result.error) {
            toast({ title: 'Erro ao deletar', description: result.error, variant: 'destructive' });
        } else {
            toast({ title: 'Ensalamento Deletado!' });
            setEnsalamentos(prev => prev.filter(e => e.id !== selectedEnsalamento.id));
            setIsDeleteDialogOpen(false);
            setSelectedEnsalamento(null);
            router.refresh();
        }
    };
    
    if (ensalamentos.length === 0) {
        return <p className="text-center text-muted-foreground p-8">Nenhum ensalamento salvo ainda.</p>;
    }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome do Ensalamento</TableHead>
              <TableHead>Formação</TableHead>
              <TableHead>Data de Criação</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ensalamentos.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell>{item.formacoes?.name || 'N/A'}</TableCell>
                <TableCell>{format(new Date(item.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button aria-haspopup="true" size="icon" variant="ghost">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Ações</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Ações</DropdownMenuLabel>
                      <DropdownMenuItem disabled>
                        <Eye className="mr-2 h-4 w-4" />
                        Visualizar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDeleteClick(item)} className="text-destructive focus:text-destructive">
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
                    Essa ação não pode ser desfeita. Isso irá deletar permanentemente o ensalamento "{selectedEnsalamento?.name}".
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleConfirmDelete} disabled={isDeleteLoading} className="bg-destructive hover:bg-destructive/90">
                    {isDeleteLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Sim, deletar
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
