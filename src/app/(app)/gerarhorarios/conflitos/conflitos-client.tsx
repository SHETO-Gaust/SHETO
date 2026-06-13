'use client';

import { useState, useEffect } from 'react';
import type { Turno, Horario } from '@/lib/types';
import type { HorarioConflictResult } from '../actions';
import { analisarConflitosHorarios, getHorariosSalvosTodasTurnos } from '../actions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Loader2, Sparkles, CheckCircle2, AlertTriangle, ArrowLeft, FileText, ChevronDown, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

const DIAS_LABELS: Record<string, string> = {
    segunda: 'Segunda',
    terca: 'Terça',
    quarta: 'Quarta',
    quinta: 'Quinta',
    sexta: 'Sexta',
    sabado: 'Sábado',
};

const TURNO_COLORS = [
    'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
    'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
    'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300',
];

function getTurnoColor(nome: string): string {
    let hash = 0;
    for (let i = 0; i < nome.length; i++) hash = nome.charCodeAt(i) + ((hash << 5) - hash);
    return TURNO_COLORS[Math.abs(hash) % TURNO_COLORS.length];
}

type HorarioItem = Horario & { turno_nome: string };

type Props = {
    escolaId: string;
    turnosAtivos: Turno[];
    initialTurnoId: string;
};

export function ConflitosClient({ escolaId, turnosAtivos, initialTurnoId }: Props) {
    const [selectedTurnoId, setSelectedTurnoId] = useState(initialTurnoId);
    const [allSchedules, setAllSchedules] = useState<HorarioItem[]>([]);
    const [isLoadingSchedules, setIsLoadingSchedules] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [results, setResults] = useState<HorarioConflictResult[] | null>(null);
    const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
    const { toast } = useToast();

    const filteredSchedules = selectedTurnoId === 'todos'
        ? allSchedules
        : allSchedules.filter(h => h.turno_id === selectedTurnoId);

    const loadSchedules = async () => {
        setIsLoadingSchedules(true);
        setResults(null);
        const { data } = await getHorariosSalvosTodasTurnos(escolaId);
        const items = ((data || []) as HorarioItem[]).filter(h => h.status !== 'pre_producao');
        setAllSchedules(items);
        setSelectedIds(new Set(items.map(h => h.id)));
        setIsLoadingSchedules(false);
    };

    useEffect(() => { loadSchedules(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleTurnoChange = (v: string) => {
        setSelectedTurnoId(v);
        setResults(null);
        const filtered = v === 'todos' ? allSchedules : allSchedules.filter(h => h.turno_id === v);
        setSelectedIds(new Set(filtered.map(h => h.id)));
    };

    const toggleId = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const selectAll = () => setSelectedIds(new Set(filteredSchedules.map(h => h.id)));
    const selectNone = () => setSelectedIds(new Set());

    const handleAnalyze = async () => {
        if (selectedIds.size < 2) {
            toast({ title: 'Selecione ao menos 2 horários', description: 'São necessários pelo menos dois horários para comparar conflitos.', variant: 'destructive' });
            return;
        }
        setIsAnalyzing(true);
        setResults(null);
        setExpandedCards(new Set());
        try {
            const { data, error } = await analisarConflitosHorarios(escolaId, selectedTurnoId, Array.from(selectedIds));
            if (error) {
                toast({ title: 'Erro na análise', description: error, variant: 'destructive' });
                return;
            }
            const res = data || [];
            setResults(res);
            setExpandedCards(new Set(res.filter(r => r.conflicts.length > 0).map(r => r.horario_id)));

            const totalConflicts = res.filter(r => r.conflicts.length > 0).length;
            if (totalConflicts === 0) {
                toast({ title: '✓ Análise concluída', description: 'Nenhum conflito detectado entre os horários selecionados.' });
            } else {
                toast({ title: 'Análise concluída', description: `${totalConflicts} horário(s) com conflitos encontrados.`, variant: 'destructive' });
            }
        } finally {
            setIsAnalyzing(false);
        }
    };

    const toggleExpand = (id: string) => {
        setExpandedCards(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const withConflicts = results?.filter(r => r.conflicts.length > 0) || [];
    const withoutConflicts = results?.filter(r => r.conflicts.length === 0) || [];
    const allFilteredSelected = filteredSchedules.length > 0 && filteredSchedules.every(h => selectedIds.has(h.id));
    const someSelected = filteredSchedules.some(h => selectedIds.has(h.id));

    return (
        <div className="space-y-6">
            {/* Filtro + Seleção + Ação */}
            <Card>
                <CardHeader className="pb-3">
                    <Link href="/gerarhorarios">
                        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground -ml-2 mb-2">
                            <ArrowLeft className="h-4 w-4" />
                            Voltar para Horários
                        </Button>
                    </Link>
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <AlertTriangle className="h-5 w-5 text-orange-500" />
                        Análise de Conflitos
                    </CardTitle>
                </CardHeader>

                <CardContent className="space-y-5">
                    {/* Turno filter */}
                    <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Filtrar por turno</p>
                        <Select value={selectedTurnoId} onValueChange={handleTurnoChange} disabled={isLoadingSchedules}>
                            <SelectTrigger className="w-full sm:w-[280px]">
                                <SelectValue placeholder="Selecione um turno..." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="todos">Todos os Turnos</SelectItem>
                                {turnosAtivos.map(t => (
                                    <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <Separator />

                    {/* Schedule selector */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Horários para analisar
                            </p>
                            {!isLoadingSchedules && filteredSchedules.length > 0 && (
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">
                                        {filteredSchedules.filter(h => selectedIds.has(h.id)).length} de {filteredSchedules.length} selecionado{filteredSchedules.length !== 1 ? 's' : ''}
                                    </span>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={selectAll}
                                        disabled={allFilteredSelected}
                                        className="h-6 px-2 text-[10px] font-bold uppercase tracking-wide"
                                    >
                                        Todos
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={selectNone}
                                        disabled={!someSelected}
                                        className="h-6 px-2 text-[10px] font-bold uppercase tracking-wide"
                                    >
                                        Nenhum
                                    </Button>
                                </div>
                            )}
                        </div>

                        {isLoadingSchedules ? (
                            <div className="flex items-center gap-2 py-4 text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span className="text-sm">Carregando horários...</span>
                            </div>
                        ) : filteredSchedules.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-2 italic">
                                Nenhum horário disponível para o filtro selecionado.
                            </p>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {filteredSchedules.map(h => {
                                    const checked = selectedIds.has(h.id);
                                    const isPublicado = h.status === 'publicado';
                                    const isIncompleto = h.nome.includes('(Com Pendências)');
                                    return (
                                        <div
                                            key={h.id}
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => toggleId(h.id)}
                                            onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && toggleId(h.id)}
                                            className={cn(
                                                'flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all cursor-pointer select-none',
                                                checked
                                                    ? 'border-primary/40 bg-primary/5 dark:bg-primary/10'
                                                    : 'border-border/50 bg-muted/20 opacity-50 hover:opacity-70'
                                            )}
                                        >
                                            <Checkbox
                                                checked={checked}
                                                onCheckedChange={() => toggleId(h.id)}
                                                onClick={e => e.stopPropagation()}
                                                className="shrink-0"
                                            />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-xs font-semibold truncate leading-tight" title={h.nome}>
                                                    {h.nome}
                                                </p>
                                                <div className="flex flex-wrap items-center gap-1 mt-1">
                                                    {h.turno_nome && (
                                                        <span className={cn('text-[8px] font-bold uppercase tracking-widest px-1 py-0.5 rounded', getTurnoColor(h.turno_nome))}>
                                                            {h.turno_nome}
                                                        </span>
                                                    )}
                                                    <span className={cn(
                                                        'text-[8px] font-bold uppercase tracking-widest px-1 py-0.5 rounded',
                                                        isPublicado ? 'bg-green-500 text-white'
                                                            : isIncompleto ? 'bg-orange-500 text-white'
                                                                : 'bg-slate-400 text-white'
                                                    )}>
                                                        {isPublicado ? 'Publicado' : isIncompleto ? 'Incompleto' : 'Rascunho'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <Separator />

                    {/* Analyze button */}
                    <div className="flex items-center justify-between gap-4">
                        <p className="text-xs text-muted-foreground">
                            {selectedIds.size < 2
                                ? 'Selecione ao menos 2 horários para iniciar a análise.'
                                : `${selectedIds.size} horário${selectedIds.size !== 1 ? 's' : ''} serão comparados entre si.`}
                        </p>
                        <Button
                            onClick={handleAnalyze}
                            disabled={isAnalyzing || selectedIds.size < 2 || isLoadingSchedules}
                            className="gap-2 font-bold shadow-md shrink-0"
                        >
                            {isAnalyzing ? (
                                <><Loader2 className="h-4 w-4 animate-spin" /> Analisando...</>
                            ) : (
                                <><Sparkles className="h-4 w-4" /> Gerar análise avançada</>
                            )}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Resultados */}
            {results !== null && (
                <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-3 px-1">
                        <span className="text-sm font-semibold text-muted-foreground">
                            {results.length} horário{results.length !== 1 ? 's' : ''} analisado{results.length !== 1 ? 's' : ''}
                        </span>
                        <span className="text-muted-foreground/50">•</span>
                        <span className="text-sm font-semibold text-green-600 dark:text-green-400 flex items-center gap-1.5">
                            <CheckCircle2 className="h-4 w-4" />
                            {withoutConflicts.length} sem conflitos
                        </span>
                        {withConflicts.length > 0 && (
                            <>
                                <span className="text-muted-foreground/50">•</span>
                                <span className="text-sm font-semibold text-orange-600 dark:text-orange-400 flex items-center gap-1.5">
                                    <AlertTriangle className="h-4 w-4" />
                                    {withConflicts.length} com conflitos
                                </span>
                            </>
                        )}
                    </div>

                    {results.length === 0 ? (
                        <Card>
                            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                                <AlertTriangle className="h-10 w-10 text-muted-foreground/20 mb-3" />
                                <p className="text-muted-foreground">Nenhum horário encontrado para os filtros selecionados.</p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {results.map(result => {
                                const hasConflicts = result.conflicts.length > 0;
                                const isExpanded = expandedCards.has(result.horario_id);
                                const isPublicado = result.horario_status === 'publicado';

                                const conflictsByHorario = new Map<string, { nome: string; items: typeof result.conflicts }>();
                                result.conflicts.forEach(c => {
                                    if (!conflictsByHorario.has(c.conflicting_horario_id)) {
                                        conflictsByHorario.set(c.conflicting_horario_id, { nome: c.conflicting_horario_nome, items: [] });
                                    }
                                    conflictsByHorario.get(c.conflicting_horario_id)!.items.push(c);
                                });

                                return (
                                    <Card
                                        key={result.horario_id}
                                        className={cn(
                                            'transition-all duration-300 flex flex-col',
                                            !hasConflicts
                                                ? 'ring-2 ring-green-400/50 border-green-200 dark:border-green-800 bg-green-50/30 dark:bg-green-950/10 shadow-[0_0_22px_rgba(74,222,128,0.25)]'
                                                : 'border-orange-200 dark:border-orange-800 bg-orange-50/20 dark:bg-orange-950/10'
                                        )}
                                    >
                                        <CardHeader className="pb-2">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0 space-y-1.5">
                                                    <p className="text-sm font-bold leading-tight truncate" title={result.horario_nome}>
                                                        {result.horario_nome}
                                                    </p>
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                        {result.turno_nome && (
                                                            <span className={cn('text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded', getTurnoColor(result.turno_nome))}>
                                                                {result.turno_nome}
                                                            </span>
                                                        )}
                                                        <span className={cn(
                                                            'text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded',
                                                            isPublicado ? 'bg-green-500 text-white' : 'bg-slate-500 text-white'
                                                        )}>
                                                            {isPublicado ? 'Publicado' : 'Rascunho'}
                                                        </span>
                                                    </div>
                                                </div>
                                                {!hasConflicts ? (
                                                    <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                                                ) : (
                                                    <span className="shrink-0 text-[10px] font-bold bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 px-2 py-1 rounded-md whitespace-nowrap">
                                                        {result.conflicts.length} conflito{result.conflicts.length !== 1 ? 's' : ''}
                                                    </span>
                                                )}
                                            </div>
                                        </CardHeader>

                                        <CardContent className="pt-0 flex-1 flex flex-col gap-3">
                                            {!hasConflicts ? (
                                                <p className="text-xs text-green-700 dark:text-green-400 font-medium flex items-center gap-1.5">
                                                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                                    Nenhum conflito detectado
                                                </p>
                                            ) : (
                                                <>
                                                    <button
                                                        onClick={() => toggleExpand(result.horario_id)}
                                                        className="text-xs font-semibold text-orange-700 dark:text-orange-400 flex items-center gap-1 hover:underline w-fit"
                                                    >
                                                        {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                                        {isExpanded ? 'Ocultar detalhes' : 'Ver detalhes'}
                                                    </button>

                                                    {isExpanded && (
                                                        <div className="space-y-2.5">
                                                            {Array.from(conflictsByHorario.entries()).map(([hId, group]) => (
                                                                <div key={hId} className="rounded-lg border border-orange-100 dark:border-orange-900/30 bg-background/70 p-3 space-y-2">
                                                                    <p className="text-[10px] font-bold uppercase tracking-wider text-orange-700 dark:text-orange-400">
                                                                        Conflito com: {group.nome}
                                                                    </p>
                                                                    <ul className="space-y-1">
                                                                        {group.items.map((c, idx) => (
                                                                            <li key={idx} className="text-xs flex items-start gap-1.5 text-muted-foreground">
                                                                                <span className="text-orange-500 mt-0.5 shrink-0">•</span>
                                                                                <span>
                                                                                    <span className="font-semibold text-foreground">{c.professor_nome}</span>
                                                                                    {' — '}
                                                                                    {DIAS_LABELS[c.dia_semana] || c.dia_semana}, {c.aula_index + 1}ª aula
                                                                                    {c.turno_nome ? <span className="text-muted-foreground/70"> ({c.turno_nome})</span> : null}
                                                                                </span>
                                                                            </li>
                                                                        ))}
                                                                    </ul>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </>
                                            )}

                                            <div className="mt-auto pt-2">
                                                <Link href={`/gerarhorarios/${result.horario_id}`}>
                                                    <Button variant="outline" size="sm" className="w-full h-7 text-[10px] font-bold gap-1.5">
                                                        <FileText className="h-3 w-3" />
                                                        Ver Grade
                                                    </Button>
                                                </Link>
                                            </div>
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
