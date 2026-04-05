
'use client';

import { useState, useTransition } from 'react';
import type { Turno } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Ban, PenSquare, Loader2, CheckCircle2, Save, Send, Info } from 'lucide-react';
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

export function RestricoesProfessorPublicClient({ token, professor, turnos }: Props) {
  const [restricoes, setRestricoes] = useState<any>(professor.restricoes || {});
  const [isPending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);
  const { toast } = useToast();

  const handleCellClick = (turnoId: string, dia: string, aulaIndex: number) => {
    const newRestricoes = JSON.parse(JSON.stringify(restricoes));
    
    if (!newRestricoes[turnoId]) newRestricoes[turnoId] = {};
    if (!newRestricoes[turnoId][dia]) newRestricoes[turnoId][dia] = {};

    const currentStatus = newRestricoes[turnoId][dia][aulaIndex];

    // Se for planejamento (marcado pela coordenação), o professor não pode alterar via este link
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

  const handleSubmit = () => {
      startTransition(async () => {
          const result = await responderSolicitacao(token, restricoes);
          if (result.error) {
              toast({ title: 'Erro ao enviar', description: result.error, variant: 'destructive' });
          } else {
              setSubmitted(true);
              toast({ title: 'Resposta enviada!', description: 'Obrigado por informar sua disponibilidade.' });
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
                      <p className="text-green-700">Suas informações de folga foram enviadas para a coordenação.</p>
                  </div>
                  <p className="text-xs text-green-600/60 pt-4 uppercase font-bold">Você já pode fechar esta aba.</p>
              </CardContent>
          </Card>
      );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="bg-blue-50 border border-blue-100 p-6 rounded-2xl flex items-start gap-4 shadow-sm">
          <div className="bg-blue-600 text-white h-10 w-10 rounded-full flex items-center justify-center font-bold shrink-0">?</div>
          <div className="space-y-1">
              <p className="font-bold text-blue-900 text-lg">Como informar sua folga?</p>
              <ul className="text-blue-800 text-sm space-y-1.5 opacity-90">
                  <li>• Clique nos horários que você estará <span className="font-bold text-red-600">INDISPONÍVEL</span> (Folga).</li>
                  <li>• Os horários em branco são considerados <span className="font-bold">LIVRES</span> para alocação de aulas.</li>
                  <li>• Horários de <span className="font-bold text-blue-600">PLANEJAMENTO</span> são bloqueados para edição do docente.</li>
              </ul>
          </div>
      </div>

      <Card className="shadow-2xl border-none overflow-hidden">
        <CardHeader className="bg-slate-900 text-white pb-8">
            <CardTitle>Minha Grade de Disponibilidade</CardTitle>
            <CardDescription className="text-slate-400">Marque apenas os horários que você não poderá estar na escola.</CardDescription>
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
                                                                    <span className="text-[9px] font-black uppercase">Folga</span>
                                                                </>
                                                            ) : isCoordinationSet ? (
                                                                <>
                                                                    <PenSquare className="h-5 w-5 mb-1" />
                                                                    <span className="text-[8px] font-bold uppercase">Planejamento</span>
                                                                    <span className="text-[7px] opacity-70">(Coordenação)</span>
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
            <div className="space-y-1 text-center md:text-left">
                <p className="font-bold text-slate-900">Finalizou o preenchimento?</p>
                <p className="text-sm text-slate-500">Ao enviar, a coordenação analisará suas folgas para gerar o horário.</p>
            </div>
            <Button 
                size="lg" 
                onClick={handleSubmit} 
                disabled={isPending}
                className="h-14 px-10 text-lg font-black bg-primary shadow-xl hover:scale-105 active:scale-95 transition-all"
            >
                {isPending ? <Loader2 className="animate-spin mr-3 h-6 w-6" /> : <Send className="mr-3 h-6 w-6" />}
                ENVIAR PARA COORDENAÇÃO
            </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
