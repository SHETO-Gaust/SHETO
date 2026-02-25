
'use client';

import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
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
import { deleteTurno } from './actions';
import type { Turno } from '@/lib/types';

type DeleteTurnoDialogProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  turno: Turno;
  onTurnoDeleted: () => void;
};

export function DeleteTurnoDialog({ isOpen, setIsOpen, turno, onTurnoDeleted }: DeleteTurnoDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    const result = await deleteTurno(turno.id);
    setLoading(false);

    if (result.error) {
      toast({
        title: 'Erro ao deletar',
        description: result.error,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Turno Deletado',
        description: `O turno "${turno.nome}" foi deletado com sucesso.`,
      });
      onTurnoDeleted();
      setIsOpen(false);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogContent onPointerDownOutside={(e) => e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Você tem certeza absoluta?</AlertDialogTitle>
          <AlertDialogDescription>
            Essa ação não pode ser desfeita. Isso irá deletar permanentemente o turno{' '}
            <span className="font-semibold text-foreground">"{turno.nome}"</span>.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={loading}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Deletar Turno
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
