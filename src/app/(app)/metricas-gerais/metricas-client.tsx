'use client';

import { useState, useMemo } from 'react';
import type { Formacao } from '@/lib/types';
import type { MetricasData } from './actions';
import { getMetricasGerais } from './actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from 'recharts';
import { useToast } from '@/hooks/use-toast';

type MetricasClientProps = {
    finishedFormacoes: Pick<Formacao, 'id' | 'name'>[];
};

const RankingChart = ({ data, title, description, dataKey, nameKey, unit, valueFormatter }: { data: any[], title: string, description: string, dataKey: string, nameKey: string, unit: string, valueFormatter: (value: any) => string }) => {
    
    const chartData = useMemo(() => data.slice(0, 10).reverse(), [data]);

    return (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
                {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={400}>
                        <BarChart data={chartData} layout="vertical" margin={{ left: 120, right: 30 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                            <XAxis type="number" domain={[0, 'dataMax + 10']} />
                            <YAxis dataKey={nameKey} type="category" width={120} interval={0} />
                            <Tooltip formatter={(value) => `${valueFormatter(value)}${unit}`} />
                            <Bar dataKey={dataKey} fill="var(--chart-1)" barSize={30}>
                               <LabelList dataKey={dataKey} position="right" formatter={(value: number) => `${valueFormatter(value)}${unit}`} />
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
                 <div className="grid gap-6 md:grid-cols-1">
                    <Skeleton className="h-[30rem] w-full" />
                    <Skeleton className="h-[30rem] w-full" />
                    <Skeleton className="h-[30rem] w-full" />
                 </div>
            )}
            
            {metricas && (
                <div className="grid gap-6">
                    <RankingChart
                        data={metricas.topFormadores}
                        title="Top Formadores"
                        description="Ranking dos formadores com as melhores médias de avaliação, com base nas formações selecionadas."
                        dataKey="average"
                        nameKey="name"
                        unit="/5.0"
                        valueFormatter={(v) => Number(v).toFixed(2)}
                    />
                     <RankingChart
                        data={metricas.comparecimentoRegional}
                        title="Taxa de Comparecimento por Regional"
                        description="Percentual de participantes inscritos que registraram presença, agrupados por regional."
                        dataKey="taxa"
                        nameKey="regional"
                        unit="%"
                        valueFormatter={(v) => Number(v).toFixed(1)}
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
