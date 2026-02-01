'use client';

import { useState } from 'react';
import type { Turno } from '@/lib/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Loader2, Pencil, Clock, PlusCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { updateTurnoStatus } from './actions';
import { EditTurnoSheet } from './edit-turno-sheet';
import { HorariosTurnoSheet } from './horarios-turno-sheet';

type TurnoClientProps = {
  initialTurnos: Turno[];
  escolaId: string;
};

export function TurnoClient({ initialTurnos, escolaId }: TurnoClientProps) {
  const { toast } = useToast();
  const [turnos, setTurnos] = useState(initialTurnos);
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);
  const [isHorariosSheetOpen, setIsHorariosSheetOpen] = useState(false);
  const [selectedTurno, setSelectedTurno] = useState<Turno | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const handleStatusChange = async (turno: Turno, newStatus: boolean) => {
    setTogglingId(turno.id);
    const result = await updateTurnoStatus(turno.id, newStatus);
    setTogglingId(null);
    if (result.error) {
      toast({
        title: 'Erro ao atualizar status',
        description: result.error,
        variant: 'destructive',
      });
    } else {
      setTurnos(current =>
        current.map(t => (t.id === turno.id ? { ...t, ativo: newStatus } : t))
      );
      toast({
        title: `Turno ${newStatus ? 'ativado' : 'desativado'} com sucesso!`,
      });
    }
  };

  const handleEdit = (turno: Turno | null) => {
    setSelectedTurno(turno);
    setIsEditSheetOpen(true);
  };
  
  const handleHorarios = (turno: Turno) => {
    setSelectedTurno(turno);
    setIsHorariosSheetOpen(true);
  };

  const onTurnoUpdated = (updatedTurno: Turno) => {
      const exists = turnos.some(t => t.id === updatedTurno.id);
      if (exists) {
        setTurnos(current => current.map(t => t.id === updatedTurno.id ? updatedTurno : t));
      } else {
        setTurnos(current => [...current, updatedTurno]);
      }
  };

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button onClick={() => handleEdit(null)}>
          <PlusCircle className="mr-2" />
          Adicionar Turno
        </Button>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Turno</TableHead>
              <TableHead className="w-[120px]">Status</TableHead>
              <TableHead className="w-[250px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {turnos.map(turno => (
              <TableRow key={turno.id}>
                <TableCell className="font-medium">{turno.nome}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {togglingId === turno.id ? (
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    ) : (
                        <Switch
                            checked={turno.ativo}
                            onCheckedChange={newStatus => handleStatusChange(turno, newStatus)}
                            aria-label={`Ativar ou desativar o turno ${turno.nome}`}
                        />
                    )}
                    <span className="text-muted-foreground text-sm">{turno.ativo ? 'Ativo' : 'Inativo'}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right space-x-2">
                  <Button variant="outline" size="sm" onClick={() => handleEdit(turno)}>
                    <Pencil className="mr-2" />
                    Editar
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleHorarios(turno)}>
                    <Clock className="mr-2" />
                    Horários
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <EditTurnoSheet
        isOpen={isEditSheetOpen}
        setIsOpen={setIsEditSheetOpen}
        turno={selectedTurno}
        escolaId={escolaId}
        onTurnoUpdated={onTurnoUpdated}
      />
      
      {selectedTurno && (
        <HorariosTurnoSheet
            isOpen={isHorariosSheetOpen}
            setIsOpen={setIsHorariosSheetOpen}
            turno={selectedTurno}
            onHorariosUpdated={onTurnoUpdated}
        />
      )}
    </>
  );
}
