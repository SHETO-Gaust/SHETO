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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { deleteFormacao } from '@/app/(app)/formacoes/actions';
import type { Formacao } from '@/lib/types';

type DeleteFormacaoDialogProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  formacao: Formacao;
};

export function DeleteFormacaoDialog({ isOpen, setIsOpen, formacao }: DeleteFormacaoDialogProps) {
  const { toast } = useToast();
  const [confirmationText, setConfirmationText] = useState('');
  const [loading, setLoading] = useState(false);
  const isConfirmationMatch = confirmationText === 'deletar';

  const handleDelete = async () => {
    if (!isConfirmationMatch) return;
    
    setLoading(true);
    const result = await deleteFormacao(formacao.id);
    setLoading(false);

    if (result.error) {
      toast({
        title: 'Erro ao deletar',
        description: result.error,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Formação Deletada',
        description: `A formação "${formacao.name}" foi deletada com sucesso.`,
      });
      setIsOpen(false);
      setConfirmationText('');
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Você tem certeza absoluta?</AlertDialogTitle>
          <AlertDialogDescription>
            Essa ação não pode ser desfeita. Isso irá deletar permanentemente a formação{' '}
            <span className="font-semibold text-foreground">"{formacao.name}"</span> do banco de dados.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
            <Label htmlFor="confirmation">Para confirmar, digite <span className="font-bold text-foreground">deletar</span> abaixo:</Label>
            <Input 
                id="confirmation"
                value={confirmationText}
                onChange={(e) => setConfirmationText(e.target.value)}
                autoComplete='off'
            />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setConfirmationText('')}>Cancelar</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!isConfirmationMatch || loading}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Deletar Formação
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
