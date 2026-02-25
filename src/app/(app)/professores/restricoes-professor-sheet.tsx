
'use client';

import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CalendarX, Ban, PenSquare } from 'lucide-react';
import { updateProfessorRestricoes } from './actions';
import type { ProfessorComDados } from '@/lib/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from '@/lib/utils';

type Props = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  professor: ProfessorComDados;
  onRestricoesUpdated: () => void;
};

const DIAS_SEMANA_MAP = [
  { id: 'segunda', label: 'Seg' }, { id: 'terca', label: 'Ter' },
  { id: 'quarta', label: 'Qua' }, { id: 'quinta', label: 'Qui' },
  { id: 'sexta', label: 'Sex' }, { id: 'sabado', label: 'Sáb' },
];

export function RestricoesProfessorSheet({ isOpen, setIsOpen, professor, onRestricoesUpdated }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [restricoes, setRestricoes] = useState<any>({});

  useEffect(() => {
    if (isOpen) {
      setRestricoes(professor.restricoes || {});
    }
  }, [isOpen, professor]);

  const handleCellClick = (turnoId: string, dia: string, aulaIndex: number) => {
    setRestricoes(prev => {
        const newRestricoes = JSON.parse(JSON.stringify(prev)); // Deep copy
        const currentStatus = newRestricoes[turnoId]?.[dia]?.[aulaIndex];
        
        if (!newRestricoes[turnoId]) newRestricoes[turnoId] = {};
        if (!newRestricoes[turnoId][dia]) newRestricoes[turnoId][dia] = {};

        if (currentStatus === 'indisponivel') {
            newRestricoes[turnoId][dia][aulaIndex] = 'planejamento';
        } else if (currentStatus === 'planejamento') {
            delete newRestricoes[turnoId][dia][aulaIndex];
        } else {
            newRestricoes[turnoId][dia][aulaIndex] = 'indisponivel';
        }
        return newRestricoes;
    });
  };

  const handleSave = async () => {
    setLoading(true);
    const result = await updateProfessorRestricoes(professor.id, restricoes);
    setLoading(false);

    if (result.error) {
      toast({ title: 'Erro', description: result.error, variant: 'destructive' });
      return;
    }

    toast({ title: 'Restrições Atualizadas', description: `As restrições para "${professor.nome_completo}" foram salvas.` });
    onRestricoesUpdated();
    setIsOpen(false);
  };

  const professorTurnos = professor.turnos.filter(t => t.id);

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent onPointerDownOutside={(e) => e.preventDefault()} className="sm:max-w-4xl w-full flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <CalendarX className="h-5 w-5" />
            Restrições de Horário
          </SheetTitle>
          <SheetDescription>
            Defina os horários indisponíveis e de planejamento para {professor.nome_completo}.
          </SheetDescription>
           <ul className="list-disc list-inside text-sm text-muted-foreground pt-2">
              <li><span className="font-semibold">Clique 1:</span> Marcar como Indisponível (aula não pode ser alocada).</li>
              <li><span className="font-semibold">Clique 2:</span> Marcar como Planejamento (prioridade para alocação de aulas de planejamento).</li>
              <li><span className="font-semibold">Clique 3:</span> Limpar marcação (disponível).</li>
          </ul>
        </SheetHeader>

        <div className="flex-1 space-y-4 py-6 overflow-y-auto">
            {professorTurnos.length > 0 ? (
                <Tabs defaultValue={professorTurnos[0].id} className="w-full">
                    <TabsList>
                        {professorTurnos.map(turno => (
                            <TabsTrigger key={turno.id} value={turno.id}>{turno.nome}</TabsTrigger>
                        ))}
                    </TabsList>
                    {professorTurnos.map(turno => (
                        <TabsContent key={turno.id} value={turno.id}>
                            <div className="rounded-xl border bg-card overflow-hidden mt-4">
                                <div className="overflow-x-auto">
                                <table className="w-full text-sm text-center">
                                    <thead>
                                        <tr className="bg-muted/50 border-b">
                                            <th className="p-2 font-medium border-r w-24">Aula</th>
                                            {DIAS_SEMANA_MAP.map(dia => (
                                                <th key={dia.id} className="p-2 font-medium min-w-[60px]">{dia.label}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Array.from({ length: turno.aulas_por_dia }).map((_, aulaIndex) => (
                                            <tr key={aulaIndex} className="border-b last:border-0">
                                                <td className="p-2 font-medium bg-muted/20 border-r">
                                                    <div className="font-semibold">{aulaIndex + 1}ª</div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {turno.horarios?.[aulaIndex]?.inicio || '--:--'} - {turno.horarios?.[aulaIndex]?.fim || '--:--'}
                                                    </div>
                                                </td>
                                                {DIAS_SEMANA_MAP.map(dia => {
                                                    const status = restricoes[turno.id]?.[dia.id]?.[aulaIndex];
                                                    return (
                                                        <td key={dia.id} className="p-0">
                                                            <div 
                                                                onClick={() => handleCellClick(turno.id, dia.id, aulaIndex)}
                                                                className={cn(
                                                                    "h-14 w-full flex items-center justify-center cursor-pointer transition-colors",
                                                                    status === 'indisponivel' ? 'bg-red-100 dark:bg-red-900/30' : 
                                                                    status === 'planejamento' ? 'bg-blue-100 dark:bg-blue-900/30' : 'hover:bg-accent'
                                                                )}
                                                            >
                                                                {status === 'indisponivel' && <Ban className="h-5 w-5 text-red-600" />}
                                                                {status === 'planejamento' && <PenSquare className="h-5 w-5 text-blue-600" />}
                                                            </div>
                                                        </td>
                                                    )
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                </div>
                            </div>
                        </TabsContent>
                    ))}
                </Tabs>
            ) : (
                <div className="text-center text-muted-foreground p-8">
                    Este professor não está associado a nenhum turno. Edite o professor para associá-lo a um turno primeiro.
                </div>
            )}
        </div>

        <SheetFooter className="mt-auto border-t pt-4 bg-background">
          <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={loading} className="min-w-[100px]">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
