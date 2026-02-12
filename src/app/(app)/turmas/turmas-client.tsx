'use client';

import { useState, useMemo } from 'react';
import type { TurmaComDados, Serie, ProfessorComDados, ComponenteCurricular } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, PlusCircle, Edit, Trash2, Users, BookOpen } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getTurmas } from './actions';
import { useToast } from '@/hooks/use-toast';
import { CreateTurmaDialog } from './create-turma-dialog';
import { EnsalamentoSheet } from './ensalamento-sheet';
import { DeleteTurmaDialog } from './delete-turma-dialog';
import { CargaHorariaProfessoresSheet } from './carga-horaria-professores-sheet';

type Props = {
  initialTurmas: TurmaComDados[];
  escolaId: string;
  dependencies: {
    series: Serie[],
    professores: ProfessorComDados[],
    componentes: ComponenteCurricular[],
  };
};

type SheetType = 'ensalamento' | 'carga-prof' | null;
type DialogType = 'create-turma' | 'delete-turma' | null;

export function TurmasClient({ initialTurmas, escolaId, dependencies }: Props) {
  const [turmas, setTurmas] = useState(initialTurmas);
  const [selectedTurma, setSelectedTurma] = useState<TurmaComDados | null>(null);
  const [activeSheet, setActiveSheet] = useState<SheetType>(null);
  const [activeDialog, setActiveDialog] = useState<DialogType>(null);
  const { toast } = useToast();

  const turmasAgrupadas = useMemo(() => {
    return turmas.reduce((acc, turma) => {
        const serieId = turma.serie.id;
        if (!acc[serieId]) {
            acc[serieId] = {
                serie: turma.serie,
                turmas: [],
            };
        }
        acc[serieId].turmas.push(turma);
        return acc;
    }, {} as Record<string, { serie: TurmaComDados['serie'], turmas: TurmaComDados[] }>);
  }, [turmas]);

  const fetchAndUpdateTurmas = async () => {
    // For simplicity, we just reload the page to get all dependencies recalculated
    window.location.reload();
  };

  const handleOpenSheet = (turma: TurmaComDados, type: SheetType) => {
    setSelectedTurma(turma);
    setActiveSheet(type);
  };
  
  const handleOpenDialog = (turma: TurmaComDados | null, type: DialogType) => {
    setSelectedTurma(turma);
    setActiveDialog(type);
  };
  
  const closeModals = () => {
    setActiveSheet(null);
    setActiveDialog(null);
    setTimeout(() => setSelectedTurma(null), 300);
  };

  return (
    <>
      <div className="flex justify-end mb-4 gap-2">
        <Button variant="outline" onClick={() => setActiveSheet('carga-prof')}>
          <Users className="mr-2 h-4 w-4" />
          Carga Horária Professores
        </Button>
        <Button onClick={() => handleOpenDialog(null, 'create-turma')}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Adicionar Turma
        </Button>
      </div>

      {turmas.length === 0 ? (
        <div className="text-center text-muted-foreground p-8 border-2 border-dashed rounded-lg">
          Nenhuma turma cadastrada. Clique em "Adicionar Turma" para começar.
        </div>
      ) : (
        <div className="space-y-8">
            {Object.values(turmasAgrupadas).map(group => (
                <div key={group.serie.id}>
                    <h2 className="text-xl font-bold mb-4">{group.serie.nome}</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {group.turmas.map(turma => {
                            const totalComponentes = turma.serie.componentes.filter(c => (c.aulas_presenciais || 0) + (c.aulas_nao_presenciais || 0) > 0).length;
                            const componentesEnsalados = turma.professores.length;
                            const progresso = totalComponentes > 0 ? (componentesEnsalados / totalComponentes) * 100 : 100;
                            const isCompleto = totalComponentes === componentesEnsalados;

                            return (
                                <Card key={turma.id} className="flex flex-col">
                                    <CardHeader>
                                        <CardTitle>Turma {turma.nome}</CardTitle>
                                    </CardHeader>
                                    <CardContent className="flex-grow space-y-3">
                                        <div>
                                            <p className="text-sm font-medium text-muted-foreground">
                                                {isCompleto ? "Ensalamento completo" : `Ensalamento: ${componentesEnsalados} de ${totalComponentes} disciplinas`}
                                            </p>
                                        </div>
                                    </CardContent>
                                    <CardFooter className="flex gap-2">
                                        <Button className="flex-1" onClick={() => handleOpenSheet(turma, 'ensalamento')}>
                                            <BookOpen className="mr-2 h-4 w-4" />
                                            Ensalamento
                                        </Button>
                                        <Button variant="destructive" size="icon" onClick={() => handleOpenDialog(turma, 'delete-turma')}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </CardFooter>
                                </Card>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
      )}

      {activeDialog === 'create-turma' && (
        <CreateTurmaDialog
            isOpen={true}
            setIsOpen={(open) => { if (!open) closeModals(); }}
            escolaId={escolaId}
            series={dependencies.series}
            onTurmaCreated={fetchAndUpdateTurmas}
        />
      )}

      {selectedTurma && (
        <>
            <EnsalamentoSheet
                isOpen={activeSheet === 'ensalamento'}
                setIsOpen={(open) => { if (!open) closeModals(); }}
                turma={selectedTurma}
                dependencies={dependencies}
                onEnsalamentoUpdated={fetchAndUpdateTurmas}
            />
            <DeleteTurmaDialog
                isOpen={activeDialog === 'delete-turma'}
                setIsOpen={(open) => { if (!open) closeModals(); }}
                turma={selectedTurma}
                onTurmaDeleted={fetchAndUpdateTurmas}
            />
        </>
      )}

      <CargaHorariaProfessoresSheet
        isOpen={activeSheet === 'carga-prof'}
        setIsOpen={(open) => { if (!open) closeModals(); }}
        professores={dependencies.professores}
      />
    </>
  );
}
