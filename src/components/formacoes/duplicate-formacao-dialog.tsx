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
import { duplicateFormacao } from '@/app/(app)/formacoes/actions';
import type { Formacao } from '@/lib/types';

type DuplicateFormacaoDialogProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  formacao: Formacao;
};

export function DuplicateFormacaoDialog({ isOpen, setIsOpen, formacao }: DuplicateFormacaoDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleDuplicate = async () => {
    setLoading(true);
    const result = await duplicateFormacao(formacao.id);
    setLoading(false);

    if (result.error) {
      toast({
        title: 'Erro ao duplicar',
        description: result.error,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Formação Duplicada',
        description: `A formação "${formacao.name}" foi duplicada com sucesso.`,
      });
      setIsOpen(false);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Duplicar Formação</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja criar uma cópia da formação <span className="font-semibold text-foreground">"{formacao.name}"</span>? As configurações de inscrição e frequência serão copiadas, mas os inscritos não.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <Button
            onClick={handleDuplicate}
            disabled={loading}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Sim, Duplicar
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
