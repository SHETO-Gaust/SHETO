'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { EnsalamentoResult } from '@/lib/types';
import { saveEnsalamento } from './actions';
import { useRouter } from 'next/navigation';

type SaveEnsalamentoDialogProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  result: EnsalamentoResult;
  formacaoId: string;
};

export function SaveEnsalamentoDialog({ isOpen, setIsOpen, result, formacaoId }: SaveEnsalamentoDialogProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
        toast({ title: 'O nome é obrigatório.', variant: 'destructive' });
        return;
    }
    setLoading(true);
    const saveResult = await saveEnsalamento(name, result, formacaoId);
    setLoading(false);

    if (saveResult.error) {
      toast({
        title: 'Erro ao Salvar',
        description: saveResult.error,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Ensalamento Salvo!',
        description: `O ensalamento "${name}" foi salvo com sucesso.`,
      });
      setName('');
      setIsOpen(false);
      router.refresh(); // To show the new item in the list
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Salvar Ensalamento</DialogTitle>
          <DialogDescription>
            Dê um nome para este ensalamento para que você possa consultá-lo mais tarde.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-4">
            <Label htmlFor="ensalamento-name">Nome do Ensalamento</Label>
            <Input 
                id="ensalamento-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder='Ex: Ensalamento PROFE 2024 - Turma A'
            />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading || !name.trim()}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
