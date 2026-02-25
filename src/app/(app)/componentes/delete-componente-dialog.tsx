
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
import { deleteComponente } from './actions';
import type { ComponenteCurricular } from '@/lib/types';

type DeleteComponenteDialogProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  componente: ComponenteCurricular;
  onComponenteDeleted: () => void;
};

export function DeleteComponenteDialog({ isOpen, setIsOpen, componente, onComponenteDeleted }: DeleteComponenteDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    const result = await deleteComponente(componente.id);
    setLoading(false);

    if (result.error) {
      toast({
        title: 'Erro ao deletar',
        description: result.error,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Componente Deletado',
        description: `O componente "${componente.nome}" foi deletado com sucesso.`,
      });
      onComponenteDeleted();
      setIsOpen(false);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogContent onPointerDownOutside={(e) => e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Você tem certeza absoluta?</AlertDialogTitle>
          <AlertDialogDescription>
            Essa ação não pode ser desfeita. Isso irá deletar permanentemente o componente curricular{' '}
            <span className="font-semibold text-foreground">"{componente.nome}"</span>.
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
            Deletar Componente
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
