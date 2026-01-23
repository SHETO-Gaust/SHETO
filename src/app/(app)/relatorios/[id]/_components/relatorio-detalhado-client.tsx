'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { ptBR } from 'date-fns/locale';
import type { Formacao } from '@/lib/types';
import type { DetailedParticipant } from '../../actions';
import { setManualPresence } from '../../actions';
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
  Cell
} from "recharts";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import { Label } from '@/components/ui/label';

type PresenceData = {
  registered_at: string;
  source: boolean; // true for AUTOMATIC, false for MANUAL
};

type RelatorioDetalhadoClientProps = {
  formacao: Formacao;
  participants: DetailedParticipant[];
};

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8", "#82ca9d"];
const saoPauloTimeZone = 'America/Sao_Paulo';

const RankingChart = ({
  data,
  dataKey,
  unit,
  title,
  description
}: {
  data: any[];
  dataKey: string;
  unit: string;
  title: string;
  description: string;
}) => (
  <Card>
    <CardHeader>
      <CardTitle className="truncate">{title}</CardTitle>
      <CardDescription>{description}</CardDescription>
    </CardHeader>
    <CardContent>
      {data.length > 0 ? (
        <ChartContainer config={{}} className="h-80 w-full">
          <ResponsiveContainer>
            <BarChart data={data} layout="vertical" margin={{ left: 120, right: 30 }}>
              <XAxis type="number" dataKey={dataKey} unit={unit} tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12 }} interval={0} />
              <Tooltip
                cursor={{ fill: 'hsl(var(--secondary))' }}
                content={<ChartTooltipContent />}
              />
              <Bar dataKey={dataKey} radius={[0, 4, 4, 0]}>
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

export function RelatorioDetalhadoClient({ formacao, participants }: RelatorioDetalhadoClientProps) {
  const router = useRouter();
  const { toast } = useToast();

  console.log('[CLIENT-LOG-START] Raw data received by component:', { formacao, participants });

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
  const [togglingPresence, setTogglingPresence] = useState<string | null>(null);
  
  const ITEMS_PER_PAGE = 25;

  const filteredParticipants = useMemo(() => {
    return participants.filter(p => {
      const search = searchTerm.toLowerCase();
      const matchesSearch =
        p.nome_completo.toLowerCase().includes(search) ||
        p.cpf.includes(searchTerm);

      const daily = p.presencas.find(pr => pr.date === dateFilter);

      const hasMorning = !!daily?.matutino;
      const hasAfternoon = !!daily?.vespertino;

      let matchesPresence = true;
      if (presenceFilter === 'manha') matchesPresence = hasMorning;
      else if (presenceFilter === 'tarde') matchesPresence = hasAfternoon;
      else if (presenceFilter === 'ambos') matchesPresence = hasMorning && hasAfternoon;
      else if (presenceFilter === 'nenhum') matchesPresence = !hasMorning && !hasAfternoon;

      let matchesSource = true;
      if (sourceFilter === 'inscrito') matchesSource = p.fonte !== 'AVULSO';
      else if (sourceFilter === 'avulso') matchesSource = p.fonte === 'AVULSO';

      return matchesSearch && matchesPresence && matchesSource;
    });
  }, [participants, searchTerm, presenceFilter, sourceFilter, dateFilter]);

  useEffect(() => {
    setCurrentPage(1);
     console.log('[CLIENT-LOG-FILTERS] Filters updated:', { dateFilter, presenceFilter, sourceFilter, searchTerm, currentPage });
  }, [searchTerm, presenceFilter, sourceFilter, dateFilter]);

  const { paginatedParticipants, totalPages } = useMemo(() => {
    const totalPages = Math.ceil(filteredParticipants.length / ITEMS_PER_PAGE);
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const paginated = filteredParticipants.slice(start, start + ITEMS_PER_PAGE);

    const participantsForView = paginated.map(p => {
        console.log(`[CLIENT-LOG-PROCESSING] Processing participant: ${p.nome_completo} (CPF: ${p.cpf}) for date: ${dateFilter}`);
        console.log(`[CLIENT-LOG-PROCESSING] Full presences array for participant:`, p.presencas);
        
        const daily = p.presencas.find(pr => pr.date === dateFilter);
        
        console.log(`[CLIENT-LOG-PROCESSING] Found daily presence object for date ${dateFilter}:`, daily);

        let regional = p.dados?.regional || 'N/A';
        if (regional === 'PARAÍSO DO TOCANTINS') regional = 'PARAÍSO';

        const finalParticipantObject = {
            ...p,
            regional,
            presenca_matutina: daily?.matutino ?? null,
            presenca_vespertina: daily?.vespertino ?? null,
        };

        console.log('[CLIENT-LOG-PROCESSING] Final object for rendering:', finalParticipantObject);
        return finalParticipantObject;
    });
    
    return { paginatedParticipants: participantsForView, totalPages };
  }, [filteredParticipants, currentPage, dateFilter]);

  const regionalStats = useMemo(() => {
    const stats: { [key: string]: { inscritos: number; presentes: number; avulsos: number } } = {};

    filteredParticipants.forEach(p => {
      let regional = p.dados?.regional || 'N/A';
      if (regional === 'PARAÍSO DO TOCANTINS') regional = 'PARAÍSO';
      
      if (!stats[regional]) {
        stats[regional] = { inscritos: 0, presentes: 0, avulsos: 0 };
      }

      const daily = p.presencas.find(pr => pr.date === dateFilter);
      const isPresente = !!daily?.matutino || !!daily?.vespertino;

      if (p.fonte === 'AVULSO') {
        if (isPresente) {
          stats[regional].avulsos++;
        }
      } else { // 'Inscrito' or other
        stats[regional].inscritos++;
        if (isPresente) {
          stats[regional].presentes++;
        }
      }
    });

    const commitmentData = Object.entries(stats)
      .map(([name, data]) => ({
        name,
        taxaComprometimento: data.inscritos > 0 ? (data.presentes / data.inscritos) * 100 : 0,
      }))
      .sort((a, b) => b.taxaComprometimento - a.taxaComprometimento)
      .slice(0, 10);

    const avulsosData = Object.entries(stats)
      .map(([name, data]) => ({
        name,
        avulsos: data.avulsos,
      }))
      .filter(item => item.avulsos > 0)
      .sort((a, b) => b.avulsos - a.avulsos)
      .slice(0, 10);
      
    return { commitmentData, avulsosData };
  }, [filteredParticipants, dateFilter]);


  const PresenceStatus = ({
    participantId,
    periodo,
    presence
  }: {
    participantId: string;
    periodo: 'MAT' | 'VESP';
    presence: PresenceData | null;
  }) => {
    const loadingKey = `${participantId}-${periodo}-${dateFilter}`;
    const isLoading = togglingPresence === loadingKey;
  
    // source: false is MANUAL
    // source: true is AUTOMATIC
    const isManual = presence?.source === false;
  
      const timestamp = useMemo(() => {
        if (!presence?.registered_at) return null;
      
        return toZonedTime(new Date(presence.registered_at), saoPauloTimeZone).toLocaleTimeString('pt-BR');
      }, [presence?.registered_at]);      
  
    const handleToggle = async () => {
      // Don't allow removing automatic presence
      if (presence && !isManual) {
        toast({
          title: 'Ação não permitida',
          description: 'Presenças automáticas não podem ser removidas.',
        });
        return;
      }
  
      setTogglingPresence(loadingKey);
      
      const result = await setManualPresence(
        participantId,
        formacao.id,
        dateFilter,
        periodo
      );
  
      if (result?.error) {
        toast({
          title: 'Erro',
          description: result.error,
          variant: 'destructive'
        });
      } else {
        toast({
          title: 'Sucesso',
          description: presence
            ? 'Presença removida.'
            : 'Presença adicionada.',
        });
        router.refresh();
      }
  
      setTogglingPresence(null);
    };
  
    if (isLoading) {
      return <Loader2 className="h-5 w-5 animate-spin" />;
    }
  
    // ❌ Sem presença
    if (!presence) {
      return (
        <button onClick={handleToggle}>
          <XCircle className="h-5 w-5 text-red-500" />
        </button>
      );
    }
  
    // ✔ Presença MANUAL (clicável)
    if (isManual) {
      return (
        <button
          onClick={handleToggle}
          className="flex items-center justify-center gap-2 text-orange-500"
        >
          <CheckCircle className="h-5 w-5" />
          {timestamp && <span className="text-xs">{timestamp}</span>}
        </button>
      );
    }
  
    // ✔ Presença AUTOMÁTICA (não clicável)
    return (
      <div className="flex items-center justify-center gap-2 text-green-600">
        <CheckCircle className="h-5 w-5" />
        {timestamp && <span className="text-xs">{timestamp}</span>}
      </div>
    );
  };
  
  return (
    <div className="space-y-6">
        <Card>
            <CardHeader>
                <CardTitle>Relatório Detalhado de Participação</CardTitle>
                <CardDescription>
                    Análise de presença para: <span className="font-semibold">{formacao.name}</span>
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex flex-wrap items-end gap-4">
                    <div className="flex-1 min-w-[200px]">
                        <Label htmlFor="date-filter">Data</Label>
                        <Select value={dateFilter} onValueChange={setDateFilter}>
                            <SelectTrigger id="date-filter"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {dateOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex-1 min-w-[250px]">
                        <Label htmlFor="search">Buscar por Nome ou CPF</Label>
                        <Input id="search" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Digite para buscar..." />
                    </div>
                    <div className="flex-1 min-w-[150px]">
                        <Label htmlFor="presence-filter">Presença</Label>
                        <Select value={presenceFilter} onValueChange={setPresenceFilter}>
                            <SelectTrigger id="presence-filter"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="todos">Todos</SelectItem>
                                <SelectItem value="manha">Só Manhã</SelectItem>
                                <SelectItem value="tarde">Só Tarde</SelectItem>
                                <SelectItem value="ambos">Ambos</SelectItem>
                                <SelectItem value="nenhum">Nenhuma</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex-1 min-w-[150px]">
                        <Label htmlFor="source-filter">Origem</Label>
                        <Select value={sourceFilter} onValueChange={setSourceFilter}>
                            <SelectTrigger id="source-filter"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="todos">Todos</SelectItem>
                                <SelectItem value="inscrito">Inscrito</SelectItem>
                                <SelectItem value="avulso">Avulso</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </CardContent>
        </Card>

        <Card>
            <CardHeader>
                <CardTitle>Participantes</CardTitle>
                <CardDescription>
                    Lista de participantes com detalhes de presença.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Nome</TableHead>
                                <TableHead>CPF</TableHead>
                                <TableHead>Regional</TableHead>
                                <TableHead className="text-center">Presença Manhã</TableHead>
                                <TableHead className="text-center">Presença Tarde</TableHead>
                                <TableHead>Fonte</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {paginatedParticipants.length > 0 ? paginatedParticipants.map(p => (
                                <TableRow key={p.id}>
                                    <TableCell className="font-medium">{p.nome_completo}</TableCell>
                                    <TableCell>{p.cpf}</TableCell>
                                    <TableCell>{p.regional}</TableCell>
                                    <TableCell className="text-center">
                                        <PresenceStatus participantId={p.id} periodo="MAT" presence={p.presenca_matutina} />
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <PresenceStatus participantId={p.id} periodo="VESP" presence={p.presenca_vespertina} />
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={p.fonte === 'AVULSO' ? 'secondary' : 'default'}>
                                            {p.fonte}
                                        </Badge>
                                    </TableCell>
                                </TableRow>
                            )) : (
                                <TableRow><TableCell colSpan={6} className="text-center h-24">Nenhum participante encontrado para os filtros selecionados.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
            <CardFooter>
                 <div className="flex items-center justify-between w-full">
                    <span className="text-sm text-muted-foreground">
                        Mostrando {Math.min(filteredParticipants.length, (currentPage - 1) * ITEMS_PER_PAGE + 1)} a {Math.min(filteredParticipants.length, currentPage * ITEMS_PER_PAGE)} de {filteredParticipants.length}
                    </span>
                    <div className="flex gap-2">
                        <Button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>Anterior</Button>
                        <Button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Próximo</Button>
                    </div>
                </div>
            </CardFooter>
        </Card>
        
        <Card className="mt-6">
            <CardHeader>
                <CardTitle>Análise de Dados</CardTitle>
            </CardHeader>
            <CardContent className="grid md:grid-cols-1 lg:grid-cols-2 gap-6">
                <RankingChart
                    data={regionalStats.commitmentData}
                    dataKey="taxaComprometimento"
                    unit="%"
                    title="Taxa de Comprometimento (Inscritos)"
                    description="Este gráfico mede a eficiência de cada regional em mobilizar seus próprios servidores. Ele calcula a porcentagem de participantes que se inscreveram previamente na formação e que efetivamente registraram presença."
                />
                <RankingChart
                    data={regionalStats.avulsosData}
                    dataKey="avulsos"
                    unit=""
                    title="Participantes Avulsos"
                    description="Este gráfico mostra o número total de participantes que compareceram à formação sem terem feito uma inscrição prévia. Este dado é útil para medir o interesse espontâneo e o alcance que a formação gerou em cada localidade."
                />
            </CardContent>
        </Card>
    </div>
  );
}
