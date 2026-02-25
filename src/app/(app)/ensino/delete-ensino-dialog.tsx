
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
import { deleteNivelEnsino } from './actions';
import type { NivelEnsino } from '@/lib/types';

type DeleteEnsinoDialogProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  nivelEnsino: NivelEnsino;
  onNivelDeleted: () => void;
};

export function DeleteEnsinoDialog({ isOpen, setIsOpen, nivelEnsino, onNivelDeleted }: DeleteEnsinoDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    const result = await deleteNivelEnsino(nivelEnsino.id);
    setLoading(false);

    if (result.error) {
      toast({
        title: 'Erro ao deletar',
        description: result.error,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Etapa Deletada',
        description: `A etapa "${nivelEnsino.nome}" foi deletada com sucesso.`,
      });
      onNivelDeleted();
      setIsOpen(false);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogContent onPointerDownOutside={(e) => e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Você tem certeza absoluta?</AlertDialogTitle>
          <AlertDialogDescription>
            Essa ação não pode ser desfeita. Isso irá deletar permanentemente a etapa de ensino{' '}
            <span className="font-semibold text-foreground">"{nivelEnsino.nome}"</span>.
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
            Deletar Etapa
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
