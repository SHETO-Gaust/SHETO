'use client';

import { useEffect, useState, useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
<<<<<<< HEAD
import { Loader2, CalendarX, Ban, PenSquare, Star } from 'lucide-react';
=======
import { Loader2, CalendarX, Ban, PenSquare, Star, CalendarDays } from 'lucide-react';
>>>>>>> 3bc12c2 (teste)
import { updateProfessorRestricoes } from './actions';
import type { ProfessorComDados, Turno, LivreDocenciaItem, LivreDocenciaPeriodo } from '@/lib/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

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
  const [semPreferencia, setSemPreferencia] = useState(false);
<<<<<<< HEAD
=======
  const [diasPreferidos, setDiasPreferidos] = useState<string[]>([]);
>>>>>>> 3bc12c2 (teste)

  useEffect(() => {
    if (isOpen) {
      setRestricoes(professor.restricoes || {});
      setLivreDocencia(professor.livre_docencia || []);
      setSemPreferencia(!!professor.sem_preferencia_livre_docencia);
<<<<<<< HEAD
=======
      setDiasPreferidos(professor.dias_preferidos || []);
>>>>>>> 3bc12c2 (teste)
    }
  }, [isOpen, professor]);

  const handleCellClick = (turno: Turno, diaId: string, aulaIndex: number) => {
    const currentPeriodo = getPeriodoDaAula(turno, aulaIndex);
    const isStar = livreDocencia.some(ld => ld.dia === diaId && ld.periodo === currentPeriodo);
    const currentStatus = restricoes[turno.id]?.[diaId]?.[aulaIndex];

    // Lógica de ciclo: Nada -> Indisponível -> Planejamento -> Livre Docência (se !semPreferencia) -> Nada
    
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
        // Planejamento -> Livre Docência (Star) OU Nada
        if (semPreferencia) {
            // Se sem preferência, pula direto para Nada
            setRestricoes((prev: any) => {
                const next = JSON.parse(JSON.stringify(prev));
                if (next[turno.id]?.[diaId]) delete next[turno.id][diaId][aulaIndex];
                return next;
            });
        } else {
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

  const handleToggleSemPreferencia = (checked: boolean) => {
      setSemPreferencia(checked);
      if (checked) {
          setLivreDocencia([]); // Limpa as seleções manuais se marcar sem preferência
      }
  };

  const handleSave = async () => {
    setLoading(true);
<<<<<<< HEAD
    const result = await updateProfessorRestricoes(professor.id, restricoes, livreDocencia, semPreferencia);
=======
    const result = await updateProfessorRestricoes(professor.id, restricoes, livreDocencia, semPreferencia, diasPreferidos);
>>>>>>> 3bc12c2 (teste)
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
      <SheetContent onPointerDownOutside={(e) => e.preventDefault()} className="sm:max-w-4xl w-full flex flex-col h-full overflow-hidden">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-xl">
            <CalendarX className="h-6 w-6 text-primary" />
            Restrições de Horário: {professor.nome_horario}
          </SheetTitle>
          <SheetDescription>
            Defina os horários indisponíveis, de planejamento e livre docência para este docente.
          </SheetDescription>
           <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-muted-foreground pt-3 bg-muted/30 p-3 rounded-lg border border-dashed">
              <li className="flex items-center gap-1.5"><Ban className="h-3.5 w-3.5 text-red-500"/> <strong>Clique 1:</strong> Indisponível (bloqueado).</li>
              <li className="flex items-center gap-1.5"><PenSquare className="h-3.5 w-3.5 text-blue-500"/> <strong>Clique 2:</strong> Planejamento (prioritário).</li>
              <li className="flex items-center gap-1.5"><Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500"/> <strong>Clique 3:</strong> Livre Docência (Folga de período).</li>
              <li className="opacity-70"><strong>Clique 4:</strong> Limpar marcação.</li>
          </ul>
        </SheetHeader>

        <div className="flex-1 space-y-4 py-6 overflow-y-auto min-h-0">
<<<<<<< HEAD
=======

            {/* Dias Preferidos para Concentração */}
            <div className="rounded-xl border border-violet-200/60 bg-violet-50/40 p-4">
                <div className="flex items-center gap-2 mb-3">
                    <CalendarDays className="h-4 w-4 text-violet-600" />
                    <p className="text-sm font-bold text-violet-900">Dias Preferidos para Concentração de Aulas</p>
                </div>
                <p className="text-[11px] text-violet-700/70 mb-3">O motor priorizará estes dias ao alocar aulas. Soft constraint — relaxada se necessário.</p>
                <div className="flex flex-wrap gap-2">
                    {DIAS_SEMANA_MAP.map(dia => {
                        const isSelected = diasPreferidos.includes(dia.id);
                        return (
                            <button
                                key={dia.id}
                                type="button"
                                onClick={() => setDiasPreferidos(prev =>
                                    isSelected ? prev.filter(d => d !== dia.id) : [...prev, dia.id]
                                )}
                                className={cn(
                                    'px-4 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest border-2 transition-all select-none',
                                    isSelected
                                        ? 'bg-violet-600 border-violet-600 text-white shadow-md scale-[1.04]'
                                        : 'bg-white border-slate-200 text-slate-500 hover:border-violet-300'
                                )}
                            >
                                {dia.label}
                            </button>
                        );
                    })}
                </div>
                {diasPreferidos.length === 0 && (
                    <p className="text-[10px] text-muted-foreground mt-2 italic">Nenhum dia selecionado — o motor usará qualquer dia disponível.</p>
                )}
            </div>

>>>>>>> 3bc12c2 (teste)
            {professorTurnos.length > 0 ? (
                <Tabs defaultValue={professorTurnos[0].id} className="w-full">
                    <TabsList className="bg-muted w-full justify-start overflow-x-auto h-auto p-1">
                        {professorTurnos.map(turno => (
                            <TabsTrigger key={turno.id} value={turno.id} className="px-6 py-2.5 uppercase font-bold text-xs">{turno.nome}</TabsTrigger>
                        ))}
                    </TabsList>
                    {professorTurnos.map(turno => (
                        <TabsContent key={turno.id} value={turno.id} className="mt-4 animate-in fade-in slide-in-from-left-2 duration-300">
                            <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
                                <div className="overflow-x-auto">
                                <table className="w-full text-sm text-center border-collapse">
                                    <thead>
                                        <tr className="bg-muted/50 border-b">
                                            <th className="p-3 font-bold border-r w-24">Aula</th>
                                            {DIAS_SEMANA_MAP.map(dia => (
                                                <th key={dia.id} className="p-3 font-bold min-w-[80px]">{dia.label}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Array.from({ length: turno.aulas_por_dia }).map((_, aulaIndex) => (
                                            <tr key={aulaIndex} className="border-b last:border-0 h-16 hover:bg-muted/5 transition-colors">
                                                <td className="p-2 font-bold bg-muted/20 border-r">
                                                    <div className="text-primary text-base">{aulaIndex + 1}ª</div>
                                                    <div className="text-[10px] text-muted-foreground font-medium">
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
                                                                    "h-16 w-full flex flex-col items-center justify-center cursor-pointer transition-all",
                                                                    isStar ? 'bg-amber-50 text-amber-600 shadow-inner' :
                                                                    status === 'indisponivel' ? 'bg-red-50 text-red-600 shadow-inner' : 
                                                                    status === 'planejamento' ? 'bg-blue-50 text-blue-600 shadow-inner' : 'hover:bg-accent/50'
                                                                )}
                                                            >
                                                                {isStar ? (
                                                                    <>
                                                                        <Star className="h-6 w-6 fill-amber-500 animate-in zoom-in-50 duration-300" />
                                                                        <span className="text-[8px] font-black uppercase mt-0.5">Folga</span>
                                                                    </>
                                                                ) : status === 'indisponivel' ? (
                                                                    <>
                                                                        <Ban className="h-6 w-6" />
                                                                        <span className="text-[8px] font-black uppercase mt-0.5">Ban</span>
                                                                    </>
                                                                ) : status === 'planejamento' ? (
                                                                    <>
                                                                        <PenSquare className="h-6 w-6" />
                                                                        <span className="text-[8px] font-black uppercase mt-0.5">Plan.</span>
                                                                    </>
                                                                ) : (
                                                                    <div className="h-1.5 w-1.5 rounded-full bg-slate-200" />
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
                <div className="text-center text-muted-foreground p-16 border-2 border-dashed rounded-3xl bg-muted/5 flex flex-col items-center gap-4">
                    <CalendarX className="h-12 w-12 opacity-20" />
                    <p className="font-medium">Este professor não está associado a nenhum turno ativo nesta escola.</p>
                </div>
            )}
        </div>

        <SheetFooter className="mt-auto border-t pt-6 bg-background flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-6 p-3 px-5 rounded-full border bg-slate-50 shadow-sm w-full sm:w-auto">
              <div className="flex items-center gap-3 border-r pr-6 mr-2">
                  <Switch 
                    id="sem-preferencia" 
                    checked={semPreferencia} 
                    onCheckedChange={handleToggleSemPreferencia} 
                    className="data-[state=checked]:bg-primary"
                  />
                  <Label htmlFor="sem-preferencia" className="text-xs font-black uppercase text-primary cursor-pointer tracking-tighter whitespace-nowrap">Sem Preferência de Folga</Label>
              </div>
              <div className={cn(
                  "flex items-center gap-2 text-[10px] uppercase font-black transition-opacity",
                  semPreferencia ? "opacity-20 pointer-events-none" : "opacity-100"
              )}>
                  <Star className={cn("h-4 w-4", livreDocencia.length === 2 ? "text-green-500 fill-green-500" : "text-amber-500 fill-amber-500")} /> 
                  <span>Livre Docência: {livreDocencia.length}/2</span>
              </div>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button type="button" variant="ghost" onClick={() => setIsOpen(false)} className="flex-1 sm:flex-none">Cancelar</Button>
            <Button 
                onClick={handleSave} 
                disabled={loading || (!semPreferencia && livreDocencia.length < 2 && !professor.id.startsWith('new'))} 
                className="min-w-[140px] font-black shadow-lg flex-1 sm:flex-none"
            >
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Salvar Alterações
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
