'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Turno, Horario, ConfiguracaoGerminacao, DiagnosticoFalha } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Clock, Zap, Loader2, List, FileText, Trash2, AlertCircle, ArrowRight, Settings2, AlertTriangle, Info, FolderDown, ChevronDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getHorariosSalvos, getHorariosSalvosTodasTurnos, deleteHorario, iniciarGeracao, getEstadoGeracao, cancelarGeracao, salvarGradeParcial, getHorarioDetalhado, getDisciplinasParaConfigGerminacao, type EstadoGeracao } from './actions';
import { exportarTodosHorariosZIP } from '@/lib/export-horario';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import Link from 'next/link';
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
} from "@/components/ui/alert-dialog"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog"
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

type HorarioComTurno = Horario & { turno_nome?: string };

type GeradorHorarioClientProps = {
    escolaId: string;
    turnosAtivos: Turno[];
};

const TURNO_COLORS = [
    'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
    'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
    'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300',
    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
    'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
    'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
    'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300',
];

function getTurnoColor(nome: string): string {
    let hash = 0;
    for (let i = 0; i < nome.length; i++) {
        hash = nome.charCodeAt(i) + ((hash << 5) - hash);
    }
    return TURNO_COLORS[Math.abs(hash) % TURNO_COLORS.length];
}

export function GeradorHorarioClient({ escolaId, turnosAtivos }: GeradorHorarioClientProps) {
    const router = useRouter();
    const [selectedTurnoId, setSelectedTurnoId] = useState<string>('todos');
    const [horarios, setHorarios] = useState<HorarioComTurno[]>([]);
    const [isLoadingHorarios, setIsLoadingHorarios] = useState(false);

    const [isPending, startTransition] = useTransition();
    const [isDeleting, setIsDeleting] = useState<string | null>(null);
    /**
     * O painel de resultado da última geração. Ele persiste entre visitas (o
     * desfecho mora no banco), então o usuário precisa poder dispensá-lo.
     */
    const [resultadoVisivel, setResultadoVisivel] = useState(false);

    const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false);
    const [dialogStep, setDialogStep] = useState<'name' | 'germination'>('name');
    const [nomeHorarioInput, setNomeHorarioInput] = useState('');
    const [disciplinasParaConfig, setDisciplinasParaConfig] = useState<{ id: string, nome: string, sigla: string, maxAulas: number }[]>([]);
    const [configGerminacao, setConfigGerminacao] = useState<ConfiguracaoGerminacao[]>([]);
    const [permitirMesmoProfDisciplinasMesmoDia, setPermitirMesmoProfDisciplinasMesmoDia] = useState(false);

    /**
     * Estado da geração, lido do servidor.
     *
     * Até 08/2026 o laço de tentativas rodava AQUI: o componente chamava uma
     * Server Action por lote de 100 tentativas, centenas de vezes seguidas.
     * Fechar a aba matava a geração e jogava fora horas de processamento, e cada
     * lote era uma requisição longa exposta ao corte de 60s do proxy da SEDUC.
     * Agora quem executa é o servidor; esta tela só observa e pode interromper.
     */
    const [geracao, setGeracao] = useState<EstadoGeracao | null>(null);
    const [isIniciando, setIsIniciando] = useState(false);
    const [isCancelando, setIsCancelando] = useState(false);
    /**
     * O diálogo de progresso deixou de ser uma prisão: como a geração não depende
     * mais desta página, fechá-lo é inofensivo e libera a tela para consultar as
     * grades já salvas. O aviso na barra do topo continua indicando que ela corre.
     */
    const [dialogProgressoOculto, setDialogProgressoOculto] = useState(false);

    /** Intervalo do poll. Cada consulta é um SELECT de uma linha. */
    const POLL_MS = 3000;

    // Tudo que a tela mostra sobre a geração vem da linha do job — não há mais
    // estado local de progresso a manter em sincronia.
    const isProcessing = geracao?.emAndamento ?? false;
    const progressoRelativo = geracao?.orcamento ? geracao.tentativas / geracao.orcamento : 0;
    const genError = !isProcessing && resultadoVisivel ? geracao?.erro ?? null : null;
    const diagnostico = (!isProcessing && resultadoVisivel ? geracao?.diagnostico : null) as DiagnosticoFalha | null;
    const temGradeParcial = !isProcessing && resultadoVisivel && (geracao?.temGradeParcial ?? false);
    /**
     * Prova de inviabilidade. Ausente em grades geradas antes desta versão, daí o
     * acesso opcional — o painel simplesmente não mostra a seção nesses casos.
     */
    const certificado = diagnostico?.certificado ?? null;
    const provado = certificado?.veredito === 'impossivel';

    const [isBaixandoTodos, setIsBaixandoTodos] = useState(false);
    const [baixarProgresso, setBaixarProgresso] = useState<{ atual: number; total: number } | null>(null);

    const { toast } = useToast();

    const loadHorarios = async (turnoId: string) => {
        setIsLoadingHorarios(true);
        if (turnoId === 'todos') {
            const { data, error } = await getHorariosSalvosTodasTurnos(escolaId);
            if (error) {
                toast({ title: 'Erro ao buscar horários', description: error, variant: 'destructive' });
            } else {
                setHorarios(data || []);
            }
        } else {
            const { data, error } = await getHorariosSalvos(turnoId);
            if (error) {
                toast({ title: 'Erro ao buscar horários', description: error, variant: 'destructive' });
            } else {
                setHorarios(data || []);
            }
        }
        setIsLoadingHorarios(false);
    };

    useEffect(() => {
        loadHorarios('todos');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Leitura inicial: é isto que reencontra uma geração que continuou rodando
    // no servidor enquanto a página estava fechada.
    useEffect(() => {
        getEstadoGeracao(escolaId).then(({ data }) => {
            if (data) {
                setGeracao(data);
                setResultadoVisivel(!data.emAndamento && Boolean(data.erro || data.diagnostico));
            }
        });
    }, [escolaId]);

    /**
     * Poll do andamento.
     *
     * Re-armado a cada mudança de `geracao`, de modo que ele começa sozinho
     * quando uma geração é iniciada e para sozinho quando ela termina.
     */
    useEffect(() => {
        if (!geracao?.emAndamento) return;

        const timer = setTimeout(async () => {
            const { data } = await getEstadoGeracao(escolaId);
            if (!data) return;
            setGeracao(data);

            if (data.emAndamento) return;

            // A geração terminou enquanto olhávamos: mostrar o desfecho.
            setResultadoVisivel(Boolean(data.erro || data.diagnostico));
            await loadHorarios(selectedTurnoId);

            if (data.status === 'concluido') {
                toast({
                    title: 'Grade gerada',
                    description: data.horariosGerados.length > 1
                        ? `${data.horariosGerados.length} grades foram salvas como rascunho.`
                        : 'A grade foi salva como rascunho.',
                });
            } else if (data.status === 'cancelado') {
                toast({ title: 'Geração interrompida', description: data.erro ?? undefined });
            } else if (data.status === 'interrompido') {
                toast({ title: 'Geração interrompida', description: 'O servidor foi reiniciado durante o processamento.', variant: 'destructive' });
            } else {
                toast({ title: 'Não foi possível fechar a grade', description: 'Veja o diagnóstico na tela.', variant: 'destructive' });
            }
        }, POLL_MS);

        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [geracao, escolaId, selectedTurnoId]);

    const handleTurnoChange = async (turnoId: string) => {
        setSelectedTurnoId(turnoId);
        await loadHorarios(turnoId);
    };

    const handleGerarHorarioClick = async () => {
        setResultadoVisivel(false);
        const nextVersion = horarios.length + 1;
        setNomeHorarioInput(`Horário V${nextVersion}`);

        const turnoIdsToFetch = selectedTurnoId === 'todos'
            ? turnosAtivos.map(t => t.id)
            : [selectedTurnoId];

        const { data: list } = await getDisciplinasParaConfigGerminacao(turnoIdsToFetch);

        if (list) {
            setDisciplinasParaConfig(list);
            setConfigGerminacao(list.map(d => ({
                componente_id: d.id,
                geminar: d.maxAulas >= 3,
                tamanho_bloco: 2
            })));
        }

        setDialogStep('name');
        setIsConfigDialogOpen(true);
    };

    /**
     * Dispara a geração no servidor.
     *
     * Repare no que NÃO acontece mais aqui: o laço de centenas de chamadas em
     * sequência. Esta função registra o job e sai; o resto é o poll acima.
     */
    const handleStartProcessing = async () => {
        if (!nomeHorarioInput.trim()) {
            toast({ title: 'O nome do horário é obrigatório', variant: 'destructive' });
            return;
        }

        const turnosParaGerar = selectedTurnoId === 'todos'
            ? turnosAtivos
            : turnosAtivos.filter(t => t.id === selectedTurnoId);

        if (turnosParaGerar.length === 0) {
            toast({ title: 'Nenhum turno ativo para gerar', variant: 'destructive' });
            return;
        }

        setIsConfigDialogOpen(false);
        setIsIniciando(true);
        setResultadoVisivel(false);
        setDialogProgressoOculto(false);

        const { data, error } = await iniciarGeracao(
            escolaId,
            turnosParaGerar.map(t => t.id),
            nomeHorarioInput.trim(),
            configGerminacao,
            permitirMesmoProfDisciplinasMesmoDia
        );

        setIsIniciando(false);

        if (error || !data) {
            toast({ title: 'Não foi possível iniciar a geração', description: error, variant: 'destructive' });
            // Pode ser um job que já estava rodando: mostrar o estado real.
            const atual = await getEstadoGeracao(escolaId);
            if (atual.data) setGeracao(atual.data);
            return;
        }

        setGeracao(data);
    };

    const handleInterromper = async () => {
        if (!geracao) return;
        setIsCancelando(true);
        const { error } = await cancelarGeracao(geracao.id);
        setIsCancelando(false);
        if (error) {
            toast({ title: 'Erro ao interromper', description: error, variant: 'destructive' });
            return;
        }
        // O orquestrador só reage na virada da rodada; o poll mostra quando parou.
        setGeracao(prev => (prev ? { ...prev, cancelamentoSolicitado: true } : prev));
    };

    const handleForcarSalvamento = async () => {
        if (!geracao?.temGradeParcial) return;

        startTransition(async () => {
            const result = await salvarGradeParcial(geracao.id, nomeHorarioInput || 'Horário');
            if (result.error) {
                toast({ title: 'Erro ao salvar', description: result.error, variant: 'destructive' });
            } else {
                setResultadoVisivel(false);
                setGeracao(prev => (prev ? { ...prev, temGradeParcial: false } : prev));
                toast({ title: 'Grade Salva!', description: 'A grade foi salva mesmo com aulas pendentes. Ajuste manualmente os horários vagos.' });
                await loadHorarios(selectedTurnoId);
            }
        });
    };

    const toggleGerminacao = (id: string, checked: boolean) => {
        setConfigGerminacao(prev => prev.map(c => c.componente_id === id ? { ...c, geminar: checked } : c));
    };

    const setTamanhoBloco = (id: string, size: number) => {
        setConfigGerminacao(prev => prev.map(c => c.componente_id === id ? { ...c, tamanho_bloco: size } : c));
    };

    const handleDelete = async (id: string) => {
        setIsDeleting(id);
        const result = await deleteHorario(id);
        setIsDeleting(null);

        if (result.error) {
            toast({ title: 'Erro ao deletar', description: result.error, variant: 'destructive' });
        } else {
            toast({ title: 'Horário removido' });
            setHorarios(prev => prev.filter(h => h.id !== id));
        }
    };

    const handleBaixarTodos = async () => {
        const horariosParaBaixar = horarios.filter(h => h.status !== 'pre_producao');
        if (horariosParaBaixar.length === 0) {
            toast({ title: 'Nenhum horário disponível', description: 'Não há grades para exportar.', variant: 'destructive' });
            return;
        }
        setIsBaixandoTodos(true);
        setBaixarProgresso({ atual: 0, total: horariosParaBaixar.length });
        try {
            const completos = [];
            for (let i = 0; i < horariosParaBaixar.length; i++) {
                const { data, error } = await getHorarioDetalhado(horariosParaBaixar[i].id);
                if (error || !data) {
                    toast({ title: 'Erro ao carregar horário', description: horariosParaBaixar[i].nome, variant: 'destructive' });
                    continue;
                }
                completos.push(data);
                setBaixarProgresso({ atual: i + 1, total: horariosParaBaixar.length });
            }
            if (completos.length === 0) return;
            await exportarTodosHorariosZIP(completos);
            toast({ title: 'Download concluído!', description: `${completos.length} horário(s) exportados no arquivo .zip.` });
        } catch {
            toast({ title: 'Erro ao exportar', description: 'Não foi possível gerar o arquivo.', variant: 'destructive' });
        } finally {
            setIsBaixandoTodos(false);
            setBaixarProgresso(null);
        }
    };

    const selectedTurno = turnosAtivos.find(t => t.id === selectedTurnoId);
    const isTodos = selectedTurnoId === 'todos';

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Passo 1: Selecione o Turno</CardTitle>
                    <CardDescription>Escolha o turno para o qual você deseja gerar ou visualizar um horário.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Select onValueChange={handleTurnoChange} value={selectedTurnoId}>
                        <SelectTrigger className="w-full md:w-[300px]">
                            <SelectValue placeholder="Selecione um turno..." />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="todos">Todos os Turnos</SelectItem>
                            {turnosAtivos.map(turno => (
                                <SelectItem key={turno.id} value={turno.id}>
                                    {turno.nome}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Zap className="h-6 w-6 text-primary" />
                        Passo 2: Geração do Horário
                    </CardTitle>
                    <CardDescription>
                        {isTodos
                            ? `Processe novas grades horárias para todos os ${turnosAtivos.length} turnos ativos.`
                            : <>Processe uma nova grade horária para o turno <span className="font-semibold text-foreground">{selectedTurno?.nome}</span>.</>
                        }
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">

                    {(genError || diagnostico) && (
                        <Alert variant="destructive" className="bg-destructive/5 border-destructive/20 animate-in fade-in slide-in-from-top-4 duration-500">
                            <AlertCircle className="h-5 w-5" />
                            {/* O desfecho vem do banco e sobrevive a recarregar a página: sem
                                um jeito de dispensar, ele ficaria na tela para sempre. */}
                            <button
                                type="button"
                                onClick={() => setResultadoVisivel(false)}
                                aria-label="Dispensar este resultado"
                                className="absolute right-4 top-4 text-destructive/60 hover:text-destructive text-xs font-bold uppercase tracking-wider"
                            >
                                Dispensar
                            </button>
                            {/* O motor é uma busca por amostragem: ele testa dezenas de
                                milhares de arranjos entre um número de combinações que não
                                cabe em nenhum computador. Dizer "impossível" atribuía a ele
                                uma conclusão que ele não tem como alcançar, e mandava o
                                usuário mexer nos dados achando que não havia saída. */}
                            <AlertTitle className="text-xl font-bold">
                                {provado
                                    ? 'Esta grade é impossível com os dados atuais'
                                    : diagnostico
                                        ? 'Geração incompleta: o que ficou de fora'
                                        : `Não foi possível fechar a grade em ${(geracao?.tentativas ?? 0).toLocaleString()} tentativas`}
                            </AlertTitle>
                            <AlertDescription className="mt-4 space-y-6">
                                {!diagnostico && (
                                    <div className="text-sm bg-background/90 p-5 rounded-xl border-2 border-destructive/20 shadow-inner whitespace-pre-line leading-relaxed font-mono">
                                        {genError}
                                    </div>
                                )}

                                {/*
                                    Prova de inviabilidade, quando existe. Fica no topo e em
                                    destaque porque muda o que o usuário deve fazer: aqui gerar
                                    de novo não adianta, é preciso corrigir o cadastro. Sem esta
                                    separação, "não consegui" e "não existe" viravam a mesma
                                    mensagem e o operador não tinha como saber qual era qual.
                                */}
                                {certificado?.veredito === 'impossivel' && (
                                    <div className="rounded-xl border-2 border-destructive bg-destructive/10 p-5 space-y-4">
                                        <p className="text-sm font-bold text-destructive">
                                            Não é questão de tentar mais vezes — nenhuma combinação fecharia. Corrija o que está abaixo.
                                        </p>
                                        {certificado.causas.map((c, i) => (
                                            <div key={i} className="bg-background/80 rounded-lg p-4 space-y-1.5">
                                                <p className="font-semibold text-sm">{c.titulo}</p>
                                                <p className="text-xs text-muted-foreground leading-relaxed">{c.detalhe}</p>
                                                {c.correcao && (
                                                    <p className="text-xs font-medium text-orange-900 dark:text-orange-300 flex items-start gap-1.5 pt-1">
                                                        <Settings2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                                        {c.correcao}
                                                    </p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {certificado?.veredito === 'indeterminado' && certificado.observacoes.length > 0 && (
                                    <div className="rounded-xl border bg-background/60 p-4 space-y-2">
                                        <p className="text-sm font-semibold">Por que está difícil</p>
                                        {certificado.observacoes.map((o, i) => (
                                            <p key={i} className="text-xs text-muted-foreground leading-relaxed">{o}</p>
                                        ))}
                                        <p className="text-xs text-muted-foreground leading-relaxed pt-1">
                                            As verificações de viabilidade <strong>não</strong> encontraram prova de que a grade
                                            seja impossível — ela provavelmente existe, só é difícil de achar. Gerar de novo tem
                                            chance real de fechar.
                                        </p>
                                    </div>
                                )}

                                {diagnostico && (
                                    <div className="space-y-6">
                                        <div>
                                            <h4 className="text-sm font-bold text-destructive flex items-center gap-2 mb-3">
                                                <AlertTriangle className="h-4 w-4" /> O que mais bloqueou (do mais frequente para o menos)
                                            </h4>
                                            <div className="grid grid-cols-1 gap-3">
                                                {diagnostico.causasIdentificadas.map((causa, idx) => (
                                                    <div key={idx} className="bg-background/80 border border-destructive/20 rounded-xl p-4 shadow-sm space-y-2">
                                                        <div className="flex items-center gap-2">
                                                            <span className="bg-destructive/10 text-destructive text-xs font-bold px-2 py-1 rounded-md">
                                                                Problema {idx + 1}
                                                            </span>
                                                            <span className="font-semibold text-sm">{causa.descricao}</span>
                                                        </div>
                                                        <div className="text-xs text-muted-foreground flex gap-4 pl-1">
                                                            {causa.professoresAfetados.length > 0 && (
                                                                <div>
                                                                    <strong className="text-foreground">Professores:</strong> {causa.professoresAfetados.join(', ')}
                                                                </div>
                                                            )}
                                                            {causa.turmasAfetadas.length > 0 && (
                                                                <div>
                                                                    <strong className="text-foreground">Turmas:</strong> {causa.turmasAfetadas.join(', ')}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="bg-orange-50/50 border border-orange-100 p-2.5 rounded-lg text-xs font-medium text-orange-900 dark:bg-orange-950/30 dark:border-orange-900/50 dark:text-orange-300 mt-2 flex items-start gap-2">
                                                            <Settings2 className="h-4 w-4 flex-shrink-0 mt-0.5" />
                                                            <span>{causa.sugestao}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                                {diagnostico.causasIdentificadas.length === 0 && (
                                                    <div className="text-sm text-muted-foreground italic p-2 border border-dashed rounded-lg text-center">
                                                        Nenhuma causa predominante clara encontrada além de falta de espaço genérica.
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div>
                                            <h4 className="text-sm font-bold text-destructive flex items-center gap-2 mb-3">
                                                <Info className="h-4 w-4" /> Aulas que ficaram de fora ({diagnostico.pendenciasDetalhadas.length})
                                            </h4>
                                            <div className="max-h-60 overflow-y-auto rounded-xl border bg-background/50 shadow-inner pr-2">
                                                <table className="w-full text-xs text-left">
                                                    <thead className="sticky top-0 bg-secondary/90 backdrop-blur-sm z-10 text-secondary-foreground shadow-sm">
                                                        <tr>
                                                            <th className="px-3 py-2.5 font-semibold">Turma</th>
                                                            <th className="px-3 py-2.5 font-semibold">Componente</th>
                                                            <th className="px-3 py-2.5 font-semibold">Professor</th>
                                                            <th className="px-3 py-2.5 font-semibold">Tipo</th>
                                                            <th className="px-3 py-2.5 font-semibold w-1/3">O que bloqueou</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-border/50">
                                                        {diagnostico.pendenciasDetalhadas.map((pend, idx) => (
                                                            <tr key={idx} className="hover:bg-muted/30 transition-colors">
                                                                <td className="px-3 py-2 font-medium">{pend.turma_nome}</td>
                                                                <td className="px-3 py-2">{pend.disciplina_nome}</td>
                                                                <td className="px-3 py-2 text-muted-foreground">{pend.professor_nome || 'Sem Professor'}</td>
                                                                <td className="px-3 py-2">
                                                                    <span className={cn(
                                                                        "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                                                                        pend.tipo_aula === 'presencial' ? "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" : "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300"
                                                                    )}>
                                                                        {pend.tipo_aula === 'presencial' ? 'Pres.' : 'NP'}
                                                                    </span>
                                                                </td>
                                                                <td className="px-3 py-2 text-destructive font-medium">{pend.motivo_real}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>

                                        {}

                                    </div>
                                )}

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                                    {temGradeParcial && (
                                        <div className="p-4 border rounded-xl bg-orange-50 border-orange-200 dark:bg-orange-950/30 dark:border-orange-900 space-y-3">
                                            <p className="text-sm font-bold text-orange-900 dark:text-orange-300 flex items-center gap-2">
                                                <AlertTriangle className="h-4 w-4" /> Opção: Salvar com Pendências
                                                {geracao?.turnoParcialNome ? ` — ${geracao.turnoParcialNome}` : ''}
                                            </p>
                                            <p className="text-xs text-orange-800 dark:text-orange-400 leading-relaxed">
                                                Você pode salvar a grade incompleta e depois realizar ajustes manuais para as aulas não alocadas. Elas aparecerão como "Vagas" na grade em vermelho.
                                            </p>
                                            <Button onClick={handleForcarSalvamento} variant="default" className="w-full bg-orange-600 hover:bg-orange-700 h-10" disabled={isPending}>
                                                {isPending ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : null}
                                                Salvar Grade Incompleta
                                            </Button>
                                        </div>
                                    )}

                                    <div className="p-4 border rounded-xl bg-background space-y-3">
                                        <p className="text-sm font-bold flex items-center gap-2">
                                            <Settings2 className="h-4 w-4" /> Ações Rápidas
                                        </p>
                                        <p className="text-xs text-muted-foreground leading-relaxed">
                                            Acesse as áreas do sistema recomendadas para corrigir os bloqueios antes de tentar gerar novamente.
                                        </p>
                                        <div className="flex flex-col sm:flex-row gap-2 mt-auto">
                                            <Link href="/professores" className="flex-1">
                                                <Button variant="outline" size="sm" className="w-full h-9 text-xs">Menu Professores</Button>
                                            </Link>
                                            <Link href="/serie" className="flex-1">
                                                <Button variant="outline" size="sm" className="w-full h-9 text-xs">Cargas / Séries</Button>
                                            </Link>
                                        </div>
                                    </div>
                                </div>
                            </AlertDescription>
                        </Alert>
                    )}

                    {/* Uma geração por unidade de cada vez — a regra é do banco, e o
                        motivo precisa ficar visível para quem encontra o botão travado. */}
                    {isProcessing && (
                        <Alert className="border-primary/30 bg-primary/5">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <AlertTitle className="font-bold">Já existe uma geração em andamento</AlertTitle>
                            <AlertDescription className="text-sm space-y-3">
                                <p>
                                    {geracao?.turnoAtualNome
                                        ? <>Processando o turno <span className="font-semibold">{geracao.turnoAtualNome}</span>. </>
                                        : null}
                                    Ela continua rodando no servidor mesmo com esta página fechada.
                                </p>
                                {dialogProgressoOculto && (
                                    <Button size="sm" variant="outline" onClick={() => setDialogProgressoOculto(false)}>
                                        Ver andamento
                                    </Button>
                                )}
                            </AlertDescription>
                        </Alert>
                    )}

                    <div className="flex flex-col md:flex-row gap-4">
                        <Link href="/relatorios" className="flex-1">
                            <Button size="lg" variant="outline" className="w-full h-14 text-lg font-medium border-2 hover:bg-muted transition-all">
                                <List className="mr-3 h-5 w-5" />
                                Checklist de Dados
                            </Button>
                        </Link>
                        <Button
                            size="lg"
                            onClick={handleGerarHorarioClick}
                            disabled={isProcessing || isIniciando}
                            className="flex-1 h-14 text-lg font-bold shadow-xl hover:scale-[1.02] transition-transform active:scale-95"
                        >
                            {isProcessing || isIniciando ? (
                                <Loader2 className="mr-3 h-6 w-6 animate-spin" />
                            ) : (
                                <Zap className="mr-3 h-6 w-6" />
                            )}
                            {isProcessing ? 'Geração em andamento' : 'Gerar Nova Grade'}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div>
                            <CardTitle>
                                Histórico de Grades — {isTodos ? 'Todos os Turnos' : selectedTurno?.nome}
                            </CardTitle>
                            <CardDescription className="mt-1">
                                {isTodos
                                    ? 'Visualize ou gerencie as versões geradas para todos os turnos.'
                                    : 'Visualize ou gerencie as versões geradas para este turno.'}
                            </CardDescription>
                        </div>
                        {horarios.filter(h => h.status !== 'pre_producao').length > 0 && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={isProcessing}
                                        className="shrink-0 gap-2"
                                    >
                                        <Settings2 className="h-4 w-4" />
                                        Gerenciamento Avançado
                                        <ChevronDown className="h-3 w-3 opacity-60" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-64">
                                    <DropdownMenuItem
                                        onClick={handleBaixarTodos}
                                        disabled={isBaixandoTodos}
                                        className="gap-2 cursor-pointer"
                                    >
                                        {isBaixandoTodos ? (
                                            <>
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                {baixarProgresso
                                                    ? `${baixarProgresso.atual}/${baixarProgresso.total}...`
                                                    : 'Preparando...'}
                                            </>
                                        ) : (
                                            <>
                                                <FolderDown className="h-4 w-4" />
                                                Baixar todos (.xlsx)
                                            </>
                                        )}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        onClick={() => router.push(`/gerarhorarios/conflitos?turno=${selectedTurnoId}`)}
                                        className="gap-2 cursor-pointer"
                                    >
                                        <AlertTriangle className="h-4 w-4 text-orange-500" />
                                        Gerenciamento de conflitos
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoadingHorarios ? (
                        <div className="flex items-center justify-center p-12">
                            <Loader2 className="h-10 w-10 animate-spin text-primary/40" />
                        </div>
                    ) : horarios.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {horarios.map(h => {
                                const isPublicado = h.status === 'publicado';
                                const isIncompleto = h.nome.includes('(Com Pendências)');
                                return (
                                    <Card key={h.id} className={cn(
                                        "bg-muted/40 overflow-hidden border shadow-sm group hover:border-primary/30 transition-all flex flex-col",
                                        isIncompleto && "border-orange-200 bg-orange-50/20 dark:border-orange-900/50 dark:bg-orange-950/10"
                                    )}>
                                        <CardHeader className="pb-3">
                                            <div className="flex items-center justify-between gap-2">
                                                <CardTitle className="text-sm font-bold flex items-center gap-1.5 min-w-0" title={h.nome}>
                                                    {isTodos && h.turno_nome && (
                                                        <span className={cn(
                                                            "shrink-0 text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded",
                                                            getTurnoColor(h.turno_nome)
                                                        )}>
                                                            {h.turno_nome}
                                                        </span>
                                                    )}
                                                    <span className="truncate">{h.nome}</span>
                                                </CardTitle>
                                                <span className={cn(
                                                    "shrink-0 text-[8px] font-bold uppercase tracking-widest px-2 py-1 rounded-md shadow-sm",
                                                    isPublicado ? 'bg-green-500 text-white' : isIncompleto ? 'bg-orange-500 text-white' : 'bg-slate-500 text-white'
                                                )}>
                                                    {isPublicado ? 'Publicado' : isIncompleto ? 'Incompleto' : 'Rascunho'}
                                                </span>
                                            </div>
                                            <CardDescription className="text-[10px] flex items-center gap-1.5 mt-1">
                                                <Clock className="h-3 w-3" />
                                                {format(new Date(h.created_at), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}
                                            </CardDescription>
                                        </CardHeader>
                                        <CardFooter className="flex gap-2 pt-0 mt-auto">
                                            <Link href={`/gerarhorarios/${h.id}`} className="flex-1">
                                                <Button variant="outline" className="w-full h-8 text-[10px] font-bold" size="sm">
                                                    <FileText className="mr-2 h-3 w-3" />
                                                    Ver Grade
                                                </Button>
                                            </Link>

                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive/60 hover:text-destructive hover:bg-destructive/10" disabled={isDeleting === h.id}>
                                                        {isDeleting === h.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Excluir Versão?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            Isso apagará permanentemente o rascunho <strong>{h.nome}</strong>. Esta ação não pode ser desfeita.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleDelete(h.id)} className="bg-destructive hover:bg-destructive/90">Confirmar Exclusão</AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </CardFooter>
                                    </Card>
                                )
                            })}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center p-16 text-center border-2 border-dashed rounded-xl bg-muted/10">
                            <Clock className="h-14 w-14 text-muted-foreground/20 mb-4" />
                            <p className="text-muted-foreground font-medium">
                                {isTodos
                                    ? 'Nenhuma grade processada para esta escola.'
                                    : 'Nenhuma grade processada para este turno.'}
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* DIALOG DE CONFIGURAÇÃO */}
            <Dialog open={isConfigDialogOpen} onOpenChange={setIsConfigDialogOpen}>
                <DialogContent onPointerDownOutside={(e) => e.preventDefault()} className="sm:max-w-[600px] max-h-[90vh] flex flex-col p-0">
                    <DialogHeader className="p-6 pb-2">
                        <DialogTitle className="text-xl font-bold flex items-center gap-2">
                            <Settings2 className="h-5 w-5 text-primary" />
                            {dialogStep === 'name' ? 'Iniciar Processamento' : 'Configurar Geminação'}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto p-6 pt-2 space-y-6">
                        {dialogStep === 'name' ? (
                            <div className="space-y-4 py-4">
                                <div className="space-y-3">
                                    <Label htmlFor="nome-horario" className="font-bold text-base">Nome da Versão</Label>
                                    <Input
                                        id="nome-horario"
                                        value={nomeHorarioInput}
                                        onChange={(e) => setNomeHorarioInput(e.target.value)}
                                        placeholder="Ex: Grade 2026 Semestre 1"
                                        className="h-12 text-lg"
                                        autoFocus
                                    />
                                    {isTodos && (
                                        <p className="text-xs text-muted-foreground">
                                            Será gerada uma grade por turno. Cada uma receberá o sufixo do turno (ex: "{nomeHorarioInput || 'Horário V1'} - Matutino").
                                        </p>
                                    )}
                                </div>

                                <div className="flex items-start gap-4 p-4 border rounded-xl bg-muted/30">
                                    <Switch
                                        id="mesmo-prof-mesmo-dia"
                                        checked={permitirMesmoProfDisciplinasMesmoDia}
                                        onCheckedChange={setPermitirMesmoProfDisciplinasMesmoDia}
                                        className="mt-0.5 shrink-0"
                                    />
                                    <div className="space-y-1">
                                        <Label htmlFor="mesmo-prof-mesmo-dia" className="text-sm font-semibold cursor-pointer">
                                            Permitir mesmo professor em disciplinas diferentes no mesmo dia
                                        </Label>
                                        <p className="text-xs text-muted-foreground">
                                            Quando ativado, o motor não penaliza dias onde o professor já ministra outra disciplina para a mesma turma.
                                            Choques reais de horário e indisponibilidades continuam bloqueados normalmente.
                                        </p>
                                    </div>
                                </div>

                            </div>
                        ) : (
                            <div className="space-y-4">
                                <Alert className="bg-primary/5 border-primary/20">
                                    <Info className="h-4 w-4 text-primary" />
                                    <AlertTitle className="text-xs uppercase font-bold text-primary">Regra Sugerida</AlertTitle>
                                    <AlertDescription className="text-xs">
                                        Por padrão, o sistema gemina aulas de disciplinas com 3 ou mais horas semanais para evitar que o professor mude de sala muitas vezes no mesmo dia.
                                    </AlertDescription>
                                </Alert>

                                <div className="space-y-2">
                                    {disciplinasParaConfig.map(disc => {
                                        const config = configGerminacao.find(c => c.componente_id === disc.id);
                                        return (
                                            <div key={disc.id} className={cn(
                                                "flex flex-col p-4 border rounded-xl bg-card shadow-sm hover:border-primary/30 transition-colors gap-4",
                                                disc.maxAulas >= 3 && "bg-orange-50/20 border-orange-100 dark:bg-orange-950/10 dark:border-orange-900/40"
                                            )}>
                                                <div className="flex items-center justify-between">
                                                    <div className="space-y-0.5">
                                                        <p className="font-bold text-sm">{disc.nome} ({disc.sigla})</p>
                                                        <p className="text-xs text-muted-foreground">{disc.maxAulas} aulas por semana</p>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <Label htmlFor={`gem-${disc.id}`} className="text-xs font-semibold cursor-pointer">Geminar?</Label>
                                                        <Switch
                                                            id={`gem-${disc.id}`}
                                                            checked={config?.geminar}
                                                            onCheckedChange={(checked) => toggleGerminacao(disc.id, checked)}
                                                        />
                                                    </div>
                                                </div>
                                                {config?.geminar && (
                                                    <div className="flex items-center gap-4 pt-2 border-t border-dashed">
                                                        <Label className="text-xs text-muted-foreground">Tamanho do Bloco:</Label>
                                                        <div className="flex gap-2">
                                                            {[2, 3, 4, 5].filter(n => n <= disc.maxAulas).map(n => (
                                                                <Button
                                                                    key={n}
                                                                    size="sm"
                                                                    variant={config.tamanho_bloco === n ? 'default' : 'outline'}
                                                                    className="h-8 w-12 text-xs font-bold"
                                                                    onClick={() => setTamanhoBloco(disc.id, n)}
                                                                >
                                                                    {n}x
                                                                </Button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    <DialogFooter className="p-6 border-t bg-muted/20 gap-2 sm:gap-0">
                        {dialogStep === 'name' ? (
                            <>
                                <Button variant="outline" onClick={() => setIsConfigDialogOpen(false)} className="h-11">Cancelar</Button>
                                <Button
                                    onClick={() => setDialogStep('germination')}
                                    disabled={!nomeHorarioInput.trim()}
                                    className="h-11 font-bold px-8"
                                >
                                    Próximo Passo <ArrowRight className="ml-2 h-4 w-4" />
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button variant="ghost" onClick={() => setDialogStep('name')} className="h-11">Voltar</Button>
                                <Button onClick={handleStartProcessing} className="h-11 font-bold px-8 shadow-lg">
                                    Começar Processamento <Zap className="ml-2 h-4 w-4" />
                                </Button>
                            </>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* DIALOG DE PROGRESSO — alimentado pela linha do job no servidor */}
            <Dialog open={isProcessing && !dialogProgressoOculto} onOpenChange={(aberto) => { if (!aberto) setDialogProgressoOculto(true); }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader className="items-center text-center space-y-4">
                        <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center animate-pulse">
                            <Zap className="h-8 w-8 text-primary" />
                        </div>
                        <DialogTitle className="text-xl font-black">Processando Grade Horária</DialogTitle>
                        <DialogDescription className="text-sm">
                            {geracao?.turnoAtualNome
                                ? <>Processando o turno <span className="font-semibold">{geracao.turnoAtualNome}</span>
                                    {geracao.totalTurnos > 1 ? ` (${geracao.turnosConcluidos + 1} de ${geracao.totalTurnos})` : ''}...</>
                                : 'O sistema está executando milhares de simulações para encontrar uma organização sem choques de professores ou horários.'
                            }
                        </DialogDescription>
                    </DialogHeader>

                    <div className="py-6 space-y-6">
                        <div className="flex justify-between items-baseline mb-2">
                            <span className="text-xs font-bold uppercase text-muted-foreground tracking-widest">Tentativa Atual</span>
                            <span className="text-lg font-black text-primary">
                                {(geracao?.tentativas ?? 0).toLocaleString()} / {(geracao?.orcamento ?? 0).toLocaleString()}
                            </span>
                        </div>
                        <Progress value={geracao?.orcamento ? (geracao.tentativas / geracao.orcamento) * 100 : 0} className="h-3" />

                        <div className="bg-muted/50 border border-slate-100 dark:border-slate-700 p-4 rounded-xl space-y-2">
                            <div className="flex items-center gap-2 text-[10px] font-black uppercase text-muted-foreground">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Status do Motor Lógico:
                            </div>
                            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed italic">
                                {progressoRelativo < 0.15
                                    ? "Analisando disponibilidade ideal dos professores..."
                                    : progressoRelativo < 0.70
                                        ? "Otimizando janelas e horários de planejamento..."
                                        : "Relaxando restrições secundárias para garantir carga horária total..."}
                            </p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {/* O oposto do aviso que ficava aqui ("não feche esta janela"):
                            agora fechar a página não interrompe mais nada. */}
                        <p className="text-center text-[11px] text-muted-foreground leading-relaxed">
                            Pode fechar esta página — a geração continua rodando no servidor.
                            Ao voltar, o andamento aparece de novo.
                        </p>

                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="outline" className="w-full h-10" disabled={isCancelando || geracao?.cancelamentoSolicitado}>
                                    {(isCancelando || geracao?.cancelamentoSolicitado)
                                        ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Interrompendo...</>
                                        : 'Interromper geração'}
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Interromper a geração?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        As tentativas já processadas serão perdidas. As grades de turnos que
                                        já fecharam são mantidas e ficam salvas como rascunho.
                                        A parada leva alguns segundos até a rodada atual terminar.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Continuar gerando</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleInterromper}>Interromper</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
