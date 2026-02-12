'use client';

import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { deleteTurma } from './actions';
import type { TurmaComDados } from '@/lib/types';

type DeleteTurmaDialogProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  turma: TurmaComDados;
  onTurmaDeleted: () => void;
};

export function DeleteTurmaDialog({ isOpen, setIsOpen, turma, onTurmaDeleted }: DeleteTurmaDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    const result = await deleteTurma(turma.id);
    setLoading(false);

    if (result.error) {
      toast({ title: 'Erro ao deletar', description: result.error, variant: 'destructive' });
    } else {
      toast({ title: 'Turma Deletada', description: `A turma "${turma.serie.nome} - ${turma.nome}" foi deletada.` });
      onTurmaDeleted();
      setIsOpen(false);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Você tem certeza absoluta?</AlertDialogTitle>
          <AlertDialogDescription>
            Essa ação não pode ser desfeita. Isso irá deletar permanentemente a turma{' '}
            <span className="font-semibold text-foreground">"{turma.serie.nome} - {turma.nome}"</span> e todo seu ensalamento.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <Button variant="destructive" onClick={handleDelete} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Deletar Turma
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
