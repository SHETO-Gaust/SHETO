'use client';

import { useState, useTransition } from 'react';
import type { Turno, ProfessorComDados } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon, UserX, Search, UserCheck, Loader2, AlertCircle, Clock } from 'lucide-react';
import { getProfessorAulasNoDia, buscarSubstitutosDisponiveis } from './actions';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

type Props = {
  escolaId: string;
  turnos: Turno[];
  professores: ProfessorComDados[];
};

const DIAS_SEMANA = [
  { id: 'segunda', label: 'Segunda-feira' },
  { id: 'terca', label: 'Terça-feira' },
  { id: 'quarta', label: 'Quarta-feira' },
  { id: 'quinta', label: 'Quinta-feira' },
  { id: 'sexta', label: 'Sexta-feira' },
  { id: 'sabado', label: 'Sábado' },
];

export function SubstituicoesClient({ escolaId, turnos, professores }: Props) {
  const [turnoId, setTurnoId] = useState('');
  const [dia, setDia] = useState('');
  const [professorId, setProfessorId] = useState('');
  
  const [aulasVagas, setAulasVagas] = useState<any[]>([]);
  const [substitutos, setSubstitutos] = useState<Record<number, ProfessorComDados[]>>({});
  const [isSearching, startSearching] = useTransition();
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBuscar = () => {
    if (!turnoId || !dia || !professorId) return;

    setError(null);
    setSubstitutos({});
    setHasSearched(false);
    
    startSearching(async () => {
        const result = await getProfessorAulasNoDia(turnoId, professorId, dia);
        if (result.error) {
            setError(result.error);
            setAulasVagas([]);
            setHasSearched(true);
            return;
        }
        
        const aulas = result.data || [];
        setAulasVagas(aulas);

        // Para cada aula, buscar quem está livre
        const newSubstitutos: any = {};
        for (const aula of aulas) {
            const subsResult = await buscarSubstitutosDisponiveis(escolaId, turnoId, dia, aula.aula_index);
            if (subsResult.data) {
                newSubstitutos[aula.aula_index] = subsResult.data;
            }
        }
        setSubstitutos(newSubstitutos);
        setHasSearched(true);
    });
  };

  const selectedTurno = turnos.find(t => t.id === turnoId);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Configurar Ausência</CardTitle>
          <CardDescription>Informe o professor que faltou e em qual turno.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase text-muted-foreground">Turno</label>
            <Select value={turnoId} onValueChange={(v) => { setTurnoId(v); setHasSearched(false); }}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {turnos.map(t => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase text-muted-foreground">Dia da Semana</label>
            <Select value={dia} onValueChange={(v) => { setDia(v); setHasSearched(false); }}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {DIAS_SEMANA.map(d => <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase text-muted-foreground">Professor Ausente</label>
            <Select value={professorId} onValueChange={(v) => { setProfessorId(v); setHasSearched(false); }}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {professores.map(p => <SelectItem key={p.id} value={p.id}>{p.nome_horario}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end">
            <Button className="w-full" onClick={handleBuscar} disabled={!turnoId || !dia || !professorId || isSearching}>
              {isSearching ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Search className="mr-2 h-4 w-4" />}
              Analisar Impacto
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="p-8 text-center border-2 border-dashed rounded-xl bg-muted/10">
            <AlertCircle className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">{error}</p>
        </div>
      )}

      {aulasVagas.length > 0 && (
        <div className="space-y-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
                <UserX className="h-5 w-5 text-destructive" />
                Aulas que precisam de cobertura
            </h2>
            
            <div className="grid grid-cols-1 gap-4">
                {aulasVagas.map((aula) => (
                    <Card key={aula.id} className="overflow-hidden border-l-4 border-l-destructive">
                        <div className="flex flex-col md:flex-row">
                            <div className="p-6 bg-muted/20 md:w-64 border-r">
                                <div className="flex items-center gap-2 text-primary font-black mb-1">
                                    <Clock className="h-4 w-4" />
                                    {aula.aula_index + 1}ª Aula
                                </div>
                                <div className="text-xs text-muted-foreground font-medium uppercase mb-4">
                                    {selectedTurno?.horarios?.[aula.aula_index]?.inicio} - {selectedTurno?.horarios?.[aula.aula_index]?.fim}
                                </div>
                                <div className="space-y-1">
                                    <p className="text-sm font-bold uppercase truncate">{aula.componente.nome}</p>
                                    <Badge variant="secondary" className="font-bold">TURMA {aula.turma.nome}</Badge>
                                </div>
                            </div>
                            
                            <div className="p-6 flex-1 bg-background">
                                <div className="flex items-center gap-2 mb-4">
                                    <UserCheck className="h-4 w-4 text-green-600" />
                                    <span className="text-sm font-bold uppercase tracking-tight">Substitutos Disponíveis (Livre de aulas e planejamento)</span>
                                </div>
                                
                                <div className="flex flex-wrap gap-2">
                                    {substitutos[aula.aula_index]?.length > 0 ? (
                                        substitutos[aula.aula_index].map(sub => (
                                            <div key={sub.id} className="bg-green-50 border border-green-100 px-3 py-2 rounded-lg flex items-center gap-2">
                                                <div className="h-2 w-2 rounded-full bg-green-500" />
                                                <span className="text-sm font-semibold text-green-900">{sub.nome_horario}</span>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-xs text-muted-foreground italic">Nenhum professor da unidade está livre neste horário.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </Card>
                ))}
            </div>
        </div>
      )}

      {hasSearched && aulasVagas.length === 0 && !error && (
          <div className="p-12 text-center border-2 border-dashed rounded-xl bg-muted/10">
              <UserCheck className="h-10 w-10 text-green-500/30 mx-auto mb-3" />
              <p className="text-muted-foreground">O professor selecionado não possui aulas oficiais publicadas para este dia no turno escolhido.</p>
          </div>
      )}
    </div>
  );
}
