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
  totalRoomCount: number;
};

export function ForceDistributionDialog({
  isOpen,
  setIsOpen,
  onConfirm,
  existingRoomCount,
  totalRoomCount
}: ForceDistributionDialogProps) {
  const [strategy, setStrategy] = useState<'new_rooms' | 'fill_existing'>('fill_existing');
  const canCreateNewRooms = existingRoomCount < totalRoomCount;

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
              Preenche as vagas restantes e/ou excede o limite das salas já criadas, alocando todos os participantes.
            </p>
          </Label>
          <Label className={`flex flex-col p-4 border rounded-md ${!canCreateNewRooms ? 'cursor-not-allowed opacity-50' : 'cursor-pointer has-[:checked]:border-primary'}`}>
             <div className="flex items-center gap-3">
              <RadioGroupItem value="new_rooms" id="new_rooms" disabled={!canCreateNewRooms} />
              <span className="font-semibold">Criar novas salas</span>
            </div>
            <p className="pl-7 text-sm text-muted-foreground mt-1">
              Cria novas salas para alocar os participantes, respeitando o limite por sala.
            </p>
            {!canCreateNewRooms && <p className="pl-7 text-xs text-destructive mt-1">(O número máximo de salas definido já foi atingido.)</p>}
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
