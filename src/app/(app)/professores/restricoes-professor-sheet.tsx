'use client';

import { useEffect, useState, useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CalendarX, Ban, PenSquare, Star } from 'lucide-react';
import { updateProfessorRestricoes } from './actions';
import type { ProfessorComDados, Turno, LivreDocenciaItem, LivreDocenciaPeriodo } from '@/lib/types';
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

function getPeriodoDaAula(turno: Turno, aulaIdx: number): LivreDocenciaPeriodo {
    const nome = turno.nome.toLowerCase();
    if (nome.includes('matutino')) return 'matutino';
    if (nome.includes('vespertino')) return 'vespertino';
    if (nome.includes('noturno')) return 'noturno';
    
    const h = turno.horarios?.[aulaIdx];
    if (h?.inicio) {
        const hora = parseInt(h.inicio.split(':')[0]);
        if (hora < 13) return 'matutino';
        if (hora < 18) return 'vespertino';
        return 'noturno';
    }
    
    return aulaIdx < 5 ? 'matutino' : 'vespertino';
}

export function RestricoesProfessorSheet({ isOpen, setIsOpen, professor, onRestricoesUpdated }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [restricoes, setRestricoes] = useState<any>({});
  const [livreDocencia, setLivreDocencia] = useState<LivreDocenciaItem[]>([]);

  useEffect(() => {
    if (isOpen) {
      setRestricoes(professor.restricoes || {});
      setLivreDocencia(professor.livre_docencia || []);
    }
  }, [isOpen, professor]);

  const handleCellClick = (turno: Turno, diaId: string, aulaIndex: number) => {
    const currentPeriodo = getPeriodoDaAula(turno, aulaIndex);
    const isStar = livreDocencia.some(ld => ld.dia === diaId && ld.periodo === currentPeriodo);
    const currentStatus = restricoes[turno.id]?.[diaId]?.[aulaIndex];

    // Lógica de ciclo: Nada -> Indisponível -> Planejamento -> Livre Docência -> Nada
    if (isStar) {
        // Estava Star -> Limpar Star e voltar para Nada
        setLivreDocencia(prev => prev.filter(ld => !(ld.dia === diaId && ld.periodo === currentPeriodo)));
        return;
    }

    if (currentStatus === 'indisponivel') {
        // Indisponível -> Planejamento
        setRestricoes((prev: any) => {
            const next = JSON.parse(JSON.stringify(prev));
            if (!next[turno.id]) next[turno.id] = {};
            if (!next[turno.id][diaId]) next[turno.id][diaId] = {};
            next[turno.id][diaId][aulaIndex] = 'planejamento';
            return next;
        });
    } else if (currentStatus === 'planejamento') {
        // Planejamento -> Livre Docência (Star)
        if (livreDocencia.length >= 2) {
            toast({ title: 'Limite de Livre Docência', description: 'O professor já possui os 2 períodos permitidos.', variant: 'destructive' });
            // Pula para Nada
            setRestricoes((prev: any) => {
                const next = JSON.parse(JSON.stringify(prev));
                if (next[turno.id]?.[diaId]) delete next[turno.id][diaId][aulaIndex];
                return next;
            });
        } else {
            // Limpa o planejamento e adiciona Livre Docência
            setRestricoes((prev: any) => {
                const next = JSON.parse(JSON.stringify(prev));
                if (next[turno.id]?.[diaId]) delete next[turno.id][diaId][aulaIndex];
                return next;
            });
            setLivreDocencia(prev => [...prev, { dia: diaId, periodo: currentPeriodo }]);
        }
    } else {
        // Nada -> Indisponível
        setRestricoes((prev: any) => {
            const next = JSON.parse(JSON.stringify(prev));
            if (!next[turno.id]) next[turno.id] = {};
            if (!next[turno.id][diaId]) next[turno.id][diaId] = {};
            next[turno.id][diaId][aulaIndex] = 'indisponivel';
            return next;
        });
    }
  };

  const handleSave = async () => {
    setLoading(true);
    const result = await updateProfessorRestricoes(professor.id, restricoes, livreDocencia);
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
            Defina os horários indisponíveis, de planejamento e livre docência para {professor.nome_completo}.
          </SheetDescription>
           <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground pt-2">
              <li className="flex items-center gap-1"><Ban className="h-3 w-3 text-red-500"/> <strong>Clique 1:</strong> Indisponível (bloqueado).</li>
              <li className="flex items-center gap-1"><PenSquare className="h-3 w-3 text-blue-500"/> <strong>Clique 2:</strong> Planejamento (prioritário).</li>
              <li className="flex items-center gap-1"><Star className="h-3 w-3 text-amber-500 fill-amber-500"/> <strong>Clique 3:</strong> Livre Docência (Folga de período).</li>
              <li><strong>Clique 4:</strong> Limpar marcação.</li>
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
                                                    <div className="text-[10px] text-muted-foreground">
                                                        {turno.horarios?.[aulaIndex]?.inicio || '--:--'}
                                                    </div>
                                                </td>
                                                {DIAS_SEMANA_MAP.map(dia => {
                                                    const currentPeriodo = getPeriodoDaAula(turno, aulaIndex);
                                                    const isStar = livreDocencia.some(ld => ld.dia === dia.id && ld.periodo === currentPeriodo);
                                                    const status = restricoes[turno.id]?.[dia.id]?.[aulaIndex];
                                                    
                                                    return (
                                                        <td key={dia.id} className="p-0 border-r last:border-r-0">
                                                            <div 
                                                                onClick={() => handleCellClick(turno, dia.id, aulaIndex)}
                                                                className={cn(
                                                                    "h-14 w-full flex flex-col items-center justify-center cursor-pointer transition-colors",
                                                                    isStar ? 'bg-amber-50 text-amber-600' :
                                                                    status === 'indisponivel' ? 'bg-red-50 text-red-600' : 
                                                                    status === 'planejamento' ? 'bg-blue-50 text-blue-600' : 'hover:bg-accent'
                                                                )}
                                                            >
                                                                {isStar ? (
                                                                    <>
                                                                        <Star className="h-5 w-5 fill-amber-500" />
                                                                        <span className="text-[8px] font-bold uppercase">Livre Doc.</span>
                                                                    </>
                                                                ) : status === 'indisponivel' ? (
                                                                    <Ban className="h-5 w-5" />
                                                                ) : status === 'planejamento' ? (
                                                                    <PenSquare className="h-5 w-5" />
                                                                ) : (
                                                                    <div className="h-1.5 w-1.5 rounded-full bg-muted" />
                                                                )}
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
                <div className="text-center text-muted-foreground p-8 border-2 border-dashed rounded-xl">
                    Este professor não está associado a nenhum turno ativo.
                </div>
            )}
        </div>

        <SheetFooter className="mt-auto border-t pt-4 bg-background">
          <div className="flex items-center gap-4 mr-auto text-[10px] uppercase font-bold text-muted-foreground">
              <span className="flex items-center gap-1"><Star className="h-3 w-3 text-amber-500 fill-amber-500" /> Livre Docência: {livreDocencia.length}/2</span>
          </div>
          <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={loading} className="min-w-[100px]">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
