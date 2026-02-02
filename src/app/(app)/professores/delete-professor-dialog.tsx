'use client';

import { useState } from 'react';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { deleteProfessor } from './actions';
import type { ProfessorComDados } from '@/lib/types';

type DeleteProfessorDialogProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  professor: ProfessorComDados;
  onProfessorDeleted: () => void;
};

export function DeleteProfessorDialog({ isOpen, setIsOpen, professor, onProfessorDeleted }: DeleteProfessorDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    const result = await deleteProfessor(professor.id);
    setLoading(false);

    if (result.error) {
      toast({
        title: 'Erro ao deletar',
        description: result.error,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Professor Deletado',
        description: `O professor "${professor.nome_completo}" foi deletado com sucesso.`,
      });
      onProfessorDeleted();
      setIsOpen(false);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Você tem certeza absoluta?</AlertDialogTitle>
          <AlertDialogDescription>
            Essa ação não pode ser desfeita. Isso irá deletar permanentemente o professor{' '}
            <span className="font-semibold text-foreground">"{professor.nome_completo}"</span> e todas as suas informações associadas.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <Button variant="destructive" onClick={handleDelete} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Deletar Professor
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
