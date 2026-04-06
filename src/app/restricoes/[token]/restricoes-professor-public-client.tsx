'use client';

import { useState, useTransition, useMemo } from 'react';
import type { Turno, LivreDocenciaItem, LivreDocenciaPeriodo } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Ban, PenSquare, Loader2, CheckCircle2, Send, Info, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { responderSolicitacao } from '@/app/(app)/professores/actions';
import { useToast } from '@/hooks/use-toast';

type Props = {
  token: string;
  professor: any;
  turnos: Turno[];
};

const DIAS_SEMANA_MAP = [
  { id: 'segunda', label: 'Segunda' }, { id: 'terca', label: 'Terça' },
  { id: 'quarta', label: 'Quarta' }, { id: 'quinta', label: 'Quinta' },
  { id: 'sexta', label: 'Sexta' }, { id: 'sabado', label: 'Sábado' },
];

const PERIODOS_LABELS: Record<LivreDocenciaPeriodo, string> = {
    matutino: 'Manhã',
    vespertino: 'Tarde',
    noturno: 'Noite'
};

export function RestricoesProfessorPublicClient({ token, professor, turnos }: Props) {
  const [restricoes, setRestricoes] = useState<any>(professor.restricoes || {});
  const [livreDocencia, setLivreDocencia] = useState<LivreDocenciaItem[]>(professor.livre_docencia || []);
  const [isPending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);
  const { toast } = useToast();

  const availablePeriods = useMemo(() => {
      const periods = new Set<LivreDocenciaPeriodo>();
      turnos.forEach(t => {
          const n = t.nome.toLowerCase();
          if (n.includes('matutino') || n.includes('integral')) periods.add('matutino');
          if (n.includes('vespertino') || n.includes('integral')) periods.add('vespertino');
          if (n.includes('noturno')) periods.add('noturno');
      });
      return Array.from(periods);
  }, [turnos]);

  const handleCellClick = (turnoId: string, dia: string, aulaIndex: number) => {
    const newRestricoes = JSON.parse(JSON.stringify(restricoes));
    
    if (!newRestricoes[turnoId]) newRestricoes[turnoId] = {};
    if (!newRestricoes[turnoId][dia]) newRestricoes[turnoId][dia] = {};

    const currentStatus = newRestricoes[turnoId][dia][aulaIndex];

    if (currentStatus === 'planejamento') {
        toast({ 
            title: 'Campo Bloqueado', 
            description: 'Horários de Planejamento são definidos pela coordenação escolar.',
            variant: 'default'
        });
        return;
    }

    if (currentStatus === 'indisponivel') {
        delete newRestricoes[turnoId][dia][aulaIndex];
    } else {
        newRestricoes[turnoId][dia][aulaIndex] = 'indisponivel';
    }
    
    setRestricoes(newRestricoes);
  };

  const toggleLivreDocencia = (periodo: LivreDocenciaPeriodo, diaId: string) => {
      const current = [...livreDocencia];
      const isSelected = current.some(item => item.periodo === periodo && item.dia === diaId);
      
      if (isSelected) {
          setLivreDocencia(current.filter(item => !(item.periodo === periodo && item.dia === diaId)));
      } else {
          if (current.length >= 2) {
              toast({ title: 'Limite Atingido', description: 'Você pode selecionar no máximo 2 meios períodos de livre docência.', variant: 'destructive' });
              return;
          }
          setLivreDocencia([...current, { periodo, dia: diaId }]);
      }
  };

  const handleSubmit = () => {
      if (livreDocencia.length < 2) {
          toast({ title: 'Livre Docência Incompleta', description: 'Por favor, selecione 2 meios períodos para sua livre docência antes de enviar.', variant: 'destructive' });
          return;
      }

      startTransition(async () => {
          const result = await responderSolicitacao(token, restricoes, livreDocencia);
          if (result.error) {
              toast({ title: 'Erro ao enviar', description: result.error, variant: 'destructive' });
          } else {
              setSubmitted(true);
              toast({ title: 'Informações enviadas!', description: 'Obrigado por informar sua disponibilidade.' });
          }
      });
  };

  if (submitted) {
      return (
          <Card className="border-green-200 bg-green-50/50 py-12">
              <CardContent className="flex flex-col items-center justify-center text-center space-y-4">
                  <div className="bg-green-100 p-4 rounded-full">
                      <CheckCircle2 className="h-12 w-12 text-green-600" />
                  </div>
                  <div className="space-y-2">
                      <h2 className="text-2xl font-bold text-green-900">Tudo pronto!</h2>
                      <p className="text-green-700">Suas preferências de horário e livre docência foram enviadas para a coordenação.</p>
                  </div>
                  <p className="text-xs text-green-600/60 pt-4 uppercase font-bold">Você já pode fechar esta aba.</p>
              </CardContent>
          </Card>
      );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="bg-blue-50 border border-blue-100 p-6 rounded-2xl flex items-start gap-4 shadow-sm">
          <Info className="h-6 w-6 text-blue-600 shrink-0 mt-1" />
          <div className="space-y-2">
              <p className="font-bold text-blue-900 text-lg">Preferências e Regras</p>
              <ul className="text-blue-800 text-sm space-y-2 opacity-90">
                  <li>• <strong>Livre Docência:</strong> Você deve escolher obrigatoriamente <strong>2 meios períodos</strong> (blocos de Manhã, Tarde ou Noite) livres na semana.</li>
                  <li>• <strong>Indisponibilidade:</strong> Clique na grade para marcar horários que você possui outros vínculos ou restrições totais.</li>
                  <li>• <strong>Nota:</strong> Estas informações são <strong>sugestões</strong>. A coordenação priorizará seu atendimento, mas a grade final depende das necessidades da escola.</li>
              </ul>
          </div>
      </div>

      <Card className="shadow-lg border-primary/10 overflow-hidden">
          <CardHeader className="bg-primary/5 border-b">
              <CardTitle className="text-lg flex items-center gap-2">
                  <Star className="h-5 w-5 text-primary fill-primary" />
                  1. Selecione sua Livre Docência (Obrigatório: 2)
              </CardTitle>
              <CardDescription>Escolha dois períodos reais em que você prefere não ter nenhuma aula alocada.</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {availablePeriods.map(periodo => (
                      <div key={periodo} className="space-y-3">
                          <h4 className="font-black text-xs uppercase text-primary border-b border-primary/10 pb-1 tracking-widest">{PERIODOS_LABELS[periodo]}</h4>
                          <div className="grid grid-cols-2 gap-2">
                              {DIAS_SEMANA_MAP.map(dia => {
                                  const isSelected = livreDocencia.some(item => item.periodo === periodo && item.dia === dia.id);
                                  return (
                                      <div 
                                        key={dia.id}
                                        onClick={() => toggleLivreDocencia(periodo, dia.id)}
                                        className={cn(
                                            "flex items-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-all",
                                            isSelected ? "bg-primary border-primary text-white shadow-md scale-[1.02]" : "bg-background border-muted hover:border-primary/30"
                                        )}
                                      >
                                          <div className={cn("h-4 w-4 rounded-sm border flex items-center justify-center", isSelected ? "bg-white border-white" : "border-primary/30")}>
                                              {isSelected && <CheckCircle2 className="h-3 w-3 text-primary" />}
                                          </div>
                                          <span className="text-xs font-bold uppercase">{dia.label}</span>
                                      </div>
                                  );
                              })}
                          </div>
                      </div>
                  ))}
              </div>
              <div className="mt-6 flex items-center justify-between bg-muted/30 p-4 rounded-xl border border-dashed">
                  <span className="text-sm font-medium">Períodos selecionados:</span>
                  <div className="flex gap-2">
                      {Array.from({ length: 2 }).map((_, i) => (
                          <div key={i} className={cn("h-3 w-8 rounded-full transition-colors", i < livreDocencia.length ? "bg-primary" : "bg-muted-foreground/20")} />
                      ))}
                  </div>
              </div>
          </CardContent>
      </Card>

      <Card className="shadow-2xl border-none overflow-hidden">
        <CardHeader className="bg-slate-900 text-white pb-8">
            <CardTitle className="flex items-center gap-2">
                <Ban className="h-5 w-5" />
                2. Outras Indisponibilidades
            </CardTitle>
            <CardDescription className="text-slate-400">Marque apenas horários específicos de restrição em seus turnos de aula.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
            <Tabs defaultValue={turnos[0]?.id} className="w-full">
                <TabsList className="w-full justify-start rounded-none border-b h-14 px-6 bg-slate-50 gap-4 overflow-x-auto">
                    {turnos.map(turno => (
                        <TabsTrigger key={turno.id} value={turno.id} className="text-xs font-bold uppercase tracking-wider data-[state=active]:bg-white data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-14 px-6 transition-all whitespace-nowrap">
                            {turno.nome}
                        </TabsTrigger>
                    ))}
                </TabsList>
                {turnos.map(turno => (
                    <TabsContent key={turno.id} value={turno.id} className="p-6 m-0 animate-in fade-in slide-in-from-left-2 duration-300">
                        <div className="rounded-xl border shadow-inner bg-slate-50/50 overflow-hidden">
                            <div className="overflow-x-auto">
                            <table className="w-full text-sm text-center border-collapse">
                                <thead>
                                    <tr className="bg-white border-b">
                                        <th className="p-4 font-bold border-r w-28 bg-slate-50/80">Horário</th>
                                        {DIAS_SEMANA_MAP.filter(d => turno.dias_semana.includes(d.id)).map(dia => (
                                            <th key={dia.id} className="p-4 font-bold">{dia.label}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {Array.from({ length: turno.aulas_por_dia }).map((_, aulaIndex) => (
                                        <tr key={aulaIndex} className="border-b last:border-0 h-24">
                                            <td className="p-2 font-bold bg-white border-r">
                                                <div className="text-primary text-base font-black">{aulaIndex + 1}ª</div>
                                                <div className="text-[10px] text-muted-foreground uppercase tracking-tighter">
                                                    {turno.horarios?.[aulaIndex]?.inicio || '--:--'} às {turno.horarios?.[aulaIndex]?.fim || '--:--'}
                                                </div>
                                            </td>
                                            {DIAS_SEMANA_MAP.filter(d => turno.dias_semana.includes(d.id)).map(dia => {
                                                const status = restricoes[turno.id]?.[dia.id]?.[aulaIndex];
                                                const isCoordinationSet = status === 'planejamento';
                                                
                                                return (
                                                    <td key={dia.id} className="p-1 border-r last:border-r-0">
                                                        <div 
                                                            onClick={() => handleCellClick(turno.id, dia.id, aulaIndex)}
                                                            className={cn(
                                                                "h-full w-full rounded-lg flex flex-col items-center justify-center transition-all",
                                                                status === 'indisponivel' ? 'bg-red-500 text-white shadow-lg cursor-pointer hover:scale-95' : 
                                                                isCoordinationSet ? 'bg-blue-100 text-blue-700 border-2 border-blue-200 cursor-not-allowed opacity-80' : 
                                                                'bg-white border-2 border-dashed border-slate-200 hover:border-slate-400 text-slate-300 cursor-pointer hover:scale-95'
                                                            )}
                                                        >
                                                            {status === 'indisponivel' ? (
                                                                <>
                                                                    <Ban className="h-6 w-6 mb-1" />
                                                                    <span className="text-[9px] font-black uppercase">Indisponível</span>
                                                                </>
                                                            ) : isCoordinationSet ? (
                                                                <>
                                                                    <PenSquare className="h-5 w-5 mb-1" />
                                                                    <span className="text-[8px] font-bold uppercase">Planejamento</span>
                                                                    <span className="text-[7px] opacity-70">(Escola)</span>
                                                                </>
                                                            ) : (
                                                                <span className="text-[10px] font-bold uppercase opacity-40">Livre</span>
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
        </CardContent>
        <CardFooter className="p-8 bg-slate-50 border-t flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-1 text-center md:text-left max-w-md">
                <p className="font-bold text-slate-900">Revisou suas escolhas?</p>
                <p className="text-xs text-slate-500">Lembre-se que a escola priorizará sua livre docência, mas o horário final depende da organização de todas as turmas.</p>
            </div>
            <Button 
                size="lg" 
                onClick={handleSubmit} 
                disabled={isPending}
                className="h-14 px-10 text-lg font-black bg-primary shadow-xl hover:scale-105 active:scale-95 transition-all"
            >
                {isPending ? <Loader2 className="animate-spin mr-3 h-6 w-6" /> : <Send className="mr-3 h-6 w-6" />}
                ENVIAR PREFERÊNCIAS
            </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
