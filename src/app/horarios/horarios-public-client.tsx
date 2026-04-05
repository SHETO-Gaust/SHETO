
'use client';

import { useState, useMemo, useEffect, useTransition } from 'react';
import type { HorarioCompleto, Turno } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { Clock, User, Users, Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { getGradeProfessorPublica } from './actions';
import { useToast } from '@/hooks/use-toast';

type Props = {
  horarios: HorarioCompleto[];
  escolaId: string;
};

const DIAS_SEMANA_MAP = [
  { id: 'segunda', label: 'Segunda' }, { id: 'terca', label: 'Terça' },
  { id: 'quarta', label: 'Quarta' }, { id: 'quinta', label: 'Quinta' },
  { id: 'sexta', label: 'Sexta' }, { id: 'sabado', label: 'Sábado' },
];

export function HorariosPublicClient({ horarios, escolaId }: Props) {
  const [viewType, setViewType] = useState<'turma' | 'professor'>('turma');
  const [selectedHorarioId, setSelectedHorarioId] = useState<string>(horarios[0]?.id || '');
  const [selectedTurmaId, setSelectedTurmaId] = useState<string>('');
  
  // Estados para busca por professor
  const [profSearch, setProfSearch] = useState('');
  const [profData, setProfData] = useState<any>(null);
  const [isSearchingProf, startSearchingProf] = useTransition();
  const { toast } = useToast();

  const currentHorario = useMemo(() => 
    horarios.find(h => h.id === selectedHorarioId) || horarios[0],
    [horarios, selectedHorarioId]
  );

  const turmas = useMemo(() => {
    if (!currentHorario) return [];
    const map = new Map();
    currentHorario.aulas.forEach(aula => {
      if (!map.has(aula.turma_id)) {
        map.set(aula.turma_id, aula.turma);
      }
    });
    return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [currentHorario]);

  useEffect(() => {
    if (turmas.length > 0) {
      const isStillValid = turmas.some(t => t.id === selectedTurmaId);
      if (!isStillValid) {
        setSelectedTurmaId(turmas[0].id);
      }
    } else {
      setSelectedTurmaId('');
    }
  }, [turmas, selectedTurmaId]);

  const diasAtivos = (turno: Turno) => 
    DIAS_SEMANA_MAP.filter(d => turno.dias_semana.includes(d.id));

  const handleSearchProf = () => {
      if (!profSearch.trim()) return;
      startSearchingProf(async () => {
          const result = await getGradeProfessorPublica(escolaId, profSearch);
          if (result.error) {
              toast({ title: 'Atenção', description: result.error, variant: 'destructive' });
              setProfData(null);
          } else {
              setProfData(result.data);
          }
      });
  }

  const GradeHoraria = ({ aulas, turnoInfo, label, tipo, targetId, isProfessorView }: any) => {
    if (!turnoInfo) return null;

    const getAulaNoSlot = (dia: string, index: number) => {
        return aulas.find((a: any) => 
            (isProfessorView ? true : a.turma_id === targetId) && 
            a.dia_semana === dia && 
            a.aula_index === index &&
            a.tipo === tipo
        );
    };

    const hasAulas = aulas.some((a: any) => (isProfessorView ? true : a.turma_id === targetId) && a.tipo === tipo);
    if (!hasAulas && (tipo === 'nao_presencial' || isProfessorView)) return null;

    const dias = diasAtivos(turnoInfo);

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 border-l-4 border-primary pl-3 py-1">
                <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
                    {label} <span className="text-muted-foreground font-normal">({turnoInfo.nome})</span>
                </h3>
            </div>
            <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                    <tr className="bg-muted/50 border-b">
                        <th className="p-4 text-left font-semibold border-r w-32">Horário</th>
                        {dias.map(dia => (
                        <th key={dia.id} className="p-4 text-center font-semibold min-w-[140px]">
                            {dia.label}
                        </th>
                        ))}
                    </tr>
                    </thead>
                    <tbody>
                    {Array.from({ length: turnoInfo.aulas_por_dia }).map((_, aulaIndex) => (
                        <tr key={aulaIndex} className="border-b last:border-0 hover:bg-muted/5 transition-colors h-24">
                        <td className="p-4 font-medium bg-muted/10 border-r">
                            <div className="font-bold text-primary">{aulaIndex + 1}ª Aula</div>
                            <div className="text-[11px] text-muted-foreground font-normal flex items-center gap-1 mt-1">
                                <Clock className="h-3 w-3" />
                                {turnoInfo.horarios?.[aulaIndex]?.inicio || '--:--'} - {turnoInfo.horarios?.[aulaIndex]?.fim || '--:--'}
                            </div>
                        </td>
                        {dias.map(dia => {
                            const aula = getAulaNoSlot(dia.id, aulaIndex);

                            return (
                            <td key={dia.id} className="p-2 text-center border-r last:border-r-0">
                                {aula ? (
                                <div className="flex flex-col items-center justify-center h-full space-y-1.5">
                                    <div className={cn(
                                        "font-bold text-[11px] leading-tight uppercase px-3 py-2 rounded-lg w-full shadow-sm border",
                                        tipo === 'presencial' 
                                            ? "bg-primary/5 text-primary border-primary/20" 
                                            : "bg-orange-50 text-orange-700 border-orange-200"
                                    )}>
                                    {aula.componente.nome}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-tighter truncate w-full">
                                        {isProfessorView ? `TURMA ${aula.turma.nome}` : (aula.professor?.nome_horario || '---')}
                                    </div>
                                </div>
                                ) : (
                                <span className="text-muted-foreground/10">-</span>
                                )}
                            </td>
                            )
                        })}
                        </tr>
                    ))}
                    </tbody>
                </table>
                </div>
            </div>
        </div>
    );
  };

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex justify-center mb-4">
          <Tabs value={viewType} onValueChange={(v) => setViewType(v as any)} className="w-auto">
              <TabsList className="bg-muted p-1 border-2">
                  <TabsTrigger value="turma" className="gap-2 px-6"><Users className="h-4 w-4" /> Por Turma</TabsTrigger>
                  <TabsTrigger value="professor" className="gap-2 px-6"><User className="h-4 w-4" /> Por Professor</TabsTrigger>
              </TabsList>
          </Tabs>
      </div>

      {viewType === 'turma' ? (
          <Card className="border-none shadow-none bg-transparent">
            <div className="flex flex-col md:flex-row md:items-center gap-4 mb-6">
                <div className="flex-1">
                    <Tabs value={selectedHorarioId} onValueChange={setSelectedHorarioId} className="w-full">
                        <TabsList className="h-auto p-1 bg-background border flex-wrap">
                            {horarios.map(h => (
                                <TabsTrigger key={h.id} value={h.id} className="py-2 px-4 data-[state=active]:bg-primary data-[state=active]:text-white">
                                    {h.turno.nome}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>
                </div>
                
                <div className="w-full md:w-[280px]">
                    <Select value={selectedTurmaId} onValueChange={setSelectedTurmaId}>
                        <SelectTrigger className="h-11 bg-background">
                            <SelectValue placeholder="Selecione a turma" />
                        </SelectTrigger>
                        <SelectContent>
                            {turmas.map(t => (
                                <SelectItem key={t.id} value={t.id}>Turma {t.nome}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="space-y-12">
                {selectedTurmaId ? (
                    <>
                        <div className="animate-in fade-in zoom-in-95 duration-300">
                            <GradeHoraria 
                                aulas={currentHorario.aulas}
                                targetId={selectedTurmaId} 
                                tipo="presencial" 
                                label="Grade Regular" 
                                turnoInfo={currentHorario.turno} 
                                isProfessorView={false}
                            />
                        </div>
                        
                        {currentHorario.turno_oposto && (
                            <div className="animate-in fade-in zoom-in-95 duration-500 delay-150">
                                <GradeHoraria 
                                    aulas={currentHorario.aulas}
                                    targetId={selectedTurmaId} 
                                    tipo="nao_presencial" 
                                    label="Grade do Contraturno (Atividades Não Presenciais)" 
                                    turnoInfo={currentHorario.turno_oposto} 
                                    isProfessorView={false}
                                />
                            </div>
                        )}
                    </>
                ) : (
                    <div className="text-center p-12 border-2 border-dashed rounded-xl bg-muted/10">
                        <p className="text-muted-foreground">Nenhuma turma encontrada para este turno.</p>
                    </div>
                )}
            </div>
          </Card>
      ) : (
          <div className="space-y-8 animate-in fade-in duration-500">
              <Card className="bg-white shadow-lg overflow-hidden border-t-4 border-t-orange-500">
                  <CardContent className="p-8">
                      <div className="max-w-md mx-auto space-y-4">
                          <div className="text-center space-y-2">
                              <h3 className="text-lg font-bold">Consultar por Docente</h3>
                              <p className="text-sm text-muted-foreground">Digite o nome ou parte do nome do professor para visualizar sua grade global.</p>
                          </div>
                          <div className="flex gap-2">
                              <div className="relative flex-1">
                                <Input 
                                    placeholder="Ex: Carlos Silva..." 
                                    value={profSearch} 
                                    onChange={(e) => setProfSearch(e.target.value)}
                                    className="h-12 pl-10"
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearchProf()}
                                />
                                <Search className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
                              </div>
                              <Button onClick={handleSearchProf} disabled={isSearchingProf} size="lg" className="h-12 px-6">
                                  {isSearchingProf ? <Loader2 className="animate-spin h-5 w-5" /> : 'Buscar'}
                              </Button>
                          </div>
                      </div>
                  </CardContent>
              </Card>

              {profData ? (
                  <div className="space-y-12 animate-in slide-in-from-bottom-4 duration-500">
                      <div className="flex items-center gap-4 bg-orange-50 border border-orange-100 p-6 rounded-2xl shadow-sm">
                          <div className="h-16 w-16 bg-orange-500 text-white rounded-full flex items-center justify-center shadow-lg">
                              <User className="h-8 w-8" />
                          </div>
                          <div>
                              <h2 className="text-2xl font-black text-orange-900 uppercase">{profData.professor.nome_horario}</h2>
                              <p className="text-sm text-orange-700 font-medium">Visualizando grade individual do docente nesta unidade escolar.</p>
                          </div>
                      </div>

                      {profData.turnos.map((t: any) => (
                          <div key={t.turno.id} className="animate-in fade-in zoom-in-95 duration-300">
                              <GradeHoraria 
                                aulas={t.aulas}
                                turnoInfo={t.turno}
                                label={`Turno: ${t.turno.nome}`}
                                tipo="presencial"
                                isProfessorView={true}
                              />
                          </div>
                      ))}
                  </div>
              ) : !isSearchingProf && (
                  <div className="flex flex-col items-center justify-center p-20 text-center border-2 border-dashed rounded-3xl bg-muted/5">
                      <Search className="h-16 w-16 text-muted-foreground/20 mb-4" />
                      <p className="text-muted-foreground font-medium">Utilize o campo acima para buscar a grade de um professor específico.</p>
                  </div>
              )}
          </div>
      )}
    </div>
  );
}
