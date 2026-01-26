'use client';

import { useState, useMemo } from 'react';
import type { Formacao } from '@/lib/types';
import type { MetricasData } from './actions';
import { getMetricasGerais } from './actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, ChevronsUpDown, Loader2, Users, Star, UserX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, Cell } from 'recharts';
import { useToast } from '@/hooks/use-toast';


const CHART_COLORS = ['#219EBC', '#8ECAE6', '#FFB703', '#FB8500', '#D90429', '#EF476F', '#FFD166', '#06D6A0', '#118AB2', '#073B4C'];

const RankingChart = ({ data, title, description, dataKey, nameKey, unit, valueFormatter, domainMax }: { data: any[], title: string, description: string, dataKey: string, nameKey: string, unit: string, valueFormatter: (value: any) => string, domainMax?: number }) => {
    
    const chartData = useMemo(() => data, [data]);
    const chartHeight = Math.max(400, chartData.length * 45);

    return (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
                {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={chartHeight}>
                        <BarChart data={chartData} layout="vertical" margin={{ left: 200, right: 80 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                            <XAxis type="number" domain={domainMax ? [0, domainMax] : undefined} />
                            <YAxis dataKey={nameKey} type="category" width={200} interval={0} axisLine={false} tickLine={false} />
                            <Tooltip formatter={(value) => `${valueFormatter(value)}${unit}`} cursor={{ fill: 'hsl(var(--muted))' }}/>
                            <Bar dataKey={dataKey} barSize={30} radius={[0, 4, 4, 0]}>
                               {chartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                ))}
                               <LabelList dataKey={dataKey} position="right" formatter={(value: number) => `${valueFormatter(value)}${unit}`} className="font-semibold" />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="flex items-center justify-center h-96 text-muted-foreground">
                        <p>Nenhum dado para exibir com os filtros selecionados.</p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

const MetricasSummary = ({ summary }: { summary: Pick<MetricasData, 'totalInscritos' | 'totalAvaliacoes' | 'totalNaoInscritos'>}) => (
    <div className="grid gap-4 md:grid-cols-3">
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Inscrições Totais</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{summary.totalInscritos}</div>
                <p className="text-xs text-muted-foreground">nas formações selecionadas</p>
            </CardContent>
        </Card>
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avaliações Recebidas</CardTitle>
                <Star className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{summary.totalAvaliacoes}</div>
                <p className="text-xs text-muted-foreground">contabilizadas para o ranking</p>
            </CardContent>
        </Card>
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Inscritos não Previstos</CardTitle>
                <UserX className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{summary.totalNaoInscritos}</div>
                <p className="text-xs text-muted-foreground">registrados no local</p>
            </CardContent>
        </Card>
    </div>
);


export function MetricasClient({ finishedFormacoes }: MetricasClientProps) {
    const { toast } = useToast();
    const [open, setOpen] = useState(false);
    const [selectedFormacoes, setSelectedFormacoes] = useState<Pick<Formacao, 'id' | 'name'>[]>([]);
    const [loading, setLoading] = useState(false);
    const [metricas, setMetricas] = useState<MetricasData | null>(null);

    const handleGenerate = async () => {
        setLoading(true);
        setMetricas(null);
        const ids = selectedFormacoes.map(f => f.id);
        const result = await getMetricasGerais(ids);
        if ('error' in result) {
            toast({
                title: "Erro ao gerar métricas",
                description: result.error,
                variant: 'destructive'
            })
        } else {
            setMetricas(result);
        }
        setLoading(false);
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardContent className="pt-6 flex flex-col md:flex-row items-center gap-4">
                    <div className="w-full md:w-auto md:flex-1">
                        <Popover open={open} onOpenChange={setOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    role="combobox"
                                    aria-expanded={open}
                                    className="w-full justify-between"
                                >
                                    <span className="truncate">
                                        {selectedFormacoes.length > 0 ? `${selectedFormacoes.length} formação(ões) selecionada(s)` : "Selecione as formações..."}
                                    </span>
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                                <Command>
                                    <CommandInput placeholder="Buscar formação..." />
                                    <CommandList>
                                        <CommandEmpty>Nenhuma formação encontrada.</CommandEmpty>
                                        <CommandGroup>
                                            {finishedFormacoes.map((formacao) => (
                                                <CommandItem
                                                    key={formacao.id}
                                                    onSelect={() => {
                                                        const isSelected = selectedFormacoes.some(sf => sf.id === formacao.id);
                                                        if (isSelected) {
                                                            setSelectedFormacoes(selectedFormacoes.filter(sf => sf.id !== formacao.id));
                                                        } else {
                                                            setSelectedFormacoes([...selectedFormacoes, formacao]);
                                                        }
                                                    }}
                                                >
                                                    <Check className={cn("mr-2 h-4 w-4", selectedFormacoes.some(sf => sf.id === formacao.id) ? "opacity-100" : "opacity-0")} />
                                                    {formacao.name}
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                         <div className="pt-2 flex flex-wrap gap-1">
                            {selectedFormacoes.map(f => (
                                <Badge key={f.id} variant="secondary" className="truncate">{f.name}</Badge>
                            ))}
                        </div>
                    </div>
                    <Button onClick={handleGenerate} disabled={loading || selectedFormacoes.length === 0} className="w-full md:w-auto">
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Gerar Métricas
                    </Button>
                </CardContent>
            </Card>

            {loading && (
                 <div className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-3">
                        <Skeleton className="h-[108px] w-full" />
                        <Skeleton className="h-[108px] w-full" />
                        <Skeleton className="h-[108px] w-full" />
                    </div>
                    <Skeleton className="h-[30rem] w-full" />
                    <Skeleton className="h-[30rem] w-full" />
                    <Skeleton className="h-[30rem] w-full" />
                 </div>
            )}
            
            {metricas && (
                <div className="space-y-6">
                     <MetricasSummary summary={metricas} />

                    <RankingChart
                        data={metricas.topFormadores}
                        title="Top Formadores"
                        description="Ranking dos formadores com as melhores médias de avaliação, com base nas formações selecionadas."
                        dataKey="average"
                        nameKey="name"
                        unit="/5.0"
                        valueFormatter={(v) => Number(v).toFixed(2)}
                        domainMax={5}
                    />
                     <RankingChart
                        data={metricas.comparecimentoRegional}
                        title="Taxa de Comparecimento por Regional"
                        description="Percentual de participantes inscritos que registraram presença, agrupados por regional."
                        dataKey="taxa"
                        nameKey="regional"
                        unit="%"
                        valueFormatter={(v) => Number(v).toFixed(1)}
                        domainMax={100}
                    />
                     <RankingChart
                        data={metricas.naoInscritosRegional}
                        title="Ranking de Regionais por Inscritos não Previstos"
                        description="Número de participantes que se registraram no dia do evento (não inscritos previamente), por regional."
                        dataKey="total"
                        nameKey="regional"
                        unit=""
                        valueFormatter={(v) => Number(v).toFixed(0)}
                    />
                </div>
            )}
        </div>
    );
}

