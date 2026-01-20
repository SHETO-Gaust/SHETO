'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle, XCircle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { Formacao } from '@/lib/types';
import type { DetailedParticipant } from '../../actions';
import { Badge } from '@/components/ui/badge';

type RelatorioDetalhadoClientProps = {
    formacao: Formacao;
    participants: DetailedParticipant[];
};

export function RelatorioDetalhadoClient({ formacao, participants }: RelatorioDetalhadoClientProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [presenceFilter, setPresenceFilter] = useState('todos'); // todos, manha, tarde, ambos, nenhum
    const [sourceFilter, setSourceFilter] = useState('todos'); // todos, inscrito, avulso

    const filteredParticipants = useMemo(() => {
        return participants.filter(p => {
            // Search filter
            const search = searchTerm.toLowerCase();
            const matchesSearch = p.nome_completo.toLowerCase().includes(search) || p.cpf.includes(search);

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
    }, [participants, searchTerm, presenceFilter, sourceFilter]);

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
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="max-w-sm"
                        />
                        <div className="flex flex-col sm:flex-row gap-4">
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
                                    <TableHead className="text-center">Origem</TableHead>
                                    <TableHead className="text-center">Presença Manhã</TableHead>
                                    <TableHead className="text-center">Presença Tarde</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredParticipants.length > 0 ? (
                                    filteredParticipants.map(p => (
                                        <TableRow key={p.id}>
                                            <TableCell className="font-medium">{p.nome_completo}</TableCell>
                                            <TableCell>{p.cpf}</TableCell>
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
                                        <TableCell colSpan={5} className="h-24 text-center">Nenhum participante encontrado com os filtros aplicados.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                    <p className="text-sm text-muted-foreground mt-4">
                        Exibindo {filteredParticipants.length} de {participants.length} participantes.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
