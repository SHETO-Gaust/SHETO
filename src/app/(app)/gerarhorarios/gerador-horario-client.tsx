'use client';

import { useState, useTransition, useMemo } from 'react';
import type { Turno, Horario, ConfiguracaoGerminacao } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Clock, Zap, Loader2, List, FileText, Trash2, AlertCircle, ArrowRight, Settings2, Users, Layers, AlertTriangle, CheckCircle2, RefreshCw, Undo2, PlayCircle, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getHorariosSalvos, deleteHorario, reverterParaRascunho, gerarLoteHorario, salvarGradeFinal } from './actions';
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
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

type GeradorHorarioClientProps = {
  escolaId: string;
  turnosAtivos: Turno[];
};

export function GeradorHorarioClient({ escolaId, turnosAtivos }: GeradorHorarioClientProps) {
  const [selectedTurnoId, setSelectedTurnoId] = useState<string>('');
  const [horarios, setHorarios] = useState<Horario[]>([]);
  const [isLoadingHorarios, setIsLoadingHorarios] = useState(false);
  
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isReverting, setIsReverting] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  
  const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false);
  const [dialogStep, setDialogStep] = useState<'name' | 'germination'>('name');
  const [nomeHorarioInput, setNomeHorarioInput] = useState('');
  const [disciplinasParaConfig, setDisciplinasParaConfig] = useState<{ id: string, nome: string, sigla: string, maxAulas: number }[]>([]);
  const [configGerminacao, setConfigGerminacao] = useState<ConfiguracaoGerminacao[]>([]);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentAttempt, setCurrentAttempt] = useState(0);
  const MAX_ATTEMPTS = 10000;
  const BATCH_SIZE = 500;

  const { toast } = useToast();

  const handleTurnoChange = async (turnoId: string) => {
    if (!turnoId) {
      setSelectedTurnoId('');
      setHorarios([]);
      return;
    }
    setSelectedTurnoId(turnoId);
    setIsLoadingHorarios(true);
    setGenError(null);
    const { data, error } = await getHorariosSalvos(turnoId);
    if (error) {
      toast({ title: 'Erro ao buscar horários', description: error, variant: 'destructive' });
    } else {
      setHorarios(data || []);
    }
    setIsLoadingHorarios(false);
  };

  const handleGerarHorarioClick = async () => {
    if (!selectedTurnoId) {
        toast({ title: 'Selecione um turno primeiro', variant: 'destructive' });
        return;
    }
    
    setGenError(null);
    const nextVersion = horarios.length + 1;
    setNomeHorarioInput(`Horário V${nextVersion}`);
    
    const supabase = createClient();
    const { data: series } = await supabase
        .from('series')
        .select(`
            id, 
            series_componentes(
                aulas_presenciais, 
                aulas_nao_presenciais, 
                componente:componentes_curriculares(id, nome, sigla)
            )
        `)
        .eq('turno_id', selectedTurnoId);

    if (series) {
        const discMap = new Map<string, { id: string, nome: string, sigla: string, maxAulas: number }>();
        series.forEach((s: any) => {
            s.series_componentes.forEach((sc: any) => {
                const total = (sc.aulas_presenciais || 0) + (sc.aulas_nao_presenciais || 0);
                if (total >= 2) {
                    const existing = discMap.get(sc.componente.id);
                    discMap.set(sc.componente.id, {
                        id: sc.componente.id,
                        nome: sc.componente.nome,
                        sigla: sc.componente.sigla,
                        maxAulas: Math.max(total, existing?.maxAulas || 0)
                    });
                }
            });
        });
        const list = Array.from(discMap.values()).sort((a,b) => a.nome.localeCompare(b.nome));
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

  const handleStartProcessing = async () => {
    if (!nomeHorarioInput.trim()) {
        toast({ title: 'O nome do horário é obrigatório', variant: 'destructive' });
        return;
    }

    setIsConfigDialogOpen(false);
    setIsProcessing(true);
    setCurrentAttempt(0);
    setGenError(null);

    let attempts = 0;
    let foundSolution = false;
    let finalAulas: any[] = [];

    try {
        while (attempts < MAX_ATTEMPTS && !foundSolution) {
            const progress = attempts / MAX_ATTEMPTS;
            const result = await gerarLoteHorario(
                escolaId, 
                selectedTurnoId, 
                configGerminacao, 
                BATCH_SIZE,
                progress
            );

            if (result.success) {
                finalAulas = result.aulas;
                foundSolution = true;
                attempts += (result.attemptsMade || BATCH_SIZE);
                setCurrentAttempt(attempts);
                break;
            }

            attempts += BATCH_SIZE;
            setCurrentAttempt(attempts);
            
            // Pequena pausa para o navegador respirar e atualizar o UI
            await new Promise(r => setTimeout(r, 10));
        }

        if (foundSolution) {
            const saveRes = await salvarGradeFinal(escolaId, selectedTurnoId, nomeHorarioInput, finalAulas);
            if (saveRes.error) {
                toast({ title: 'Erro ao salvar', description: saveRes.error, variant: 'destructive' });
            } else {
                toast({ title: 'Grade Gerada!', description: `Sucesso após ${attempts} tentativas.` });
                handleTurnoChange(selectedTurnoId);
            }
        } else {
            setGenError("Não foi possível encontrar uma grade sem conflitos após 10.000 tentativas. Tente reduzir as restrições dos professores.");
            toast({ title: 'Limite Atingido', description: 'Considere remover restrições ou geminação.', variant: 'destructive' });
        }
    } catch (err) {
        console.error(err);
        toast({ title: 'Erro Crítico', description: 'Ocorreu um erro no servidor durante o processamento.', variant: 'destructive' });
    } finally {
        setIsProcessing(false);
    }
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

  const handleReverterParaRascunho = async (id: string) => {
    setIsReverting(id);
    const result = await reverterParaRascunho(id);
    setIsReverting(null);

    if (result.error) {
        toast({ title: 'Erro ao reverter', description: result.error, variant: 'destructive' });
    } else {
        toast({ title: 'Status alterado!', description: 'O horário voltou para o estado de rascunho.' });
        handleTurnoChange(selectedTurnoId);
    }
  }

  const selectedTurno = turnosAtivos.find(t => t.id === selectedTurnoId);

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
              {turnosAtivos.map(turno => (
                <SelectItem key={turno.id} value={turno.id}>
                  {turno.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedTurno && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-6 w-6 text-primary" />
              Passo 2: Geração do Horário
            </CardTitle>
            <CardDescription>
              Processe uma nova grade horária para o turno <span className="font-semibold text-foreground">{selectedTurno.nome}</span>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            
            {genError && (
                <Alert variant="destructive" className="bg-destructive/5 border-destructive/20 animate-in fade-in slide-in-from-top-4 duration-500">
                    <AlertCircle className="h-5 w-5" />
                    <AlertTitle className="text-xl font-bold">Inconsistência Detectada</AlertTitle>
                    <AlertDescription className="mt-4 space-y-6">
                        <div className="text-sm bg-background/90 p-5 rounded-xl border-2 border-destructive/20 shadow-inner whitespace-pre-line leading-relaxed font-mono">
                            {genError}
                        </div>
                        <div className="flex gap-4">
                            <Link href="/professores" className="flex-1"><Button variant="outline" className="w-full">Ajustar Professores</Button></Link>
                            <Link href="/serie" className="flex-1"><Button variant="outline" className="w-full">Revisar Cargas</Button></Link>
                        </div>
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
                disabled={isProcessing} 
                className="flex-1 h-14 text-lg font-bold shadow-xl hover:scale-[1.02] transition-transform active:scale-95"
              >
                {isProcessing ? (
                    <Loader2 className="mr-3 h-6 w-6 animate-spin" />
                ) : (
                    <Zap className="mr-3 h-6 w-6" />
                )}
                Gerar Nova Grade
              </Button>
            </div>
          </CardContent>
          <CardFooter className="bg-muted/30 py-4 px-6 border-t">
             <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <Settings2 className="h-4 w-4" />
                <p>O algoritmo realiza até 10.000 tentativas em tempo real buscando a grade perfeita.</p>
             </div>
          </CardFooter>
        </Card>
      )}

      {selectedTurno && (
        <Card>
            <CardHeader>
                <CardTitle>Histórico de Grades - {selectedTurno.nome}</CardTitle>
                <CardDescription>Visualize ou gerencie as versões geradas para este turno.</CardDescription>
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
                            return (
                                <Card key={h.id} className="bg-muted/40 overflow-hidden border shadow-sm group hover:border-primary/30 transition-all flex flex-col">
                                    <CardHeader className="pb-3">
                                        <div className="flex items-center justify-between">
                                            <CardTitle className="text-base font-bold truncate pr-2" title={h.nome}>{h.nome}</CardTitle>
                                            <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded-md shadow-sm ${isPublicado ? 'bg-green-500 text-white' : 'bg-orange-500 text-white'}`}>
                                                {isPublicado ? 'Publicado' : 'Rascunho'}
                                            </span>
                                        </div>
                                        <CardDescription className="text-[11px] flex items-center gap-1.5 mt-1">
                                            <Clock className="h-3 w-3" />
                                            {format(new Date(h.created_at), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}
                                        </CardDescription>
                                    </CardHeader>
                                    <CardFooter className="flex gap-2 pt-0 mt-auto">
                                        <Link href={`/gerarhorarios/${h.id}`} className="flex-1">
                                            <Button variant="outline" className="w-full h-9 text-xs font-bold" size="sm">
                                                <FileText className="mr-2 h-3.5 w-3.5" />
                                                Ver Grade
                                            </Button>
                                        </Link>
                                        
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="ghost" size="sm" className="h-9 w-9 p-0 text-destructive/60 hover:text-destructive hover:bg-destructive/10" disabled={isDeleting === h.id}>
                                                    {isDeleting === h.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent onPointerDownOutside={(e) => e.preventDefault()}>
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
                        <p className="text-muted-foreground font-medium">Nenhuma grade processada para este turno.</p>
                    </div>
                )}
            </CardContent>
        </Card>
      )}

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
                                        disc.maxAulas >= 3 && "bg-orange-50/20 border-orange-100"
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

      {/* DIALOG DE PROGRESSO EM TEMPO REAL */}
      <Dialog open={isProcessing}>
          <DialogContent onPointerDownOutside={(e) => e.preventDefault()} className="sm:max-w-md">
              <DialogHeader className="items-center text-center space-y-4">
                  <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center animate-pulse">
                      <Zap className="h-8 w-8 text-primary" />
                  </div>
                  <DialogTitle className="text-xl font-black">Processando Grade Horária</DialogTitle>
                  <DialogDescription className="text-sm">
                      O sistema está executando milhares de simulações para encontrar uma organização sem choques de professores ou horários.
                  </DialogDescription>
              </DialogHeader>

              <div className="py-8 space-y-6">
                  <div className="flex justify-between items-baseline mb-2">
                      <span className="text-xs font-bold uppercase text-muted-foreground tracking-widest">Tentativa Atual</span>
                      <span className="text-lg font-black text-primary">{currentAttempt.toLocaleString()} / {MAX_ATTEMPTS.toLocaleString()}</span>
                  </div>
                  <Progress value={(currentAttempt / MAX_ATTEMPTS) * 100} className="h-3" />
                  
                  <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl space-y-2">
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-500">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Status do Motor Lógico:
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed italic">
                          {currentAttempt < 3000 
                            ? "Analisando disponibilidade ideal dos professores..." 
                            : currentAttempt < 7000 
                            ? "Otimizando janelas e horários de planejamento..." 
                            : "Relaxando restrições secundárias para fechar a grade..."}
                      </p>
                  </div>
              </div>

              <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tighter">
                      Não feche esta janela enquanto o processamento estiver ativo.
                  </p>
              </div>
          </DialogContent>
      </Dialog>
    </div>
  );
}
