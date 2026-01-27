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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

type ForceDistributionDialogProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onConfirm: (strategy: 'new_rooms' | 'fill_existing') => void;
  existingRoomCount: number;
};

export function ForceDistributionDialog({
  isOpen,
  setIsOpen,
  onConfirm,
  existingRoomCount,
}: ForceDistributionDialogProps) {
  const [strategy, setStrategy] = useState<'new_rooms' | 'fill_existing'>('fill_existing');

  const handleConfirm = () => {
    onConfirm(strategy);
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Forçar Distribuição</DialogTitle>
          <DialogDescription>
            Escolha como deseja alocar os participantes restantes que não foram ensalados.
          </DialogDescription>
        </DialogHeader>
        
        <RadioGroup value={strategy} onValueChange={(value: any) => setStrategy(value)} className="space-y-4 py-4">
          <Label className="flex flex-col p-4 border rounded-md cursor-pointer has-[:checked]:border-primary">
            <div className="flex items-center gap-3">
              <RadioGroupItem value="fill_existing" id="fill_existing" />
              <span className="font-semibold">Distribuir nas salas existentes</span>
            </div>
            <p className="pl-7 text-sm text-muted-foreground mt-1">
              Tenta preencher salas com o mesmo critério e depois distribui o restante para preencher as vagas e/ou exceder o limite.
            </p>
          </Label>
          <Label className={`flex flex-col p-4 border rounded-md cursor-pointer has-[:checked]:border-primary`}>
             <div className="flex items-center gap-3">
              <RadioGroupItem value="new_rooms" id="new_rooms" />
              <span className="font-semibold">Criar novas salas</span>
            </div>
            <p className="pl-7 text-sm text-muted-foreground mt-1">
              Cria novas salas para alocar os participantes, respeitando o limite por sala. Pode exceder o total de salas definido inicialmente.
            </p>
          </Label>
        </RadioGroup>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm}>Confirmar Distribuição</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
