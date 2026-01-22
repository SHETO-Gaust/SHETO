'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Formacao } from '@/lib/types';
import type { DetailedParticipant } from '../../actions';
import { setManualPresence } from '../../actions';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Cell } from "recharts";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";

type RelatorioDetalhadoClientProps = {
    formacao: Formacao;
    participants: DetailedParticipant[];
};

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8", "#82ca9d"];

const RankingChart = ({ data, dataKey, unit, title, description }: { data: any[], dataKey: string, unit: string, title: string, description: string }) => (
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
                               {data.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
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
    const [searchTerm, setSearchTerm] = useState('');
    const [presenceFilter, setPresenceFilter] = useState('todos'); // todos, manha, tarde, ambos, nenhum
    const [sourceFilter, setSourceFilter] = useState('todos'); // todos, inscrito, avulso
    const [dateFilter, setDateFilter] = useState('todos');
    const [currentPage, setCurrentPage] = useState(1);
    const [togglingPresence, setTogglingPresence] = useState<string | null>(null);
    
    const router = useRouter();
    const { toast } = useToast();
    const ITEMS_PER_PAGE = 25;

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        if (/[a-zA-Z]/.test(value)) {
            setSearchTerm(value);
            return;
        }
        const numbers = value.replace(/\D/g, '');
        const formattedCpf = numbers
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d{1,2})/, '$1-$2')
            .slice(0, 14);
        
        setSearchTerm(formattedCpf);
    };

    const { filteredParticipants, dateOptions } = useMemo(() => {
        const filtered = participants.filter(p => {
            const search = searchTerm.toLowerCase();
            const matchesSearch = p.nome_completo.toLowerCase().includes(search) || p.cpf.includes(searchTerm);

            const hasMorningPresence = dateFilter === 'todos' ? p.presencas.some(pr => pr.matutino) : !!p.presencas.find(pr => pr.date === dateFilter)?.matutino;
            const hasAfternoonPresence = dateFilter === 'todos' ? p.presencas.some(pr => pr.vespertino) : !!p.presencas.find(pr => pr.date === dateFilter)?.vespertino;
            
            let matchesPresence = true;
            if (presenceFilter === 'manha') matchesPresence = hasMorningPresence;
            else if (presenceFilter === 'tarde') matchesPresence = hasAfternoonPresence;
            else if (presenceFilter === 'ambos') matchesPresence = hasMorningPresence && hasAfternoonPresence;
            else if (presenceFilter === 'nenhum') matchesPresence = !hasMorningPresence && !hasAfternoonPresence;

            let matchesSource = true;
            if (sourceFilter === 'inscrito') matchesSource = p.fonte !== 'AVULSO';
            else if (sourceFilter === 'avulso') matchesSource = p.fonte === 'AVULSO';
            
            return matchesSearch && matchesPresence && matchesSource;
        });

        const dateOpts = [
            { value: 'todos', label: 'Todos os Dias' },
            ...(formacao.dates || [])
                .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
                .map((d: any) => {
                    const date = parseISO(d.date);
                    return {
                        value: format(date, 'yyyy-MM-dd'),
                        label: format(date, "dd/MM/yyyy (EEEE)", { locale: ptBR }),
                    };
                })
        ];

        return { filteredParticipants: filtered, dateOptions: dateOpts };

    }, [participants, searchTerm, presenceFilter, sourceFilter, dateFilter, formacao.dates]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, presenceFilter, sourceFilter, dateFilter]);
    
    const { paginatedParticipants, totalPages } = useMemo(() => {
        const totalPages = Math.ceil(filteredParticipants.length / ITEMS_PER_PAGE);
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        const endIndex = startIndex + ITEMS_PER_PAGE;
        const paginated = filteredParticipants.slice(startIndex, endIndex);

        const participantsForView = paginated.map(p => {
             const dailyPresence = (dateFilter !== 'todos' && p.presencas.find(pr => pr.date === dateFilter)) || null;
            let regional = p.dados?.regional || 'N/A';
            if (regional === 'PARAÍSO DO TOCANTINS') {
                regional = 'PARAÍSO';
            }
            return {
                ...p,
                regional,
                presenca_matutina: dailyPresence?.matutino,
                presenca_vespertina: dailyPresence?.vespertino,
            };
        });


        return { paginatedParticipants: participantsForView, totalPages };
    }, [filteredParticipants, currentPage, dateFilter]);

    const regionalStats = useMemo(() => {
        const statsByRegional = new Map<string, {
            inscritosPrevistos: number;
            inscritosPresentes: number;
            avulsosPresentes: number;
        }>();

        const participantsToProcess = participants.map(p => {
            let regional = p.dados?.regional || 'N/A';
            if (regional === 'PARAÍSO DO TOCANTINS') {
                regional = 'PARAÍSO';
            }
            return {...p, regional};
        })
    
        participantsToProcess.forEach(p => {
            const regional = p.regional || 'N/A';
            if (!statsByRegional.has(regional)) {
                statsByRegional.set(regional, {
                    inscritosPrevistos: 0,
                    inscritosPresentes: 0,
                    avulsosPresentes: 0,
                });
            }
            const regionalData = statsByRegional.get(regional)!;
            
            const isPresentOnFilteredDay = dateFilter === 'todos' 
                ? p.presencas.some(pr => pr.matutino || pr.vespertino)
                : p.presencas.some(pr => pr.date === dateFilter && (pr.matutino || pr.vespertino));

    
            if (p.fonte !== 'AVULSO') {
                regionalData.inscritosPrevistos++;
                if (isPresentOnFilteredDay) {
                    regionalData.inscritosPresentes++;
                }
            } else { // 'AVULSO'
                if (isPresentOnFilteredDay) {
                    regionalData.avulsosPresentes++;
                }
            }
        });
    
        const commitmentData = Array.from(statsByRegional.entries())
            .map(([regional, data]) => ({
                name: regional,
                taxaComprometimento: data.inscritosPrevistos > 0 ? (data.inscritosPresentes / data.inscritosPrevistos) * 100 : 0,
            }))
            .sort((a, b) => b.taxaComprometimento - a.taxaComprometimento);
    
        const avulsosData = Array.from(statsByRegional.entries())
            .map(([regional, data]) => ({
                name: regional,
                avulsos: data.avulsosPresentes,
            }))
            .filter(d => d.avulsos > 0)
            .sort((a, b) => b.avulsos - a.avulsos);
        
        return { commitmentData, avulsosData };
    }, [participants, dateFilter]);


    const PresenceStatus = ({ 
        participantId, 
        periodo, 
        presence 
    }: { 
        participantId: string, 
        periodo: 'MAT' | 'VESP', 
        presence: { registered_at: string; source: string; } | null 
    }) => {
        const isEditable = dateFilter !== 'todos';
        const loadingKey = `${participantId}-${periodo}-${dateFilter}`;
        const isLoading = togglingPresence === loadingKey;

        const handleToggle = async () => {
            if (!isEditable || (presence && presence.source === 'AUTOMATIC')) {
                if (presence && presence.source === 'AUTOMATIC') {
                    toast({ title: 'Ação não permitida', description: 'Não é possível remover uma presença registrada automaticamente pelo participante.', variant: 'default' });
                }
                return;
            }
            setTogglingPresence(loadingKey);
            const result = await setManualPresence(participantId, formacao.id, dateFilter, periodo);
            
            if (result.error) {
                toast({ title: "Erro", description: result.error, variant: 'destructive' });
            } else {
                 toast({ title: "Sucesso!", description: `Presença ${presence ? 'removida' : 'adicionada'} com sucesso.` });
                 router.refresh();
            }

            setTogglingPresence(null);
        };

        if (isLoading) {
            return <Loader2 className="h-5 w-5 animate-spin" />;
        }
        
        if (presence) {
            const timestamp = format(parseISO(presence.registered_at), 'HH:mm');
            if (presence.source === 'MANUAL') {
                return (
                    <button onClick={handleToggle} disabled={!isEditable} className="flex items-center justify-center gap-2 text-orange-500 disabled:cursor-not-allowed">
                        <CheckCircle className="h-5 w-5" />
                        <span className="text-xs">{timestamp}</span>
                    </button>
                );
            }
            return (
                <div className="flex items-center justify-center gap-2 text-green-600">
                    <CheckCircle className="h-5 w-5" />
                    <span className="text-xs">{timestamp}</span>
                </div>
            );
        }
        return (
            <button onClick={handleToggle} disabled={!isEditable} className="disabled:cursor-not-allowed">
                <XCircle className="h-5 w-5 text-red-500" />
            </button>
        );
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Relatório Analítico de Participação</CardTitle>
                    <CardDescription>Análise detalhada da participação para a formação: {formacao.name}</CardDescription>
                </CardHeader>
            </Card>

            <Card>
                <CardHeader>
                    <div className="flex flex-col md:flex-row gap-4 justify-between">
                        <Input
                            placeholder="Buscar por nome ou CPF..."
                            value={searchTerm}
                            onChange={handleSearchChange}
                            className="max-w-sm"
                        />
                        <div className="flex flex-col sm:flex-row gap-4">
                            <Select value={dateFilter} onValueChange={setDateFilter}>
                                <SelectTrigger className="w-full sm:w-[220px]">
                                    <SelectValue placeholder="Filtrar por data" />
                                </SelectTrigger>
                                <SelectContent>
                                    {dateOptions.map(opt => (
                                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                             <Select value={presenceFilter} onValueChange={setPresenceFilter}>
                                <SelectTrigger className="w-full sm:w-[180px]">
                                    <SelectValue placeholder="Filtrar por presença" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="todos">Toda a presença</SelectItem>
                                    <SelectItem value="manha">Presente (Manhã)</SelectItem>
                                    <SelectItem value="tarde">Presente (Tarde)</SelectItem>
                                    <SelectItem value="ambos">Presente (Ambos)</SelectItem>
                                    <SelectItem value="nenhum">Ausente (Ambos)</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select value={sourceFilter} onValueChange={setSourceFilter}>
                                <SelectTrigger className="w-full sm:w-[180px]">
                                    <SelectValue placeholder="Filtrar por origem" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="todos">Toda a origem</SelectItem>
                                    <SelectItem value="inscrito">Inscrito</SelectItem>
                                    <SelectItem value="avulso">Avulso</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nome</TableHead>
                                    <TableHead>CPF</TableHead>
                                    <TableHead>Regional</TableHead>
                                    <TableHead className="text-center">Origem</TableHead>
                                    <TableHead className="text-center">Presença Manhã</TableHead>
                                    <TableHead className="text-center">Presença Tarde</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {paginatedParticipants.length > 0 ? (
                                    paginatedParticipants.map(p => (
                                        <TableRow key={p.id}>
                                            <TableCell className="font-medium">{p.nome_completo}</TableCell>
                                            <TableCell>{p.cpf}</TableCell>
                                            <TableCell>{p.regional}</TableCell>
                                            <TableCell className="text-center">
                                                <Badge variant={p.fonte === 'AVULSO' ? 'secondary' : 'outline'}>
                                                    {p.fonte === 'AVULSO' ? 'Avulso' : 'Inscrito'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-center"><PresenceStatus participantId={p.id} periodo="MAT" presence={p.presenca_matutina} /></TableCell>
                                            <TableCell className="text-center"><PresenceStatus participantId={p.id} periodo="VESP" presence={p.presenca_vespertina} /></TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-24 text-center">Nenhum participante encontrado com os filtros aplicados.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                     <div className="flex items-center justify-between mt-4">
                        <p className="text-sm text-muted-foreground">
                            Mostrando {paginatedParticipants.length} de {filteredParticipants.length} participantes.
                        </p>
                       {totalPages > 1 && (
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                    disabled={currentPage === 1}
                                >
                                    Anterior
                                </Button>
                                <span className="text-sm text-muted-foreground">
                                    Página {currentPage} de {totalPages}
                                </span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                    disabled={currentPage === totalPages}
                                >
                                    Próxima
                                </Button>
                            </div>
                       )}
                    </div>
                </CardContent>
            </Card>

             <Card className="mt-6">
                <CardHeader>
                    <CardTitle>Ranking de Comprometimento por Regional</CardTitle>
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
