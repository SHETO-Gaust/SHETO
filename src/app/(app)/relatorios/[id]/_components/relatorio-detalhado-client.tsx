'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { CheckCircle, XCircle, Loader2, RefreshCw, Sun, Sunset, Trash2, FileDown } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { ptBR } from 'date-fns/locale';
import type { Formacao } from '@/lib/types';
import type { DetailedParticipant } from '../../actions';
import { setManualPresence, getPresenceForParticipants, setBulkPresence } from '../../actions';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  LabelList,
} from "recharts";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type PresenceData = {
  registered_at: string;
  source: boolean;
};

type RelatorioDetalhadoClientProps = {
  formacao: Formacao;
  participants: DetailedParticipant[];
};

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8", "#82ca9d"];
const saoPauloTimeZone = 'America/Sao_Paulo';
const ITEMS_PER_PAGE = 25;


const RankingChart = ({ data, dataKey, unit, title, description, showLabel = false }: { data: any[]; dataKey: string; unit: string; title: string; description: string; showLabel?: boolean; }) => (
  <Card>
    <CardHeader>
      <CardTitle className="truncate">{title}</CardTitle>
      <CardDescription>{description}</CardDescription>
    </CardHeader>
    <CardContent>
      {data.length > 0 ? (
        <ChartContainer config={{}} className="h-80 w-full">
          <ResponsiveContainer>
            <BarChart data={data} layout="vertical" margin={{ left: 120, right: 60 }}>
              <XAxis type="number" dataKey={dataKey} unit={unit} tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12 }} interval={0} />
              <Tooltip cursor={{ fill: 'hsl(var(--secondary))' }} content={<ChartTooltipContent />} />
              <Bar dataKey={dataKey} radius={[0, 4, 4, 0]}>
                {showLabel &&
                  <LabelList 
                    dataKey={dataKey} 
                    position="right" 
                    offset={5} 
                    formatter={(value: number) => value > 0 ? `${value.toFixed(2)}${unit}` : ''}
                    style={{ fill: 'hsl(var(--foreground))', fontSize: 12 }} 
                  />
                }
                {data.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      ) : (
        <div className="flex h-80 items-center justify-center">
          <p className="text-sm text-muted-foreground">Nenhum dado para exibir.</p>
        </div>
      )}
    </CardContent>
  </Card>
);

export function RelatorioDetalhadoClient({ formacao, participants: initialParticipants }: RelatorioDetalhadoClientProps) {
  const { toast } = useToast();
  
  const [allParticipants] = useState(initialParticipants);
  const [presenceCache, setPresenceCache] = useState<Record<string, DetailedParticipant['presencas']>>({});
  const [loadingPresence, setLoadingPresence] = useState(false);
  const [togglingPresence, setTogglingPresence] = useState<string | null>(null);

  const [chartPresenceCache, setChartPresenceCache] = useState<Record<string, DetailedParticipant['presencas']>>({});
  const [loadingCharts, setLoadingCharts] = useState(true);

  const dateOptions = useMemo(() =>
    (formacao.dates || [])
      .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map((d: any) => {
        const dateString = d.date.substring(0, 10);
        return {
          value: dateString,
          label: format(parseISO(d.date), "dd/MM/yyyy (EEEE)", { locale: ptBR }),
        };
      }),
    [formacao.dates]
  );
  
  const [searchTerm, setSearchTerm] = useState('');
  const [presenceFilter, setPresenceFilter] = useState('todos');
  const [sourceFilter, setSourceFilter] = useState('todos');
  const [dateFilter, setDateFilter] = useState(dateOptions[0]?.value || '');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  const fetchAllPresenceData = useCallback(async () => {
    setLoadingCharts(true);
    const allParticipantIds = initialParticipants.map(p => p.id);
    try {
        const allPresenceData = await getPresenceForParticipants(formacao.id, allParticipantIds);
        setChartPresenceCache(allPresenceData);
    } catch (error) {
        toast({ title: "Erro ao carregar dados para os gráficos.", variant: "destructive" });
    } finally {
        setLoadingCharts(false);
    }
  }, [formacao.id, initialParticipants, toast]);

  useEffect(() => {
    fetchAllPresenceData();
  }, [fetchAllPresenceData]);
  
  const filteredParticipants = useMemo(() => {
    return allParticipants.filter(p => {
      const search = searchTerm.toLowerCase();
      const matchesSearch =
        p.nome_completo.toLowerCase().includes(search) ||
        p.cpf.includes(searchTerm);

      let matchesSource = true;
      if (sourceFilter === 'inscrito') matchesSource = p.fonte !== 'AVULSO';
      else if (sourceFilter === 'avulso') matchesSource = p.fonte === 'AVULSO';
      
      const presences = presenceCache[p.id];
      if (presenceFilter !== 'todos' && !presences) {
        return matchesSearch && matchesSource;
      }
      
      const daily = presences?.find(pr => pr.date === dateFilter);
      const hasMorning = !!daily?.matutino;
      const hasAfternoon = !!daily?.vespertino;

      let matchesPresence = true;
      if (presenceFilter === 'manha') matchesPresence = hasMorning && !hasAfternoon;
      else if (presenceFilter === 'tarde') matchesPresence = !hasMorning && hasAfternoon;
      else if (presenceFilter === 'ambos') matchesPresence = hasMorning && hasAfternoon;
      else if (presenceFilter === 'nenhum') matchesPresence = !hasMorning && !hasAfternoon;

      return matchesSearch && matchesSource && matchesPresence;
    });
  }, [allParticipants, searchTerm, sourceFilter, presenceFilter, presenceCache, dateFilter]);

  const { paginatedParticipants, totalPages } = useMemo(() => {
    const totalPages = Math.ceil(filteredParticipants.length / ITEMS_PER_PAGE);
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const paginatedBase = filteredParticipants.slice(start, start + ITEMS_PER_PAGE);

    const participantsForView = paginatedBase.map(p => {
        const presences = presenceCache[p.id];
        const daily = presences?.find(pr => pr.date === dateFilter);
        let regional = p.dados?.regional || 'N/A';
        if (regional === 'PARAÍSO DO TOCANTINS') regional = 'PARAÍSO';
        
        const isUnselectable = (daily?.matutino?.source === true && daily?.vespertino?.source === true) || (daily?.matutino?.source === false && daily?.vespertino?.source === false)

        return { ...p, regional, presenca_matutina: daily?.matutino ?? null, presenca_vespertina: daily?.vespertino ?? null, isUnselectable };
    });
    
    return { paginatedParticipants: participantsForView, totalPages };
  }, [filteredParticipants, currentPage, dateFilter, presenceCache]);
  
  useEffect(() => {
    const fetchPageData = async () => {
      const idsToFetch = paginatedParticipants
        .map(p => p.id)
        .filter(id => !presenceCache[id]);

      if (idsToFetch.length > 0) {
        setLoadingPresence(true);
        try {
          const newPresenceData = await getPresenceForParticipants(formacao.id, idsToFetch);
          setPresenceCache(prevCache => ({ ...prevCache, ...newPresenceData }));
        } catch (error) {
          toast({ title: "Erro ao carregar presenças.", variant: "destructive" });
        } finally {
          setLoadingPresence(false);
        }
      }
    };
    fetchPageData();
  }, [paginatedParticipants, formacao.id, presenceCache, toast]);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedIds([]);
  }, [searchTerm, presenceFilter, sourceFilter, dateFilter]);
  
  const handleSelectAll = (checked: boolean | 'indeterminate') => {
    if (checked === true) {
        const selectableIds = paginatedParticipants.filter(p => !p.isUnselectable).map(p => p.id);
        setSelectedIds(selectableIds);
    } else {
        setSelectedIds([]);
    }
  }

  const handleSelectRow = (id: string, checked: boolean) => {
      setSelectedIds(prev => 
          checked ? [...prev, id] : prev.filter(rowId => rowId !== id)
      );
  }

  const handleBulkAction = async (periodo: 'MAT' | 'VESP', action: 'add' | 'remove') => {
      if (selectedIds.length === 0) {
          toast({ title: 'Nenhum participante selecionado.', variant: 'destructive' });
          return;
      }
      setBulkActionLoading(true);
      const result = await setBulkPresence(formacao.id, selectedIds, dateFilter, periodo, action);
      setBulkActionLoading(false);

      if (result.error) {
          toast({ title: 'Erro na ação em lote', description: result.error, variant: 'destructive' });
      } else if (result.success && result.updatedPresence) {
          toast({
              title: 'Sucesso!',
              description: `Ação em lote concluída. A tabela foi atualizada.`,
          });
          setPresenceCache(prev => ({ ...prev, ...result.updatedPresence }));
          setChartPresenceCache(prev => ({ ...prev, ...result.updatedPresence }));
          setSelectedIds([]);
      } else {
          toast({ title: 'Erro', description: 'Não foi possível atualizar as presenças.', variant: 'destructive' });
      }
  }


  const regionalStats = useMemo(() => {
    const stats: { [key: string]: { inscritos: number; presentes: number; avulsos: number } } = {};
    
    allParticipants.forEach(p => {
      let regional = p.dados?.regional || 'N/A';
      if (regional === 'PARAÍSO DO TOCANTINS') regional = 'PARAÍSO';
      
      if (!stats[regional]) {
        stats[regional] = { inscritos: 0, presentes: 0, avulsos: 0 };
      }

      const presences = chartPresenceCache[p.id];
      if (!presences) {
        return;
      }

      const daily = presences.find(pr => pr.date === dateFilter);
      const isPresente = !!daily?.matutino || !!daily?.vespertino;

      if (p.fonte === 'AVULSO') {
        if (isPresente) stats[regional].avulsos++;
      } else {
        stats[regional].inscritos++;
        if (isPresente) stats[regional].presentes++;
      }
    });

    const comparecimentoData = Object.entries(stats).map(([name, data]) => ({ name, taxaComparecimento: data.inscritos > 0 ? (data.presentes / data.inscritos) * 100 : 0 })).sort((a, b) => b.taxaComparecimento - a.taxaComparecimento).slice(0, 10);
    const avulsosData = Object.entries(stats).map(([name, data]) => ({ name, avulsos: data.avulsos })).filter(item => item.avulsos > 0).sort((a, b) => b.avulsos - a.avulsos).slice(0, 10);
      
    return { comparecimentoData, avulsosData };
  }, [allParticipants, dateFilter, chartPresenceCache]);


  const handleExport = () => {
    const dataToExport: any[] = [];
    
    const sortedDates = (formacao.dates || [])
        .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .map((d: any) => d.date.substring(0, 10));

    allParticipants.forEach(participant => {
        const presences = chartPresenceCache[participant.id];
        
        sortedDates.forEach(dateStr => {
            const dailyPresence = presences?.find(p => p.date === dateStr);
            
            dataToExport.push({
                'Nome Completo': participant.nome_completo,
                'CPF': participant.cpf,
                'Regional': participant.dados?.regional || 'N/A',
                'Inscrição Antecipada': participant.fonte !== 'AVULSO' ? 'SIM' : 'NÃO',
                'Data': format(parseISO(dateStr), "dd/MM/yyyy"),
                'Presença Manhã': dailyPresence?.matutino ? 'PRESENTE' : 'AUSENTE',
                'Presença Tarde': dailyPresence?.vespertino ? 'PRESENTE' : 'AUSENTE',
            });
        });
    });

    if (dataToExport.length === 0) {
      toast({ title: 'Nenhum dado para exportar', description: 'Não há participantes ou dados de presença para gerar o arquivo.', variant: 'destructive'});
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Frequência");
    
    // Auto-size columns
    const headers = Object.keys(dataToExport[0]);
    const columnWidths = headers.map(header => ({
        wch: Math.max(
            header.length,
            ...dataToExport.map(row => (row[header] || '').toString().length)
        ) + 2
    }));
    worksheet["!cols"] = columnWidths;

    XLSX.writeFile(workbook, `relatorio_frequencia_${formacao.name.replace(/ /g, '_')}.xlsx`);
  };


  const PresenceStatus = ({ participantId, periodo, presence }: { participantId: string; periodo: 'MAT' | 'VESP'; presence: PresenceData | null; }) => {
    const loadingKey = `${participantId}-${periodo}-${dateFilter}`;
    const isLoading = togglingPresence === loadingKey;
    const isManual = presence?.source === false;
    const isAutomatic = presence?.source === true;
  
    const timestamp = useMemo(() => {
      if (!presence?.registered_at) return null;
      return toZonedTime(new Date(presence.registered_at), saoPauloTimeZone).toLocaleTimeString('pt-BR');
    }, [presence?.registered_at]);      
  
    const handleToggle = async () => {
      setTogglingPresence(loadingKey);
      const result = await setManualPresence(participantId, formacao.id, dateFilter, periodo);
      
      if (result?.error) {
        toast({ title: 'Erro', description: result.error, variant: 'destructive' });
      } else if (result.success && result.updatedPresence) {
        toast({ title: 'Sucesso', description: presence ? 'Presença removida.' : 'Presença adicionada.' });
        
        setPresenceCache(prevCache => ({
            ...prevCache,
            ...result.updatedPresence,
        }));
        setChartPresenceCache(prevCache => ({
            ...prevCache,
            ...result.updatedPresence,
        }));
      } else {
        toast({ title: 'Erro', description: 'Não foi possível atualizar a presença. Resposta inesperada do servidor.', variant: 'destructive' });
      }
       setTogglingPresence(null);
    };
  
    if (isLoading) {
      return <Loader2 className="h-5 w-5 animate-spin mx-auto" />;
    }
  
    if (isAutomatic) {
      return (
        <div className="flex items-center justify-center gap-2 text-green-600">
          <CheckCircle className="h-5 w-5" title="Presença automática (não pode ser alterada)" />
          {timestamp && <span className="text-xs">{timestamp}</span>}
        </div>
      );
    }
  
    if (isManual) {
      return (
        <button onClick={handleToggle} className="flex items-center justify-center gap-2 text-orange-500">
          <CheckCircle className="h-5 w-5" />
          {timestamp && <span className="text-xs">{timestamp}</span>}
        </button>
      );
    }
  
    return <button onClick={handleToggle}><XCircle className="h-5 w-5 text-red-500" /></button>;
  };
  
  const BulkActionBar = () => (
    <Card className="mb-4 sticky top-2 z-20 bg-background/95 backdrop-blur-sm shadow-lg">
        <CardContent className="p-2 flex items-center justify-between">
            <p className="text-sm font-medium">{selectedIds.length} selecionado(s)</p>
            <div className="flex items-center gap-2">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" disabled={bulkActionLoading}>
                            {bulkActionLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Sun className="mr-2 h-4 w-4" />}
                            Ações Manhã
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => handleBulkAction('MAT', 'add')}>
                            Adicionar Presença
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleBulkAction('MAT', 'remove')} className="text-destructive focus:text-destructive">
                           <Trash2 className="mr-2 h-4 w-4"/> Remover Presença (Manual)
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" disabled={bulkActionLoading}>
                             {bulkActionLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Sunset className="mr-2 h-4 w-4" />}
                            Ações Tarde
                        </Button>
                    </DropdownMenuTrigger>
                     <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => handleBulkAction('VESP', 'add')}>
                            Adicionar Presença
                        </DropdownMenuItem>
                         <DropdownMenuItem onClick={() => handleBulkAction('VESP', 'remove')} className="text-destructive focus:text-destructive">
                           <Trash2 className="mr-2 h-4 w-4"/> Remover Presença (Manual)
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </CardContent>
    </Card>
);

  return (
    <div className="space-y-6">
        <Card>
            <CardHeader>
                <CardTitle>Relatório Detalhado de Participação</CardTitle>
                <CardDescription>Análise de presença para: <span className="font-semibold">{formacao.name}</span></CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex flex-wrap items-end gap-4">
                    <div className="flex-1 min-w-[200px]"><Label htmlFor="date-filter">Data</Label><Select value={dateFilter} onValueChange={setDateFilter}><SelectTrigger id="date-filter"><SelectValue /></SelectTrigger><SelectContent>{dateOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent></Select></div>
                    <div className="flex-1 min-w-[250px]"><Label htmlFor="search">Buscar por Nome ou CPF</Label><Input id="search" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Digite para buscar..." /></div>
                    <div className="flex-1 min-w-[150px]"><Label htmlFor="presence-filter">Presença</Label><Select value={presenceFilter} onValueChange={setPresenceFilter}><SelectTrigger id="presence-filter"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos</SelectItem><SelectItem value="manha">Só Manhã</SelectItem><SelectItem value="tarde">Só Tarde</SelectItem><SelectItem value="ambos">Ambos</SelectItem><SelectItem value="nenhum">Nenhuma</SelectItem></SelectContent></Select></div>
                    <div className="flex-1 min-w-[150px]"><Label htmlFor="source-filter">Origem</Label><Select value={sourceFilter} onValueChange={setSourceFilter}><SelectTrigger id="source-filter"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos</SelectItem><SelectItem value="inscrito">Inscrito</SelectItem><SelectItem value="avulso">Avulso</SelectItem></SelectContent></Select></div>
                </div>
            </CardContent>
        </Card>

        {selectedIds.length > 0 && <BulkActionBar />}

        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Participantes</CardTitle>
                <CardDescription>
                  Lista de todos os {initialParticipants.length} participantes inscritos. Use os filtros para analisar a presença.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleExport} disabled={loadingPresence || loadingCharts}>
                    <FileDown className="mr-2 h-4 w-4" />
                    Exportar XLSX
                </Button>
                <Button variant="ghost" size="icon" onClick={() => { setPresenceCache({}); fetchAllPresenceData(); }} disabled={loadingPresence || loadingCharts}><RefreshCw className={`h-4 w-4 ${(loadingPresence || loadingCharts) ? 'animate-spin' : ''}`} /></Button>
              </div>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12">
                              <Checkbox
                                  checked={paginatedParticipants.filter(p => !p.isUnselectable).length > 0 && selectedIds.length === paginatedParticipants.filter(p => !p.isUnselectable).length}
                                  onCheckedChange={(checked) => handleSelectAll(checked)}
                                  aria-label="Select all rows on this page"
                              />
                            </TableHead>
                            <TableHead>Nome</TableHead>
                            <TableHead>CPF</TableHead>
                            <TableHead>Regional</TableHead>
                            <TableHead className="text-center">Presença Manhã</TableHead>
                            <TableHead className="text-center">Presença Tarde</TableHead>
                            <TableHead>Fonte</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loadingPresence && paginatedParticipants.length === 0 ? (
                                <TableRow><TableCell colSpan={7} className="text-center h-24"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></TableCell></TableRow>
                            ) : paginatedParticipants.length > 0 ? paginatedParticipants.map(p => (
                                <TableRow key={p.id} data-state={selectedIds.includes(p.id) ? 'selected' : ''}>
                                    <TableCell>
                                      <Checkbox
                                          checked={selectedIds.includes(p.id)}
                                          onCheckedChange={(checked) => handleSelectRow(p.id, !!checked)}
                                          aria-label={`Select row for ${p.nome_completo}`}
                                          disabled={p.isUnselectable}
                                      />
                                    </TableCell>
                                    <TableCell className="font-medium">{p.nome_completo}</TableCell>
                                    <TableCell>{p.cpf}</TableCell>
                                    <TableCell>{p.regional}</TableCell>
                                    <TableCell className="text-center"><PresenceStatus participantId={p.id} periodo="MAT" presence={p.presenca_matutina} /></TableCell>
                                    <TableCell className="text-center"><PresenceStatus participantId={p.id} periodo="VESP" presence={p.presenca_vespertina} /></TableCell>
                                    <TableCell><Badge variant={p.fonte === 'AVULSO' ? 'secondary' : 'default'}>{p.fonte}</Badge></TableCell>
                                </TableRow>
                            )) : (
                                <TableRow><TableCell colSpan={7} className="text-center h-24">Nenhum participante encontrado para os filtros selecionados.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
            <CardFooter>
                 <div className="flex items-center justify-between w-full">
                    <span className="text-sm text-muted-foreground">Mostrando {paginatedParticipants.length > 0 ? (currentPage - 1) * ITEMS_PER_PAGE + 1 : 0} a {Math.min(filteredParticipants.length, currentPage * ITEMS_PER_PAGE)} de {filteredParticipants.length}</span>
                    <div className="flex gap-2">
                        <Button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1 || loadingPresence}>Anterior</Button>
                        <Button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages || loadingPresence}>Próximo</Button>
                    </div>
                </div>
            </CardFooter>
        </Card>
        
        <Card className="mt-6">
            <CardHeader>
                <CardTitle>Análise de Dados</CardTitle>
                <CardDescription>Gráficos baseados no total de {allParticipants.length} participantes da formação.</CardDescription>
            </CardHeader>
             {loadingCharts ? (
              <CardContent className="grid md:grid-cols-1 lg:grid-cols-2 gap-6 h-96">
                <div className="flex items-center justify-center text-muted-foreground border rounded-lg"><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Carregando gráficos...</div>
                <div className="flex items-center justify-center text-muted-foreground border rounded-lg"><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Carregando gráficos...</div>
              </CardContent>
            ) : (
              <CardContent className="grid md:grid-cols-1 lg:grid-cols-2 gap-6">
                  <RankingChart data={regionalStats.comparecimentoData} dataKey="taxaComparecimento" unit="%" title="Taxa de Comparecimento (Inscritos)" description="Percentual de inscritos que registraram presença, por regional." showLabel={true}/>
                  <RankingChart data={regionalStats.avulsosData} dataKey="avulsos" unit="" title="Participantes Avulsos" description="Total de participantes não inscritos que registraram presença, por regional."/>
              </CardContent>
            )}
        </Card>
    </div>
  );
}
