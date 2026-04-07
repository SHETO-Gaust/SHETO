
'use client';

import { useState, useEffect } from 'react';
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Loader2,
  Pencil,
  Clock,
  PlusCircle,
  MoreHorizontal,
  Trash2,
  Coffee,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { updateTurnoStatus } from './actions';
import { EditTurnoSheet } from './edit-turno-sheet';
import { HorariosTurnoSheet } from './horarios-turno-sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DeleteTurnoDialog } from './delete-turno-dialog';
import { cn } from '@/lib/utils';

type TurnoClientProps = {
  initialTurnos: Turno[];
  escolaId: string;
};

const defaultTurnosNomes = ['Matutino', 'Vespertino', 'Noturno'];

export function TurnoClient({ initialTurnos, escolaId }: TurnoClientProps) {
  const { toast } = useToast();

  const [mounted, setMounted] = useState(false);

  const [turnos, setTurnos] = useState(initialTurnos);
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);
  const [isHorariosSheetOpen, setIsHorariosSheetOpen] = useState(false);
  const [selectedTurno, setSelectedTurno] = useState<Turno | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const turnosAtivos = turnos.filter(t => t.ativo);

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

  const handleDelete = (turno: Turno) => {
    setSelectedTurno(turno);
    setIsDeleteDialogOpen(true);
  };

  const closeAllModals = () => {
    setIsEditSheetOpen(false);
    setIsHorariosSheetOpen(false);
    setIsDeleteDialogOpen(false);
    setTimeout(() => setSelectedTurno(null), 300);
  };

  const onTurnoUpdated = (updatedTurno: Turno) => {
    const exists = turnos.some(t => t.id === updatedTurno.id);
    if (exists) {
      setTurnos(current =>
        current.map(t => (t.id === updatedTurno.id ? updatedTurno : t))
      );
    } else {
      setTurnos(current =>
        [...current, updatedTurno].sort((a, b) => a.nome.localeCompare(b.nome))
      );
    }
  };

  const onTurnoDeleted = () => {
    if (selectedTurno) {
      setTurnos(current => current.filter(t => t.id !== selectedTurno.id));
    }
  };

  if (!mounted) return null;

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button onClick={() => handleEdit(null)}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Adicionar Turno
        </Button>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Turno</TableHead>
              <TableHead className="w-[120px]">Status</TableHead>
              <TableHead className="w-[80px] text-right">Ações</TableHead>
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
                        onCheckedChange={newStatus =>
                          handleStatusChange(turno, newStatus)
                        }
                        aria-label={`Ativar ou desativar o turno ${turno.nome}`}
                      />
                    )}
                    <span className="text-muted-foreground text-sm">
                      {turno.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <span className="sr-only">Abrir menu</span>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      onCloseAutoFocus={e => e.preventDefault()}
                    >
                      <DropdownMenuLabel>Ações</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => handleEdit(turno)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        <span>Editar</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleHorarios(turno)}>
                        <Clock className="mr-2 h-4 w-4" />
                        <span>Horários</span>
                      </DropdownMenuItem>
                      {!defaultTurnosNomes.includes(turno.nome) && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleDelete(turno)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            <span>Deletar</span>
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="mt-12">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Configuração da Grade Horária
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {turnosAtivos.length > 0 ? (
            turnosAtivos.map(turno => (
              <Card key={`horario-${turno.id}`} className="overflow-hidden border-2 shadow-md">
                <CardHeader className="bg-primary/5 border-b">
                  <CardTitle className="text-lg">{turno.nome}</CardTitle>
                  <CardDescription className="text-[10px] uppercase font-bold tracking-tighter">
                    {turno.aulas_por_dia} aulas diárias • {turno.dias_semana.join(', ')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {turno.horarios && turno.horarios.length > 0 ? (
                    <div className="divide-y">
                        {turno.horarios.slice(0, turno.aulas_por_dia).map((horario, index) => (
                            <div key={horario.id}>
                                <div className="flex items-center justify-between p-3 px-4 hover:bg-muted/30 transition-colors">
                                    <span className="font-bold text-xs text-primary">{index + 1}ª Aula</span>
                                    <span className="text-xs font-semibold">
                                        {horario.inicio || '--:--'} - {horario.fim || '--:--'}
                                    </span>
                                </div>
                                {horario.tem_intervalo_depois && index < turno.aulas_por_dia - 1 && (
                                    <div className="bg-orange-50/80 p-2 flex items-center justify-center gap-2 border-y border-orange-100">
                                        <Coffee className="h-3 w-3 text-orange-500" />
                                        <span className="text-[9px] font-black uppercase text-orange-700 tracking-widest">
                                            Intervalo: {horario.fim} - {turno.horarios[index+1]?.inicio}
                                        </span>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center p-8 text-center gap-2 opacity-40">
                        <Clock className="h-8 w-8" />
                        <p className="text-xs font-bold uppercase">Sem horários definidos</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          ) : (
            <div className="col-span-full p-12 text-center border-2 border-dashed rounded-2xl bg-muted/5">
                <p className="text-muted-foreground font-medium">Ative os turnos para configurar e visualizar a grade horária.</p>
            </div>
          )}
        </div>
      </div>

      <EditTurnoSheet
        isOpen={isEditSheetOpen}
        setIsOpen={open => {
          if (!open) closeAllModals();
          else setIsEditSheetOpen(true);
        }}
        turno={selectedTurno}
        escolaId={escolaId}
        onTurnoUpdated={onTurnoUpdated}
      />

      {selectedTurno && (
        <HorariosTurnoSheet
          isOpen={isHorariosSheetOpen}
          setIsOpen={open => {
            if (!open) closeAllModals();
            else setIsHorariosSheetOpen(true);
          }}
          turno={selectedTurno}
          onHorariosUpdated={onTurnoUpdated}
        />
      )}

      {selectedTurno && (
        <DeleteTurnoDialog
          isOpen={isDeleteDialogOpen}
          setIsOpen={open => {
            if (!open) closeAllModals();
            else setIsDeleteDialogOpen(true);
          }}
          turno={selectedTurno}
          onTurnoDeleted={onTurnoDeleted}
        />
      )}
    </>
  );
}
