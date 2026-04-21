'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { limparRascunhosEscola, limparRascunhosAntigos, getResumoLimpeza, getUsersForCommunication, enviarComunicadoMassaAction } from './actions';
import type { AuditoriaRow, AuditoriaStats, ResumoLimpeza, UserListItem } from './actions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import {
    AlertCircle, Trash2, Database, Calendar,
    Search, Filter, Info, CheckCircle2, Clock, XCircle,
    ChevronLeft, ChevronRight, Loader2, Send, Users, Mail
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RichEditor } from '@/components/ui/rich-editor';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

type Props = {
    data: AuditoriaRow[];
    stats: AuditoriaStats;
    totalItems: number;
    currentPage: number;
    pageSize: number;
    searchQuery: string;
    statusFilter?: string;
};

export function AuditoriaClient({ data, stats, totalItems, currentPage, pageSize, searchQuery, statusFilter = 'all' }: Props) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [localSearch, setLocalSearch] = useState(searchQuery);
    const [maxDrafts, setMaxDrafts] = useState(5);
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();

    const [bulkState, setBulkState] = useState<{ open: boolean; dias: number; resumo: ResumoLimpeza[] | null; loading: boolean }>({
        open: false, dias: 0, resumo: null, loading: false
    });

    const [comunicadoState, setComunicadoState] = useState<{
        open: boolean;
        loadingInfo: boolean;
        users: UserListItem[];
        targetType: 'all' | 'specific';
        selectedUserIds: string[];
        titulo: string;
        htmlContent: string;
        sending: boolean;
    }>({
        open: false, loadingInfo: false, users: [], targetType: 'all', selectedUserIds: [], titulo: '', htmlContent: '', sending: false
    });

    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

    // Sync state if props change when user uses browser back/forward
    useEffect(() => {
        setLocalSearch(searchQuery);
    }, [searchQuery]);

    // Debounce search
    useEffect(() => {
        const handler = setTimeout(() => {
            if (localSearch !== searchQuery) {
                updateFilters({ q: localSearch, page: 1 });
            }
        }, 500);
        return () => clearTimeout(handler);
    }, [localSearch]);

    const updateFilters = (updates: { page?: number; limit?: number; q?: string; status?: string }) => {
        const params = new URLSearchParams(searchParams.toString());
        if (updates.page !== undefined) params.set('page', updates.page.toString());
        if (updates.limit !== undefined) params.set('limit', updates.limit.toString());

        if (updates.q !== undefined) {
            if (updates.q) params.set('q', updates.q);
            else params.delete('q');
        }

        if (updates.status !== undefined) {
            if (updates.status !== 'all') params.set('status', updates.status);
            else params.delete('status');
        }

        startTransition(() => {
            router.push(`${pathname}?${params.toString()}`);
        });
    };

    const handleOpenBulkModal = async (dias: number) => {
        setBulkState({ open: true, dias, resumo: null, loading: true });
        const { data, error } = await getResumoLimpeza(dias);
        if (error) {
            toast({ title: 'Erro', description: error, variant: 'destructive' });
            setBulkState(prev => ({ ...prev, open: false, loading: false }));
        } else {
            setBulkState({ open: true, dias, resumo: data || [], loading: false });
        }
    };

    const executeBulkClean = () => {
        const dias = bulkState.dias;
        setBulkState(prev => ({ ...prev, loading: true }));
        startTransition(async () => {
            const result = await limparRascunhosAntigos(dias);
            if (result.error) {
                toast({ title: 'Erro', description: result.error, variant: 'destructive' });
                setBulkState(prev => ({ ...prev, loading: false }));
            } else {
                toast({ title: 'Limpeza concluída', description: `${result.count} rascunhos com mais de ${dias} dias foram removidos.` });
                setBulkState({ open: false, dias: 0, resumo: null, loading: false });
                router.refresh();
            }
        });
    };

    const handleCleanSchool = (escolarId: string, escolarName: string) => {
        startTransition(async () => {
            const result = await limparRascunhosEscola(escolarId);
            if (result.error) {
                toast({ title: 'Erro', description: result.error, variant: 'destructive' });
            } else {
                toast({ title: 'Escola limpa', description: `${result.count} rascunhos da escola ${escolarName} foram removidos.` });
                router.refresh();
            }
        });
    };

    const handleOpenComunicadoModal = async () => {
        setComunicadoState(prev => ({ ...prev, open: true, loadingInfo: true, titulo: '', htmlContent: '', targetType: 'all', selectedUserIds: [] }));
        const { data, error } = await getUsersForCommunication();
        if (error) {
            toast({ title: 'Erro', description: error, variant: 'destructive' });
            setComunicadoState(prev => ({ ...prev, open: false }));
        } else {
            setComunicadoState(prev => ({ ...prev, loadingInfo: false, users: data || [] }));
        }
    };

    const handleToggleUserSelection = (userId: string) => {
        setComunicadoState(prev => {
            const isSelected = prev.selectedUserIds.includes(userId);
            const newSelection = isSelected
                ? prev.selectedUserIds.filter(id => id !== userId)
                : [...prev.selectedUserIds, userId];
            return { ...prev, selectedUserIds: newSelection };
        });
    };

    const handleSendComunicado = async () => {
        if (!comunicadoState.titulo.trim()) return toast({ title: 'Atenção', description: 'Informe um título.', variant: 'destructive' });
        if (!comunicadoState.htmlContent.trim() || comunicadoState.htmlContent === '<p></p>') return toast({ title: 'Atenção', description: 'Escreva a mensagem.', variant: 'destructive' });
        if (comunicadoState.targetType === 'specific' && comunicadoState.selectedUserIds.length === 0) return toast({ title: 'Atenção', description: 'Selecione ao menos um destinatário.', variant: 'destructive' });

        setComunicadoState(prev => ({ ...prev, sending: true }));
        const targetIds = comunicadoState.targetType === 'all' ? 'all' : comunicadoState.selectedUserIds;

        const res = await enviarComunicadoMassaAction({
            titulo: comunicadoState.titulo,
            html: comunicadoState.htmlContent,
            targetIds
        });

        setComunicadoState(prev => ({ ...prev, sending: false }));

        if (res.error) {
            toast({ title: 'Erro de Envio', description: res.error, variant: 'destructive' });
        } else {
            toast({ title: 'Comunicado Enviado', description: `${res.count} e-mails disparados com sucesso via cópia oculta (BCC).` });
            setComunicadoState(prev => ({ ...prev, open: false }));
        }
    };

    const totalNaoPublicadas = stats.totalEscolas - stats.totalPublicados;

    const pieData = [
        { name: 'Horário Publicado', value: stats.totalPublicados, color: '#16a34a' },
        { name: 'Sem Horário Oficial', value: totalNaoPublicadas, color: '#ea580c' }
    ];

    const chartDataRegionais = stats.regionalStats.map(r => {
        const total = r.publicados + r.pendentes;
        const percentual = total > 0 ? Math.round((r.publicados / total) * 100) : 0;
        return { ...r, total, percentual };
    }).sort((a, b) => a.regional.localeCompare(b.regional)).slice(0, 15);

    const CustomPieTooltip = ({ active }: any) => {
        if (active) {
            return (
                <div className="bg-popover text-popover-foreground border rounded-lg p-3 shadow-md text-xs z-50">
                    <p className="font-bold mb-2 pb-1 border-b">Consolidado da Rede</p>
                    <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between gap-6">
                            <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#16a34a]"></div> Horário Publicado:</span>
                            <span className="font-bold">{stats.totalPublicados}</span>
                        </div>
                        <div className="flex justify-between gap-6">
                            <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#ea580c]"></div> Sem Horário Oficial:</span>
                            <span className="font-bold">{totalNaoPublicadas}</span>
                        </div>
                    </div>
                </div>
            );
        }
        return null;
    };

    return (
        <div className={cn("space-y-6 transition-opacity", isPending ? "opacity-70" : "opacity-100")}>
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="bg-primary/5 border-primary/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-green-600" /> Escolas Oficiais (Global)
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-black text-primary">{stats.totalPublicados}</p>
                        <p className="text-[10px] text-muted-foreground">Unidades com horários publicados no DB.</p>
                    </CardContent>
                </Card>

                <Card className="bg-orange-50 border-orange-200">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-2">
                            <Database className="h-4 w-4" /> Rascunhos (Global)
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-black text-orange-600">{stats.totalRascunhos}</p>
                        <p className="text-[10px] text-muted-foreground">Grades em processamento global.</p>
                    </CardContent>
                </Card>

                <Card className="bg-red-50 border-red-200">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-2">
                            <XCircle className="h-4 w-4" /> Sem Movimentação
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-black text-red-600">{stats.semDados}</p>
                        <p className="text-[10px] text-muted-foreground">Escolas que nunca geraram grade.</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-2">
                            <Filter className="h-4 w-4" /> Alerta de Acúmulo
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex items-center gap-4">
                        <Input
                            type="number"
                            value={maxDrafts}
                            onChange={(e) => setMaxDrafts(Number(e.target.value))}
                            className="h-9 w-20"
                            min={1}
                        />
                        <span className="text-[10px] font-bold text-muted-foreground uppercase leading-tight">Rascunhos<br />por Turno</span>
                    </CardContent>
                </Card>
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="md:col-span-1">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-2">
                            <Database className="h-4 w-4" /> Evolução de Publicações
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="h-[200px] relative">
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mt-2">
                            <span className="text-3xl font-black text-foreground">{stats.totalEscolas}</span>
                            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Unidades Total</span>
                        </div>
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={2}
                                    dataKey="value"
                                    stroke="transparent"
                                >
                                    {pieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <RechartsTooltip content={<CustomPieTooltip />} />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                <Card className="md:col-span-2">
                    <CardHeader className="pb-2 flex flex-row items-center justify-between">
                        <CardTitle className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-2">
                            <AlertCircle className="h-4 w-4" /> Taxa de Publicação de Horários por Regional (%)
                        </CardTitle>
                        <div className="flex gap-4 text-[10px] font-bold">
                            <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-[#16a34a]"></div> Taxa de Implantação (%)</span>
                        </div>
                    </CardHeader>
                    <CardContent className="h-[200px]">
                        {chartDataRegionais.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartDataRegionais} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted-foreground)/0.2)" />
                                    <XAxis dataKey="regional" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                                    <YAxis
                                        domain={[0, 100]}
                                        tickFormatter={(val) => `${val}%`}
                                        tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <RechartsTooltip
                                        cursor={{ fill: 'hsl(var(--muted)/0.1)' }}
                                        content={({ active, payload }: any) => {
                                            if (active && payload && payload.length) {
                                                const data = payload[0].payload;
                                                return (
                                                    <div className="bg-popover text-popover-foreground border rounded-lg p-3 shadow-md text-xs z-50 min-w-[180px]">
                                                        <p className="font-bold mb-2 pb-1 border-b uppercase">{data.regional}</p>
                                                        <div className="flex justify-between items-center gap-4 mb-2">
                                                            <span className="text-muted-foreground">Implantação:</span>
                                                            <span className="font-black text-[#16a34a] text-sm">{data.percentual}%</span>
                                                        </div>
                                                        <div className="flex justify-between items-center gap-4">
                                                            <span className="text-muted-foreground">Unidades (Publicado / Total):</span>
                                                            <span className="font-bold">{data.publicados} / {data.total}</span>
                                                        </div>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        }}
                                    />
                                    <Bar dataKey="percentual" fill="#16a34a" radius={[4, 4, 0, 0]} name="% Concluído" />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex h-full items-center justify-center text-sm text-muted-foreground border-dashed border rounded-lg m-2">
                                Não há dados de regionais mapeadas.
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Main Actions Bar */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-muted/30 p-4 rounded-xl border">
                <div className="flex items-center gap-3 w-full md:w-auto flex-1">
                    <div className="relative w-full max-w-sm">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Filtrar por escola ou regional..."
                            className="pl-10 h-10 w-full"
                            value={localSearch}
                            onChange={(e) => setLocalSearch(e.target.value)}
                        />
                        {isPending && <Loader2 className="absolute right-3 top-2.5 h-5 w-5 text-muted-foreground animate-spin" />}
                    </div>

                    <Select
                        value={statusFilter}
                        onValueChange={(value) => updateFilters({ status: value, page: 1 })}
                        disabled={isPending}
                    >
                        <SelectTrigger className="w-[180px] h-10 bg-background">
                            <SelectValue placeholder="Status da Escola" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todas as Situações</SelectItem>
                            <SelectItem value="publicado">Com Horário Publicado</SelectItem>
                            <SelectItem value="em_rascunho">Apenas Rascunhos</SelectItem>
                            <SelectItem value="sem_dados">Sem Movimentação</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 shrink-0">
                    <Button onClick={handleOpenComunicadoModal} variant="default" size="sm" className="bg-blue-600 hover:bg-blue-700 mr-2 text-xs h-9">
                        <Send className="h-4 w-4 mr-2" /> E-mail em Massa
                    </Button>
                    <div className="h-5 w-px bg-border mx-1"></div>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase whitespace-nowrap hidden sm:inline-block">Limpar Rascunhos:</span>
                    <Button variant="outline" size="sm" className="h-9" onClick={() => handleOpenBulkModal(30)} disabled={isPending || bulkState.loading}>+30d</Button>
                    <Button variant="outline" size="sm" className="h-9" onClick={() => handleOpenBulkModal(15)} disabled={isPending || bulkState.loading}>+15d</Button>
                    <Button variant="destructive" size="sm" className="h-9" onClick={() => handleOpenBulkModal(7)} disabled={isPending || bulkState.loading}>+7d</Button>
                </div>
            </div>

            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/50 hover:bg-muted/50">
                                <TableHead className="w-[350px]">Escola / Regional</TableHead>
                                <TableHead className="text-center w-[120px]">Status Global</TableHead>
                                <TableHead>Turnos Ativos</TableHead>
                                <TableHead className="text-right w-[150px]">Ações de Limpeza</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                                        {searchQuery || statusFilter !== 'all' ? 'Nenhum registro encontrado para a sua busca.' : 'Nenhuma escola encontrada.'}
                                    </TableCell>
                                </TableRow>
                            ) : data.map((row) => (
                                <TableRow key={row.escola.id} className="group hover:bg-muted/30">
                                    <TableCell>
                                        <div className="font-bold text-foreground uppercase text-[11px] leading-tight mb-1">{row.escola.escolar}</div>
                                        <div className="text-[10px] text-muted-foreground line-clamp-1">
                                            {row.escola.regional ? `${row.escola.regional} | ` : ''}INEP: {row.escola.inep}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        {row.status_global === 'publicado' ? (
                                            <Badge className="bg-green-500 hover:bg-green-600 text-white font-black text-[9px] uppercase tracking-tighter">Oficializado</Badge>
                                        ) : row.status_global === 'em_rascunho' ? (
                                            <Badge variant="outline" className="text-orange-600 border-orange-200 bg-orange-50 hover:bg-orange-100 font-black text-[9px] uppercase tracking-tighter">Em Rascunho</Badge>
                                        ) : (
                                            <Badge variant="ghost" className="text-muted-foreground/40 font-black text-[9px] uppercase tracking-tighter">Sem Dados</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-wrap gap-1.5">
                                            {row.turnos.map(t => (
                                                <Badge key={t.id} variant="outline" className={cn(
                                                    "text-[9px] uppercase font-bold px-2 py-0.5 h-6",
                                                    t.publicado ? "bg-green-50 border-green-500 text-green-700" : t.rascunhos_count > maxDrafts ? "bg-red-50 border-red-500 text-red-700" : ""
                                                )}>
                                                    {t.nome} <span className="ml-1 opacity-70">({t.rascunhos_count})</span>
                                                </Badge>
                                            ))}
                                            {row.turnos.length === 0 && <span className="text-[10px] text-muted-foreground italic">Nenhum turno ativo configurado</span>}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {row.turnos.some(t => t.rascunhos_count > 0) && (
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="ghost" size="sm" className="text-destructive hover:text-white hover:bg-destructive h-8 px-2 text-[10px] font-bold">
                                                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                                                        Limpar
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Limpar rascunhos desta escola?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            Isso apagará permanentemente TODOS os rascunhos da unidade <strong>{row.escola.escolar}</strong>. Horários publicados (Oficiais) não serão afetados.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                        <AlertDialogAction
                                                            className="bg-destructive hover:bg-destructive/90"
                                                            disabled={isPending}
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                handleCleanSchool(row.escola.id, row.escola.escolar);
                                                            }}
                                                        >
                                                            Confirmar Limpeza
                                                        </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>

                    {/* Pagination Footer */}
                    <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-3 border-t bg-muted/20 gap-4">
                        <div className="flex flex-wrap items-center gap-2 justify-center sm:justify-start">
                            <p className="text-xs text-muted-foreground whitespace-nowrap">
                                Mostrando <span className="font-bold text-foreground">{(currentPage - 1) * pageSize + (data.length > 0 ? 1 : 0)}</span> a <span className="font-bold text-foreground">{Math.min(currentPage * pageSize, totalItems)}</span> de <span className="font-bold text-foreground">{totalItems}</span>
                            </p>

                            <div className="flex items-center space-x-2 sm:ml-4 sm:border-l sm:pl-4">
                                <p className="text-xs font-semibold text-muted-foreground whitespace-nowrap">Linhas por página</p>
                                <Select
                                    value={pageSize.toString()}
                                    onValueChange={(value) => {
                                        updateFilters({ limit: Number(value), page: 1 });
                                    }}
                                    disabled={isPending}
                                >
                                    <SelectTrigger className="h-8 w-[70px] text-xs">
                                        <SelectValue placeholder={pageSize.toString()} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {[25, 50, 100, 500].map((size) => (
                                            <SelectItem key={size} value={size.toString()} className="text-xs">
                                                {size}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <p className="text-xs font-medium text-muted-foreground mr-2">
                                Página {currentPage} de {totalPages}
                            </p>
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => updateFilters({ page: currentPage - 1 })}
                                disabled={currentPage <= 1 || isPending}
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => updateFilters({ page: currentPage + 1 })}
                                disabled={currentPage >= totalPages || isPending}
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Bulk Delete Dialog */}
            <Dialog open={bulkState.open} onOpenChange={(val) => {
                if (!val && !bulkState.loading) setBulkState(prev => ({ ...prev, open: false }));
            }}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Resumo de Limpeza em Lote (+{bulkState.dias} dias)</DialogTitle>
                        <DialogDescription>
                            Você está prestes a apagar permanentemente rascunhos sem movimentação gerados há mais de {bulkState.dias} dias. Confirme o impacto dessa ação abaixo:
                        </DialogDescription>
                    </DialogHeader>

                    {bulkState.loading && !bulkState.resumo ? (
                        <div className="flex flex-col items-center justify-center h-48 gap-4">
                            <Loader2 className="h-8 w-8 text-primary animate-spin" />
                            <p className="text-sm text-muted-foreground">Calculando horários impactados...</p>
                        </div>
                    ) : bulkState.resumo && bulkState.resumo.length > 0 ? (
                        <>
                            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-orange-800 font-medium mb-2">
                                Atenção: <strong>{totalEmMassa} horários-rascunho</strong> em <strong>{bulkState.resumo.length} escolas</strong> serão excluídos.
                            </div>
                            <div className="max-h-[350px] overflow-y-auto border rounded-md">
                                <Table>
                                    <TableHeader className="sticky top-0 bg-background shadow-sm">
                                        <TableRow>
                                            <TableHead>Escola</TableHead>
                                            <TableHead>Turnos Afetados</TableHead>
                                            <TableHead className="text-right">Total Obsoleto</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {bulkState.resumo.map((e) => (
                                            <TableRow key={e.escola_id}>
                                                <TableCell>
                                                    <p className="font-bold uppercase text-[11px]">{e.escolar}</p>
                                                    <p className="text-[10px] text-muted-foreground">INEP: {e.inep}</p>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-wrap gap-1">
                                                        {e.turnos.map(t => (
                                                            <Badge variant="secondary" key={t.nome} className="text-[9px]">
                                                                {t.nome}: {t.rascunhos}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right font-black text-rose-600">
                                                    -{e.total_rascunhos}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                            <DialogFooter className="mt-4">
                                <Button variant="ghost" onClick={() => setBulkState(prev => ({ ...prev, open: false }))} disabled={bulkState.loading}>
                                    Cancelar
                                </Button>
                                <Button variant="destructive" onClick={executeBulkClean} disabled={bulkState.loading}>
                                    {bulkState.loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                                    Confirmar Exclusões
                                </Button>
                            </DialogFooter>
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-40 gap-2 border border-dashed rounded-lg bg-muted/20">
                            <CheckCircle2 className="h-8 w-8 text-green-500" />
                            <p className="text-sm font-medium">Você não possui rascunhos acumulados com mais de {bulkState.dias} dias.</p>
                            <Button variant="outline" className="mt-4" onClick={() => setBulkState(prev => ({ ...prev, open: false }))}>Fechar</Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Email Communication Dialog */}
            <Dialog open={comunicadoState.open} onOpenChange={(val) => {
                if (!val && !comunicadoState.sending) setComunicadoState(prev => ({ ...prev, open: false }));
            }}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-xl font-bold text-primary">
                            <Mail className="h-5 w-5" /> Enviar Comunicado em Massa
                        </DialogTitle>
                        <DialogDescription>
                            Dispare um e-mail com layout institucional para os usuários ativos do sistema.
                        </DialogDescription>
                    </DialogHeader>

                    {comunicadoState.loadingInfo ? (
                        <div className="flex justify-center items-center h-32">
                            <Loader2 className="h-8 w-8 text-primary animate-spin" />
                        </div>
                    ) : (
                        <div className="space-y-4 py-2">
                            <div className="space-y-1.5 focus-within:text-primary">
                                <Label className="font-bold uppercase text-xs tracking-wider text-muted-foreground mb-1 block">Destinatários</Label>
                                <Select
                                    value={comunicadoState.targetType}
                                    onValueChange={(val: 'all' | 'specific') => setComunicadoState(prev => ({ ...prev, targetType: val }))}
                                >
                                    <SelectTrigger className="font-medium bg-muted/30">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">
                                            <div className="flex items-center gap-2">
                                                <Users className="h-4 w-4 text-blue-500" />
                                                Todos os Usuários Ativos ({comunicadoState.users.length})
                                            </div>
                                        </SelectItem>
                                        <SelectItem value="specific">Selecionar Manualmente...</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {comunicadoState.targetType === 'specific' && (
                                <div className="border rounded-md p-3 bg-muted/20">
                                    <Label className="text-[11px] uppercase font-bold text-muted-foreground mb-2 block">
                                        Selecione os usuários ({comunicadoState.selectedUserIds.length} de {comunicadoState.users.length})
                                    </Label>
                                    <ScrollArea className="h-[120px] rounded border border-input bg-background px-3 py-2">
                                        {comunicadoState.users.map(u => (
                                            <label key={u.id} className="flex items-center gap-2 py-1.5 cursor-pointer hover:bg-muted/50 rounded px-1 group">
                                                <Checkbox
                                                    checked={comunicadoState.selectedUserIds.includes(u.id)}
                                                    onCheckedChange={() => handleToggleUserSelection(u.id)}
                                                />
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-semibold leading-none group-hover:text-primary">{u.nome}</span>
                                                    <span className="text-[10px] text-muted-foreground">{u.email}</span>
                                                </div>
                                            </label>
                                        ))}
                                    </ScrollArea>
                                </div>
                            )}

                            <div className="space-y-1.5 focus-within:text-primary pt-2">
                                <Label className="font-bold uppercase text-xs tracking-wider text-muted-foreground mb-1 block">Assunto da Mensagem</Label>
                                <Input
                                    placeholder="Título do seu e-mail..."
                                    className="font-medium text-sm bg-muted/10 h-11"
                                    value={comunicadoState.titulo}
                                    onChange={(e) => setComunicadoState(prev => ({ ...prev, titulo: e.target.value }))}
                                />
                            </div>

                            <div className="space-y-1.5 pt-2">
                                <Label className="font-bold uppercase text-xs tracking-wider text-muted-foreground mb-1 block">Corpo do E-mail</Label>
                                <RichEditor
                                    value={comunicadoState.htmlContent}
                                    onChange={(val) => setComunicadoState(prev => ({ ...prev, htmlContent: val }))}
                                    placeholder="Escreva sua mensagem aqui. O cabeçalho com a logo da SEDUC será incluído automaticamente."
                                />
                            </div>
                        </div>
                    )}

                    <DialogFooter className="mt-2">
                        <Button variant="ghost" onClick={() => setComunicadoState(prev => ({ ...prev, open: false }))} disabled={comunicadoState.sending}>
                            Cancelar
                        </Button>
                        <Button
                            className="bg-blue-600 hover:bg-blue-700 min-w-[120px]"
                            onClick={handleSendComunicado}
                            disabled={comunicadoState.sending || comunicadoState.loadingInfo}
                        >
                            {comunicadoState.sending ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enviando...
                                </>
                            ) : (
                                <>
                                    <Send className="h-4 w-4 mr-2" /> Enviar Agora
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

        </div>
    );
}
