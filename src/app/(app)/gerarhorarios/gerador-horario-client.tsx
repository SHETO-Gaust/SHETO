'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Turno, Horario, ConfiguracaoGerminacao, DiagnosticoFalha } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Clock, Zap, Loader2, List, FileText, Trash2, AlertCircle, ArrowRight, ArrowRightLeft, Settings2, AlertTriangle, Info, FolderDown, ChevronDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getHorariosSalvos, getHorariosSalvosTodasTurnos, deleteHorario, iniciarGeracao, getEstadoGeracao, cancelarGeracao, salvarGradeParcial, getHorarioDetalhado, getDisciplinasParaConfigGerminacao, type EstadoGeracao } from './actions';
import { AlocarComTrocasDialog } from './alocar-com-trocas-dialog';
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
import { Checkbox } from '@/components/ui/checkbox';
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

/**
 * Dispensa do painel de resultado da geração.
 *
 * O desfecho mora na tabela `geracao_jobs` e é relido a cada visita à página, e
 * o "Dispensar" só apagava o estado local: bastava recarregar, navegar e voltar,
 * ou salvar a grade e seguir o fluxo, para o mesmo painel reaparecer — de fora
 * parece que o botão não funciona. Guardar qual job foi dispensado faz a decisão
 * durar. É preferência de leitura de um usuário, não dado da geração: fica no
 * navegador, e não custa uma coluna nova no banco.
 *
 * Uma chave só, com o id do último job dispensado: `lerJobRelevante` devolve no
 * máximo um job por escola, então não há o que acumular. Geração nova tem id
 * novo e volta a aparecer, que é o comportamento desejado.
 */
const CHAVE_DISPENSA = 'she:geracao-dispensada';

function foiDispensado(jobId: string): boolean {
    try {
        return window.localStorage.getItem(CHAVE_DISPENSA) === jobId;
    } catch {
        // Navegador com armazenamento bloqueado: o painel aparece, e o botão
        // continua funcionando dentro da sessão.
        return false;
    }
}

function marcarDispensado(jobId: string): void {
    try {
        window.localStorage.setItem(CHAVE_DISPENSA, jobId);
    } catch {
        /* sem persistência; a dispensa vale só para esta visita */
    }
}

export function GeradorHorarioClient({ escolaId, turnosAtivos }: GeradorHorarioClientProps) {
    const router = useRouter();
    const [selectedTurnoId, setSelectedTurnoId] = useState<string>('todos');
    const [horarios, setHorarios] = useState<HorarioComTurno[]>([]);
    const [isLoadingHorarios, setIsLoadingHorarios] = useState(false);

    const [isPending, startTransition] = useTransition();
    const [isDeleting, setIsDeleting] = useState<string | null>(null);
    /**
     * Horários marcados para exportar ou excluir em lote.
     *
     * Guarda ids, não índices nem objetos: a lista é recarregada do servidor a
     * cada troca de turno e depois de cada exclusão, e qualquer referência por
     * posição apontaria para o horário errado depois disso.
     */
    const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
    const [isExcluindoLote, setIsExcluindoLote] = useState(false);
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

    /**
     * Horário onde a alocação com trocas pode escrever.
     *
     * Só existe depois que a grade incompleta foi salva: a troca de professor
     * mexe em linhas de `horario_aulas`, e enquanto a grade vive só na memória
     * do job não há linha nenhuma para mexer.
     */
    const [horarioSalvoAgora, setHorarioSalvoAgora] = useState<string | null>(null);
    const [turmaParaAlocar, setTurmaParaAlocar] = useState<string | null>(null);

    /** Intervalo do poll. Cada consulta é um SELECT de uma linha. */
    const POLL_MS = 3000;

    // Tudo que a tela mostra sobre a geração vem da linha do job — não há mais
    // estado local de progresso a manter em sincronia.
    const isProcessing = geracao?.emAndamento ?? false;
    const progressoRelativo = geracao?.orcamento ? geracao.tentativas / geracao.orcamento : 0;
    const genError = !isProcessing && resultadoVisivel ? geracao?.erro ?? null : null;
    const diagnostico = (!isProcessing && resultadoVisivel ? geracao?.diagnostico : null) as DiagnosticoFalha | null;
    /**
     * Job que terminou bem mas tem recado — hoje, a geminação que não coube.
     *
     * O campo `erro` é o único canal de texto do job até esta tela, e ele carrega
     * duas coisas diferentes: falha de verdade e aviso sobre uma grade que
     * fechou. Sem separar as duas, um aviso de geminação aparecia sob o título
     * "Não foi possível fechar a grade em N tentativas" — sobre uma grade que
     * tinha sido gerada e salva. Um job 'concluido' sem diagnóstico nunca é
     * falha: as grades saíram, e o texto é um adendo.
     */
    const apenasAviso = !isProcessing && geracao?.status === 'concluido' && !!genError && !diagnostico;
    const temGradeParcial = !isProcessing && resultadoVisivel && (geracao?.temGradeParcial ?? false);
    /**
     * Prova de inviabilidade. Ausente em grades geradas antes desta versão, daí o
     * acesso opcional — o painel simplesmente não mostra a seção nesses casos.
     */
    const certificado = diagnostico?.certificado ?? null;

    /**
     * Onde a alocação com trocas pode escrever.
     *
     * O estado local cobre o instante logo após salvar; `horariosGerados` vem do
     * job e sobrevive a recarregar a página. Sem o segundo, o botão sumia numa
     * recarga e o painel de pendências ficava sem saída — que é justamente
     * quando alguém vai atrás dele.
     *
     * Só vale quando a geração produziu UM horário: com vários turnos não dá
     * para saber qual deles é o da turma sem perguntar, e chutar escreveria no
     * horário errado.
     */
    const horarioAlocavelId =
        horarioSalvoAgora ??
        (geracao?.horariosGerados?.length === 1 ? geracao.horariosGerados[0] : null);

    /** As pendências agrupadas por turma, na ordem em que aparecem. */
    const pendenciasPorTurma = (() => {
        const mapa = new Map<string, DiagnosticoFalha['pendenciasDetalhadas']>();
        for (const p of diagnostico?.pendenciasDetalhadas ?? []) {
            const lista = mapa.get(p.turma_nome);
            if (lista) lista.push(p); else mapa.set(p.turma_nome, [p]);
        }
        return [...mapa.entries()].map(([turma, itens]) => ({ turma, itens }));
    })();
    const provado = certificado?.veredito === 'impossivel';

    const [isBaixandoTodos, setIsBaixandoTodos] = useState(false);
    const [baixarProgresso, setBaixarProgresso] = useState<{ atual: number; total: number } | null>(null);

    const { toast } = useToast();

    const loadHorarios = async (turnoId: string) => {
        setIsLoadingHorarios(true);
        // A lista vai ser substituída: manter marcações da lista anterior faria a
        // barra de seleção contar horários que não estão mais na tela.
        setSelecionados(new Set());
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
                setResultadoVisivel(
                    !data.emAndamento && Boolean(data.erro || data.diagnostico) && !foiDispensado(data.id)
                );
            }
        });
    }, [escolaId]);

    /**
     * Dispensar não é só esconder: o desfecho continua no banco e seria relido na
     * próxima visita. Grava a decisão antes de fechar o painel.
     */
    const handleDispensarResultado = () => {
        if (geracao) marcarDispensado(geracao.id);
        setResultadoVisivel(false);
    };

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
                // O painel de resultado FICA. Ele some daqui a pouco na versão
                // anterior, e era justamente ele que listava o que ficou de fora
                // — quem salvava perdia de vista o que precisava resolver.
                setGeracao(prev => (prev ? { ...prev, temGradeParcial: false } : prev));
                setHorarioSalvoAgora((result as any).data?.id ?? null);
                toast({ title: 'Grade salva', description: 'Agora dá para alocar as aulas que ficaram de fora, ali mesmo na lista.' });
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
            desmarcar(id);
        }
    };

    // ── Seleção em lote ──────────────────────────────────────────────────────

    /**
     * Grade em produção não tem o que exportar: ela é o estado intermediário de
     * uma geração multi-turno, antes de virar rascunho. O botão "Baixar todos"
     * sempre a ignorou em silêncio; aqui a marcação continua permitida (para
     * poder excluí-la) e o que a exportação deixa de fora é dito na hora.
     */
    const podeExportar = (h: HorarioComTurno) => h.status !== 'pre_producao';

    const desmarcar = (id: string) =>
        setSelecionados(prev => {
            if (!prev.has(id)) return prev;
            const proximo = new Set(prev);
            proximo.delete(id);
            return proximo;
        });

    const alternarSelecao = (id: string) =>
        setSelecionados(prev => {
            const proximo = new Set(prev);
            if (proximo.has(id)) proximo.delete(id); else proximo.add(id);
            return proximo;
        });

    const horariosSelecionados = horarios.filter(h => selecionados.has(h.id));
    const todosMarcados = horarios.length > 0 && selecionados.size === horarios.length;

    const alternarTodos = () =>
        setSelecionados(todosMarcados ? new Set() : new Set(horarios.map(h => h.id)));

    /**
     * Monta o .zip de uma lista qualquer de horários.
     *
     * Era o corpo de `handleBaixarTodos`. Virou função à parte quando a seleção
     * em lote passou a precisar exatamente do mesmo trabalho — duplicar isso
     * significaria que uma correção no formato do arquivo pegaria só metade dos
     * caminhos de exportação.
     */
    const exportarLista = async (lista: HorarioComTurno[], rotuloVazio: string) => {
        const exportaveis = lista.filter(podeExportar);
        const ignorados = lista.length - exportaveis.length;

        if (exportaveis.length === 0) {
            toast({ title: 'Nenhum horário disponível', description: rotuloVazio, variant: 'destructive' });
            return;
        }

        setIsBaixandoTodos(true);
        setBaixarProgresso({ atual: 0, total: exportaveis.length });
        try {
            const completos = [];
            for (let i = 0; i < exportaveis.length; i++) {
                const { data, error } = await getHorarioDetalhado(exportaveis[i].id);
                if (error || !data) {
                    toast({ title: 'Erro ao carregar horário', description: exportaveis[i].nome, variant: 'destructive' });
                    continue;
                }
                completos.push(data);
                setBaixarProgresso({ atual: i + 1, total: exportaveis.length });
            }
            if (completos.length === 0) return;
            await exportarTodosHorariosZIP(completos);
            toast({
                title: 'Download concluído!',
                description: `${completos.length} horário(s) exportados no arquivo .zip.` +
                    (ignorados > 0 ? ` ${ignorados} em produção ficaram de fora.` : ''),
            });
        } catch {
            toast({ title: 'Erro ao exportar', description: 'Não foi possível gerar o arquivo.', variant: 'destructive' });
        } finally {
            setIsBaixandoTodos(false);
            setBaixarProgresso(null);
        }
    };

    const handleBaixarTodos = () => exportarLista(horarios, 'Não há grades para exportar.');

    const handleExportarSelecionados = () =>
        exportarLista(horariosSelecionados, 'Os horários marcados ainda estão em produção.');

    /**
     * Exclusão em lote.
     *
     * Sequencial, e não `Promise.all`: cada `deleteHorario` refaz a checagem de
     * permissão da escola no servidor, e disparar tudo de uma vez só troca um
     * relatório claro de quais falharam por um erro genérico. O resultado diz o
     * que saiu e o que ficou — apagar sete de dez e mostrar "pronto" seria o
     * mesmo tipo de silêncio que estamos tirando do sistema.
     */
    const handleExcluirSelecionados = async () => {
        const alvos = horariosSelecionados;
        if (alvos.length === 0) return;

        setIsExcluindoLote(true);
        const apagados: string[] = [];
        const falharam: string[] = [];

        for (const h of alvos) {
            const { error } = await deleteHorario(h.id);
            if (error) falharam.push(h.nome); else apagados.push(h.id);
        }

        setHorarios(prev => prev.filter(h => !apagados.includes(h.id)));
        setSelecionados(new Set(falharam.length ? alvos.filter(h => !apagados.includes(h.id)).map(h => h.id) : []));
        setIsExcluindoLote(false);

        if (falharam.length === 0) {
            toast({ title: `${apagados.length} horário(s) removido(s)` });
        } else {
            toast({
                title: `${apagados.length} de ${alvos.length} removido(s)`,
                description: `Não foi possível excluir: ${falharam.join(', ')}.`,
                variant: 'destructive',
            });
        }
    };

    const selectedTurno = turnosAtivos.find(t => t.id === selectedTurnoId);
    const isTodos = selectedTurnoId === 'todos';

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle data-tutorial="gerar-passo-turno">Passo 1: Selecione o Turno</CardTitle>
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
                        <Alert
                            variant={apenasAviso ? 'default' : 'destructive'}
                            className={cn(
                                'animate-in fade-in slide-in-from-top-4 duration-500',
                                apenasAviso
                                    ? 'bg-amber-50/60 border-amber-300 dark:bg-amber-950/20 dark:border-amber-900'
                                    : 'bg-destructive/5 border-destructive/20'
                            )}
                        >
                            <AlertCircle className={cn('h-5 w-5', apenasAviso && 'text-amber-600 dark:text-amber-500')} />
                            {/* O desfecho vem do banco e sobrevive a recarregar a página: sem
                                um jeito de dispensar, ele ficaria na tela para sempre. */}
                            <button
                                type="button"
                                onClick={handleDispensarResultado}
                                aria-label="Dispensar este resultado"
                                className={cn(
                                    'absolute right-4 top-4 text-xs font-bold uppercase tracking-wider',
                                    apenasAviso
                                        ? 'text-amber-700/70 hover:text-amber-800 dark:text-amber-500/70 dark:hover:text-amber-400'
                                        : 'text-destructive/60 hover:text-destructive'
                                )}
                            >
                                Dispensar
                            </button>
                            {/* O motor é uma busca por amostragem: ele testa dezenas de
                                milhares de arranjos entre um número de combinações que não
                                cabe em nenhum computador. Dizer "impossível" atribuía a ele
                                uma conclusão que ele não tem como alcançar, e mandava o
                                usuário mexer nos dados achando que não havia saída. */}
                            <AlertTitle className="text-xl font-bold">
                                {apenasAviso
                                    ? 'Grade gerada, com um aviso'
                                    : provado
                                        ? 'Esta grade é impossível com os dados atuais'
                                        : diagnostico
                                            ? 'Geração incompleta: o que ficou de fora'
                                            : `Não foi possível fechar a grade em ${(geracao?.tentativas ?? 0).toLocaleString()} tentativas`}
                            </AlertTitle>
                            <AlertDescription className="mt-4 space-y-6">
                                {!diagnostico && (
                                    <div className={cn(
                                        'text-sm bg-background/90 p-5 rounded-xl border-2 shadow-inner whitespace-pre-line leading-relaxed font-mono',
                                        apenasAviso ? 'border-amber-300/60 dark:border-amber-900/60' : 'border-destructive/20'
                                    )}>
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

                                        {/*
                                            Agrupado por TURMA, e não uma tabela plana de aulas.
                                            Quem vai resolver resolve por turma: é a turma que tem
                                            horário vago, e é olhando a turma que se decide qual
                                            aula entra onde.
                                        */}
                                        <div>
                                            <h4 className="text-sm font-bold text-destructive flex items-center gap-2 mb-3">
                                                <Info className="h-4 w-4" /> Aulas que ficaram de fora ({diagnostico.pendenciasDetalhadas.length})
                                            </h4>
                                            <div className="max-h-[420px] overflow-y-auto space-y-3 pr-1">
                                                {pendenciasPorTurma.map(({ turma, itens }) => (
                                                    <div key={turma} className="rounded-xl border bg-background/70 p-3 shadow-sm">
                                                        <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                                                            <div className="min-w-0">
                                                                <p className="font-bold text-sm">
                                                                    {turma}
                                                                    <span className="ml-2 font-normal text-xs text-muted-foreground">
                                                                        {itens.length} aula(s) sem encaixe
                                                                    </span>
                                                                </p>
                                                            </div>
                                                            {horarioAlocavelId ? (
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    className="h-8 text-xs shrink-0"
                                                                    onClick={() => setTurmaParaAlocar(turma)}
                                                                >
                                                                    <ArrowRightLeft className="h-3.5 w-3.5 mr-1.5" />
                                                                    Alocar com trocas
                                                                </Button>
                                                            ) : (
                                                                <span className="text-[10px] text-muted-foreground italic shrink-0 max-w-[190px] text-right leading-snug">
                                                                    salve a grade incompleta abaixo para alocar com trocas
                                                                </span>
                                                            )}
                                                        </div>
                                                        {/*
                                                            Uma linha por aula, com tudo que ela tem a dizer.

                                                            Havia acima desta lista uma frase que repetia disciplina e
                                                            professor de cada item — a mesma informacao duas vezes na mesma
                                                            caixa, o que dobrava o tamanho do painel sem acrescentar nada.
                                                            O professor passou para a linha, que e onde ele faz falta.

                                                            A etiqueta de tipo so aparece em aula nao presencial: "Pres." em
                                                            toda linha de uma lista onde quase tudo e presencial e ruido.
                                                        */}
                                                        <ul className="space-y-1">
                                                            {itens.map((pend, idx) => (
                                                                <li key={idx} className="text-xs flex flex-wrap items-baseline gap-x-2 border-t pt-1.5">
                                                                    <span className="font-medium">{pend.disciplina_nome}</span>
                                                                    {pend.professor_nome && (
                                                                        <span className="text-muted-foreground">{pend.professor_nome}</span>
                                                                    )}
                                                                    {pend.tipo_aula !== 'presencial' && (
                                                                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300">
                                                                            NP
                                                                        </span>
                                                                    )}
                                                                    <span className="text-destructive">{pend.motivo_real}</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                ))}
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
                            data-tutorial="gerar-btn-gerar"
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
                            <CardTitle data-tutorial="gerar-historico">
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
                        <>
                        {/*
                            Barra de seleção. Fica sempre visível, e não só depois
                            do primeiro clique: é ela que anuncia que dá para
                            marcar vários — uma bolinha solta no canto de cada
                            card não conta essa história sozinha.
                        */}
                        <div className="flex flex-wrap items-center gap-2 mb-4 p-2 pl-3 rounded-xl border bg-muted/30">
                            <label className="flex items-center gap-2 cursor-pointer select-none mr-auto">
                                <Checkbox
                                    checked={todosMarcados ? true : (selecionados.size > 0 ? 'indeterminate' : false)}
                                    onCheckedChange={alternarTodos}
                                    aria-label={todosMarcados ? 'Desmarcar todos' : 'Marcar todos'}
                                    className="rounded-full data-[state=indeterminate]:bg-primary/40 data-[state=indeterminate]:border-primary"
                                />
                                <span className="text-xs font-semibold">
                                    {selecionados.size > 0
                                        ? `${selecionados.size} de ${horarios.length} selecionado(s)`
                                        : 'Selecionar horários'}
                                </span>
                                {/* Marcado mas inexportável precisa aparecer ANTES do clique
                                    em Exportar, senão o .zip volta com menos arquivos do
                                    que o usuário marcou e ele não sabe por quê. */}
                                {selecionados.size > 0 && horariosSelecionados.some(h => !podeExportar(h)) && (
                                    <span className="text-[10px] text-muted-foreground font-medium">
                                        ({horariosSelecionados.filter(h => !podeExportar(h)).length} em produção, não exportável)
                                    </span>
                                )}
                            </label>

                            {selecionados.size > 0 && (
                                <>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 gap-2 text-xs"
                                        onClick={handleExportarSelecionados}
                                        disabled={isBaixandoTodos || isExcluindoLote}
                                    >
                                        {isBaixandoTodos ? (
                                            <>
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                {baixarProgresso ? `${baixarProgresso.atual}/${baixarProgresso.total}...` : 'Preparando...'}
                                            </>
                                        ) : (
                                            <>
                                                <FolderDown className="h-3.5 w-3.5" />
                                                Exportar (.zip)
                                            </>
                                        )}
                                    </Button>

                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-8 gap-2 text-xs text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                                                disabled={isBaixandoTodos || isExcluindoLote}
                                            >
                                                {isExcluindoLote
                                                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                    : <Trash2 className="h-3.5 w-3.5" />}
                                                Excluir
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>
                                                    Excluir {selecionados.size} horário(s)?
                                                </AlertDialogTitle>
                                                <AlertDialogDescription asChild>
                                                    <div className="space-y-3">
                                                        <p>Esta ação não pode ser desfeita.</p>
                                                        {/* Publicado é o que a escola está usando de verdade.
                                                            Apagá-lo no meio de um lote não pode passar como
                                                            mais um item da lista. */}
                                                        {horariosSelecionados.some(h => h.status === 'publicado') && (
                                                            <p className="text-destructive font-semibold">
                                                                Atenção: {horariosSelecionados.filter(h => h.status === 'publicado').length} deste(s)
                                                                está(ão) PUBLICADO(S) e em uso.
                                                            </p>
                                                        )}
                                                        <ul className="max-h-40 overflow-y-auto text-xs space-y-1 rounded-lg border bg-muted/30 p-3">
                                                            {horariosSelecionados.map(h => (
                                                                <li key={h.id} className="flex items-center gap-2">
                                                                    <span className="truncate">{h.nome}</span>
                                                                    {h.status === 'publicado' && (
                                                                        <span className="shrink-0 text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-green-500 text-white">
                                                                            publicado
                                                                        </span>
                                                                    )}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                <AlertDialogAction
                                                    onClick={handleExcluirSelecionados}
                                                    className="bg-destructive hover:bg-destructive/90"
                                                >
                                                    Confirmar Exclusão
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>

                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 text-xs text-muted-foreground"
                                        onClick={() => setSelecionados(new Set())}
                                        disabled={isBaixandoTodos || isExcluindoLote}
                                    >
                                        Limpar
                                    </Button>
                                </>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {horarios.map(h => {
                                const isPublicado = h.status === 'publicado';
                                const isIncompleto = h.nome.includes('(Com Pendências)');
                                const marcado = selecionados.has(h.id);
                                return (
                                    <Card key={h.id} className={cn(
                                        "bg-muted/40 overflow-hidden border shadow-sm group hover:border-primary/30 transition-all flex flex-col",
                                        isIncompleto && "border-orange-200 bg-orange-50/20 dark:border-orange-900/50 dark:bg-orange-950/10",
                                        // O card inteiro muda de cor: a bolinha sozinha é pequena
                                        // demais para se achar num grid de três colunas.
                                        marcado && "border-primary ring-2 ring-primary/30 bg-primary/5"
                                    )}>
                                        <CardHeader className="pb-3">
                                            <div className="flex items-center justify-between gap-2">
                                                <Checkbox
                                                    checked={marcado}
                                                    onCheckedChange={() => alternarSelecao(h.id)}
                                                    aria-label={`Selecionar ${h.nome}`}
                                                    className="shrink-0 rounded-full h-4 w-4"
                                                />
                                                <CardTitle className="text-sm font-bold flex items-center gap-1.5 min-w-0 mr-auto" title={h.nome}>
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
                        </>
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
            {horarioAlocavelId && (
                <AlocarComTrocasDialog
                    horarioId={horarioAlocavelId}
                    turmaNome={turmaParaAlocar}
                    aberto={!!turmaParaAlocar}
                    onOpenChange={aberto => { if (!aberto) setTurmaParaAlocar(null); }}
                    onAplicado={() => { void loadHorarios(selectedTurnoId); }}
                />
            )}

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
                                    <AlertTitle className="text-xs uppercase font-bold text-primary">Como funciona</AlertTitle>
                                    <AlertDescription className="text-xs">
                                        Geminar cria <strong>um único bloco</strong> de aulas seguidas por turma, no mesmo dia. As demais aulas da disciplina ficam separadas ao longo da semana — geminar &quot;2x&quot; numa disciplina de 4 aulas dá 1 bloco de 2 + 2 aulas avulsas, e não dois blocos.
                                        <br />
                                        Por padrão vem ligado para disciplinas com 3 ou mais aulas semanais, para o professor não mudar de sala tantas vezes no mesmo dia.
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
                                                        <Label className="text-xs text-muted-foreground">
                                                            Aulas seguidas no bloco:
                                                        </Label>
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
