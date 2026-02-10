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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { duplicateSerie } from './actions';
import type { SerieComDados, Turno } from '@/lib/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type DuplicateSerieDialogProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  serie: SerieComDados;
  onSerieDuplicated: () => void;
  turnos: Turno[];
};

export function DuplicateSerieDialog({ isOpen, setIsOpen, serie, onSerieDuplicated, turnos }: DuplicateSerieDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState(`${serie.nome} (Cópia)`);
  const [selectedTurnoId, setSelectedTurnoId] = useState<string>(serie.turno_id);

  const handleDuplicate = async () => {
    if (!newName.trim()) {
        toast({ title: "O nome da nova série é obrigatório.", variant: "destructive" });
        return;
    }
     if (!selectedTurnoId) {
        toast({ title: "O turno é obrigatório.", variant: "destructive" });
        return;
    }
    setLoading(true);
    const result = await duplicateSerie(serie.id, newName, selectedTurnoId);
    setLoading(false);

    if (result.error) {
      toast({ title: 'Erro ao duplicar', description: result.error, variant: 'destructive' });
    } else {
      toast({ title: 'Série Duplicada!', description: `A série "${newName}" foi criada com sucesso.` });
      onSerieDuplicated();
      setIsOpen(false);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Duplicar Série "{serie.nome}"</AlertDialogTitle>
          <AlertDialogDescription>
            Isso criará uma nova série com a mesma carga horária e restrições. Insira o nome e selecione o turno para a nova série.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-4 space-y-4">
            <div>
                <Label htmlFor="new-name">Nome da Nova Série</Label>
                <Input id="new-name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            <div>
                <Label htmlFor="new-turno">Turno</Label>
                 <Select value={selectedTurnoId} onValueChange={setSelectedTurnoId}>
                    <SelectTrigger id="new-turno">
                        <SelectValue placeholder="Selecione um turno" />
                    </SelectTrigger>
                    <SelectContent>
                        {turnos.map(turno => (
                            <SelectItem key={turno.id} value={turno.id}>{turno.nome}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <Button onClick={handleDuplicate} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Duplicar Série
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
