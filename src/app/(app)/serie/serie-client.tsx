'use client';

import { useState } from 'react';
import type { SerieComDados, NivelEnsino, Turno, ComponenteCurricular } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, PlusCircle, Edit, Trash2, Copy, BookOpen, Users2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { EditSerieSheet } from './edit-serie-sheet';
import { CargaHorariaSheet } from './carga-horaria-sheet';
import { DuplicateSerieDialog } from './duplicate-serie-dialog';
import { DeleteSerieDialog } from './delete-serie-dialog';
import { getSeries } from './actions';
import { useToast } from '@/hooks/use-toast';

type SerieClientProps = {
  initialSeries: SerieComDados[];
  escolaId: string;
  dependencies: {
    niveisEnsino: NivelEnsino[],
    turnos: Turno[],
    componentes: ComponenteCurricular[],
  };
};

type SheetType = 'edit' | 'carga-horaria' | null;
type DialogType = 'duplicate' | 'delete' | null;

export function SerieClient({ initialSeries, escolaId, dependencies }: SerieClientProps) {
  const [series, setSeries] = useState(initialSeries);
  const [selectedSerie, setSelectedSerie] = useState<SerieComDados | null>(null);
  const [activeSheet, setActiveSheet] = useState<SheetType>(null);
  const [activeDialog, setActiveDialog] = useState<DialogType>(null);
  const { toast } = useToast();

  const fetchAndUpdateSeries = async () => {
    const { data, error } = await getSeries(escolaId);
    if (error) {
      toast({
        title: 'Erro ao atualizar lista',
        description: 'Não foi possível buscar as séries atualizadas.',
        variant: 'destructive',
      });
    } else if (data) {
      setSeries(data);
    }
  };

  const handleOpenSheet = (serie: SerieComDados | null, type: SheetType) => {
    setSelectedSerie(serie);
    setActiveSheet(type);
  };
  
  const handleOpenDialog = (serie: SerieComDados, type: DialogType) => {
    setSelectedSerie(serie);
    setActiveDialog(type);
  };
  
  const closeModals = () => {
    setActiveSheet(null);
    setActiveDialog(null);
    setTimeout(() => setSelectedSerie(null), 300);
  };

  return (
    <>
      <div className="flex justify-end mb-4 gap-2">
        <Button onClick={() => handleOpenSheet(null, 'edit')}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Adicionar Série
        </Button>
      </div>

      {series.length === 0 ? (
        <div className="text-center text-muted-foreground p-8 border-2 border-dashed rounded-lg">
          Nenhum modelo de série cadastrado. Clique em "Adicionar Série" para começar.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {series.map((serie) => {
            const aulasRestantes = serie.total_aulas_semanais - serie.total_aulas_distribuidas;
            const progresso = serie.total_aulas_semanais > 0 ? (serie.total_aulas_distribuidas / serie.total_aulas_semanais) * 100 : 0;
            
            return (
              <Card key={serie.id} className="flex flex-col">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle>{serie.nome}</CardTitle>
                      <CardDescription>{serie.nivel_ensino.nome} - {serie.turno.nome}</CardDescription>
                    </div>
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Abrir menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
                        <DropdownMenuItem onClick={() => handleOpenSheet(serie, 'edit')}><Edit className="mr-2 h-4 w-4" />Editar/Restringir</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleOpenSheet(serie, 'carga-horaria')}><BookOpen className="mr-2 h-4 w-4" />Carga Horária</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleOpenDialog(serie, 'duplicate')}><Copy className="mr-2 h-4 w-4" />Duplicar</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleOpenDialog(serie, 'delete')} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 h-4 w-4" />Deletar</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="flex-grow space-y-3">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-muted-foreground">Aulas distribuídas</span>
                      <span>{serie.total_aulas_distribuidas} / {serie.total_aulas_semanais}</span>
                    </div>
                    <Progress value={progresso} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={aulasRestantes === 0 ? 'secondary' : 'destructive'}>
                        {aulasRestantes > 0 ? `${aulasRestantes} aulas a distribuir` : aulasRestantes < 0 ? `${Math.abs(aulasRestantes)} aulas excedentes` : 'Carga horária completa'}
                    </Badge>
                     <Badge variant="outline" className="flex items-center gap-1">
                        <Users2 className="h-3 w-3"/>
                        {serie.turmas_count} {serie.turmas_count === 1 ? 'turma' : 'turmas'}
                     </Badge>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <EditSerieSheet
        isOpen={activeSheet === 'edit'}
        setIsOpen={(open) => { if (!open) closeModals(); else setActiveSheet('edit'); }}
        serie={selectedSerie}
        escolaId={escolaId}
        dependencies={dependencies}
        onSerieUpdated={fetchAndUpdateSeries}
      />
      
      {selectedSerie && (
        <>
          <CargaHorariaSheet
            isOpen={activeSheet === 'carga-horaria'}
            setIsOpen={(open) => { if (!open) closeModals(); else setActiveSheet('carga-horaria'); }}
            serie={selectedSerie}
            dependencies={dependencies}
            onCargaUpdated={fetchAndUpdateSeries}
          />
          <DuplicateSerieDialog
            isOpen={activeDialog === 'duplicate'}
            setIsOpen={(open) => { if (!open) closeModals(); else setActiveDialog('duplicate'); }}
            serie={selectedSerie}
            onSerieDuplicated={fetchAndUpdateSeries}
          />
          <DeleteSerieDialog
            isOpen={activeDialog === 'delete'}
            setIsOpen={(open) => { if (!open) closeModals(); else setActiveDialog('delete'); }}
            serie={selectedSerie}
            onSerieDeleted={fetchAndUpdateSeries}
          />
        </>
      )}
    </>
  );
}
