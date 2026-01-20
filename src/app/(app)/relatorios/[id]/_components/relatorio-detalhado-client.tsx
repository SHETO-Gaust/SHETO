'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle, XCircle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Formacao } from '@/lib/types';
import type { DetailedParticipant } from '../../actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type RelatorioDetalhadoClientProps = {
    formacao: Formacao;
    participants: DetailedParticipant[];
};

export function RelatorioDetalhadoClient({ formacao, participants }: RelatorioDetalhadoClientProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [presenceFilter, setPresenceFilter] = useState('todos'); // todos, manha, tarde, ambos, nenhum
    const [sourceFilter, setSourceFilter] = useState('todos'); // todos, inscrito, avulso
    const [dateFilter, setDateFilter] = useState('todos');
    const [currentPage, setCurrentPage] = useState(1);

    const ITEMS_PER_PAGE = 25;

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        // If value contains letters, it's a name search, do nothing special
        if (/[a-zA-Z]/.test(value)) {
            setSearchTerm(value);
            return;
        }

        // Otherwise, assume it's a CPF and format it
        const numbers = value.replace(/\D/g, '');
        const formattedCpf = numbers
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d{1,2})/, '$1-$2')
            .slice(0, 14);
        
        setSearchTerm(formattedCpf);
    };

    const { filteredParticipants, dateOptions } = useMemo(() => {
        const preparedParticipants = participants.map(p => {
            let presenca_matutina: string | null = null;
            let presenca_vespertina: string | null = null;

            if (dateFilter === 'todos') {
                // Consolidate: find first presence for each period across all days
                presenca_matutina = p.presencas.find(pr => pr.matutino)?.matutino || null;
                presenca_vespertina = p.presencas.find(pr => pr.vespertino)?.vespertino || null;
            } else {
                const dailyData = p.presencas.find(pr => pr.date === dateFilter);
                presenca_matutina = dailyData?.matutino || null;
                presenca_vespertina = dailyData?.vespertino || null;
            }

            return {
                ...p,
                regional: p.dados?.regional || 'N/A',
                presenca_matutina,
                presenca_vespertina,
            };
        });

        const filtered = preparedParticipants.filter(p => {
            // Search filter
            const search = searchTerm.toLowerCase();
            const matchesSearch = p.nome_completo.toLowerCase().includes(search) || p.cpf.includes(searchTerm);

            // Presence filter
            let matchesPresence = true;
            if (presenceFilter === 'manha') matchesPresence = !!p.presenca_matutina;
            else if (presenceFilter === 'tarde') matchesPresence = !!p.presenca_vespertina;
            else if (presenceFilter === 'ambos') matchesPresence = !!p.presenca_matutina && !!p.presenca_vespertina;
            else if (presenceFilter === 'nenhum') matchesPresence = !p.presenca_matutina && !p.presenca_vespertina;

            // Source filter
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
        const paginatedParticipants = filteredParticipants.slice(startIndex, endIndex);
        return { paginatedParticipants, totalPages };
    }, [filteredParticipants, currentPage]);


    const PresenceStatus = ({ timestamp }: { timestamp: string | null }) => {
        if (timestamp) {
            return (
                <div className="flex items-center justify-center gap-2 text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    <span className="text-xs text-muted-foreground">{format(parseISO(timestamp), 'HH:mm')}</span>
                </div>
            );
        }
        return <XCircle className="h-4 w-4 text-red-500" />;
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
                                            <TableCell className="flex justify-center"><PresenceStatus timestamp={p.presenca_matutina} /></TableCell>
                                            <TableCell className="text-center"><PresenceStatus timestamp={p.presenca_vespertina} /></TableCell>
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
        </div>
    );
}
