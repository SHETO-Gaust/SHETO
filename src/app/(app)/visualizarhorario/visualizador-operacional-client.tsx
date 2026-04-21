
'use client';

import { useState, useMemo, useTransition, useEffect } from 'react';
import type { Turno, HorarioCompleto, ProfessorComDados } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users, User, ArrowLeft, Loader2, Calendar, Layout, Layers, Search, Clock } from 'lucide-react';
import { VisualizadorHorarioClient } from '@/app/(app)/gerarhorarios/[id]/visualizador-horario-client';
import { getHorariosEscolaCompletos } from './actions';

type Props = {
  escolaId: string;
};

type ViewState = 'portal' | 'professores' | 'turmas';

export function VisualizadorOperacionalClient({ escolaId }: Props) {
  const [viewState, setViewState] = useState<ViewState>('portal');
  const [data, setData] = useState<{ turnos: Turno[], horariosCompletos: HorarioCompleto[], allAulas: any[] } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Estados de Seleção
  const [selectedProfessorId, setSelectedProfessorId] = useState<string>('');
  const [selectedTurnoId, setSelectedTurnoId] = useState<string>('');

  useEffect(() => {
    startTransition(async () => {
        const res = await getHorariosEscolaCompletos(escolaId);
        setData(res);
    });
  }, [escolaId]);

  const professores = useMemo(() => {
    if (!data) return [];
    const map = new Map();
    data.allAulas.forEach(aula => {
        if (aula.professor_id && !map.has(aula.professor_id)) {
            map.set(aula.professor_id, aula.professor);
        }
    });
    return Array.from(map.values()).sort((a, b) => {
        const clearNameA = (a.nome_horario || '').replace(/^Prof[ªºa-z.]*\s*/i, '').trim();
        const clearNameB = (b.nome_horario || '').replace(/^Prof[ªºa-z.]*\s*/i, '').trim();
        return clearNameA.localeCompare(clearNameB);
    });
  }, [data]);

  const turnosComGrade = useMemo(() => {
      if (!data) return [];
      return data.turnos.filter(t => data.horariosCompletos.some(h => h.turno_id === t.id));
  }, [data]);

  const currentHorario = useMemo(() => {
      if (!selectedTurnoId || !data) return null;
      return data.horariosCompletos.find(h => h.turno_id === selectedTurnoId) || null;
  }, [selectedTurnoId, data]);

  if (isPending) {
    return (
        <div className="flex flex-col items-center justify-center p-20 space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary/40" />
            <p className="text-muted-foreground font-medium italic">Consolidando grades da unidade...</p>
        </div>
    );
  }

  if (viewState === 'portal') {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-12 max-w-4xl mx-auto">
            <Card 
                className="group hover:border-primary transition-all cursor-pointer shadow-xl hover:shadow-2xl border-2"
                onClick={() => setViewState('professores')}
            >
                <CardHeader className="text-center space-y-4 pb-10">
                    <div className="mx-auto h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-colors">
                        <User className="h-10 w-10" />
                    </div>
                    <div className="space-y-2">
                        <CardTitle className="text-2xl font-black">Por Professor</CardTitle>
                        <CardDescription>Visualize a agenda consolidada do docente (Matutino, Vespertino e Integral).</CardDescription>
                    </div>
                </CardHeader>
            </Card>

            <Card 
                className="group hover:border-primary transition-all cursor-pointer shadow-xl hover:shadow-2xl border-2"
                onClick={() => setViewState('turmas')}
            >
                <CardHeader className="text-center space-y-4 pb-10">
                    <div className="mx-auto h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-colors">
                        <Users className="h-10 w-10" />
                    </div>
                    <div className="space-y-2">
                        <CardTitle className="text-2xl font-black">Por Turma</CardTitle>
                        <CardDescription>Selecione um turno e visualize as grades por sala ou a visão operacional diária.</CardDescription>
                    </div>
                </CardHeader>
            </Card>
        </div>
    );
  }

  return (
    <div className="space-y-6">
        <div className="flex items-center justify-between bg-muted/30 p-4 rounded-xl border print:hidden">
            <Button variant="ghost" onClick={() => setViewState('portal')} className="font-bold">
                <ArrowLeft className="mr-2 h-4 w-4" /> Voltar ao Início
            </Button>

            <div className="flex items-center gap-4">
                {viewState === 'professores' ? (
                    <div className="flex items-center gap-3">
                        <span className="text-xs font-bold uppercase text-muted-foreground whitespace-nowrap">Selecionar Professor:</span>
                        <Select value={selectedProfessorId} onValueChange={setSelectedProfessorId}>
                            <SelectTrigger className="w-[280px] bg-background">
                                <SelectValue placeholder="Escolha um docente..." />
                            </SelectTrigger>
                            <SelectContent>
                                {professores.map(p => (
                                    <SelectItem key={p.id} value={p.id}>{p.nome_horario}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                ) : (
                    <div className="flex items-center gap-3">
                        <span className="text-xs font-bold uppercase text-muted-foreground whitespace-nowrap">Selecionar Turno:</span>
                        <Select value={selectedTurnoId} onValueChange={setSelectedTurnoId}>
                            <SelectTrigger className="w-[280px] bg-background">
                                <SelectValue placeholder="Escolha o turno..." />
                            </SelectTrigger>
                            <SelectContent>
                                {turnosComGrade.map(t => (
                                    <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}
            </div>
        </div>

        {viewState === 'professores' ? (
            selectedProfessorId ? (
                // Simulamos um objeto HorarioCompleto fake para o visualizador rico usar a lógica de consolidação que já tem
                <VisualizadorHorarioClient 
                    key={selectedProfessorId}
                    horario={{
                        ...data!.horariosCompletos[0],
                        aulas: data!.allAulas,
                        outras_aulas_publicadas: [] // A lógica interna vai filtrar por professor_id
                    }}
                    forceView="teachers"
                    forceTeacherId={selectedProfessorId}
                />
            ) : (
                <div className="flex flex-col items-center justify-center p-20 text-center border-2 border-dashed rounded-3xl bg-muted/5">
                    <Search className="h-16 w-16 text-muted-foreground/20 mb-4" />
                    <p className="text-muted-foreground font-medium">Selecione um professor no menu acima para ver sua agenda global.</p>
                </div>
            )
        ) : (
            selectedTurnoId && currentHorario ? (
                <VisualizadorHorarioClient horario={currentHorario} />
            ) : (
                <div className="flex flex-col items-center justify-center p-20 text-center border-2 border-dashed rounded-3xl bg-muted/5">
                    <Clock className="h-16 w-16 text-muted-foreground/20 mb-4" />
                    <p className="text-muted-foreground font-medium">Selecione o turno acima para carregar as turmas oficiais.</p>
                </div>
            )
        )}
    </div>
  );
}
