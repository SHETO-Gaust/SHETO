'use client';

import { useState, useTransition, useMemo } from 'react';
import type { Turno, Horario, ConfiguracaoGerminacao } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Clock, Zap, Loader2, List, FileText, Trash2, AlertCircle, ArrowRight, Settings2, Users, Layers, AlertTriangle, CheckCircle2, RefreshCw, Undo2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getHorariosSalvos, iniciarGeracaoHorario, deleteHorario, confirmarGeracaoComRealocacao, reverterParaRascunho } from './actions';
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
import { type SugestaoRealocacao } from '@/lib/timetabling';
import { cn } from '@/lib/utils';

type GeradorHorarioClientProps = {
  escolaId: string;
  turnosAtivos: Turno[];
};

export function GeradorHorarioClient({ escolaId, turnosAtivos }: GeradorHorarioClientProps) {
  const [selectedTurnoId, setSelectedTurnoId] = useState<string>('');
  const [horarios, setHorarios] = useState<Horario[]>([]);
  const [isLoadingHorarios, setIsLoadingHorarios] = useState(false);
  const [isGenerating, startGenerating] = useTransition();
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isReverting, setIsReverting] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  
  const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false);
  const [dialogStep, setDialogStep] = useState<'name' | 'germination'>('name');
  const [nomeHorarioInput, setNomeHorarioInput] = useState('');
  const [disciplinasParaConfig, setDisciplinasParaConfig] = useState<{ id: string, nome: string, sigla: string, maxAulas: number }[]>([]);
  const [configGerminacao, setConfigGerminacao] = useState<ConfiguracaoGerminacao[]>([]);
  
  const [sugestao, setSugestao] = useState<SugestaoRealocacao[] | null>(null);
  const [aulasTemporarias, setAulasTemporarias] = useState<any[] | null>(null);

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
    setSugestao(null);
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
    setSugestao(null);
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
        setConfigGerminacao(list.map(d => ({ componente_id: d.id, geminar: false, tamanho_bloco: 2 })));
    }

    setDialogStep('name');
    setIsConfigDialogOpen(true);
  };

  const handleConfirmGeracao = (force: boolean = false) => {
    if (!nomeHorarioInput.trim()) {
        toast({ title: 'O nome do horário é obrigatório', variant: 'destructive' });
        return;
    }

    setIsConfigDialogOpen(false);
    startGenerating(async () => {
        const result = await iniciarGeracaoHorario(escolaId, selectedTurnoId, nomeHorarioInput, configGerminacao, force);
        
        if (result.sugestao) {
            setSugestao(result.sugestao);
            setAulasTemporarias(result.aulasTemporarias);
            toast({ title: 'Otimização Disponível', description: 'Encontramos uma forma de encaixar as aulas ajustando o contraturno de outros turnos.' });
        } else if (result.error) {
            setGenError(result.error);
            toast({ title: 'Problema na Grade', description: 'Ocorreram conflitos lógicos durante a organização.', variant: 'destructive' });
        } else {
            setGenError(null);
            setSugestao(null);
            toast({ title: 'Geração Concluída!', description: force ? 'A grade foi salva com pendências.' : 'A grade foi organizada com sucesso.'});
            handleTurnoChange(selectedTurnoId);
        }
    });
  };

  const handleConfirmarComRealocacao = () => {
      if (!sugestao || !aulasTemporarias) return;

      startGenerating(async () => {
          const result = await confirmarGeracaoComRealocacao(escolaId, selectedTurnoId, nomeHorarioInput, aulasTemporarias, sugestao);
          if (result.error) {
              toast({ title: 'Erro ao salvar', description: result.error, variant: 'destructive' });
          } else {
              setSugestao(null);
              setAulasTemporarias(null);
              toast({ title: 'Grade Gerada!', description: 'As aulas foram organizadas e os horários de contraturno de outros turnos foram ajustados automaticamente.' });
              handleTurnoChange(selectedTurnoId);
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
            
            {sugestao && (
                <Alert className="bg-blue-50 border-blue-200 animate-in zoom-in-95 duration-300">
                    <RefreshCw className="h-5 w-5 text-blue-600" />
                    <AlertTitle className="text-xl font-bold text-blue-900">Sugestão de Ajuste entre Turnos</AlertTitle>
                    <AlertDescription className="mt-4 space-y-6">
                        <p className="text-blue-800 font-medium">
                            Encontramos uma solução completa, mas ela exige mover algumas aulas de **Contraturno (NP)** de horários que já estão publicados em outros turnos.
                        </p>
                        
                        <div className="bg-white/80 p-4 rounded-xl border border-blue-100 shadow-inner">
                            <p className="text-xs uppercase font-bold text-blue-600 mb-3 tracking-widest">Alterações Necessárias:</p>
                            <div className="space-y-3">
                                {sugestao.map((s, i) => (
                                    <div key={i} className="flex items-center gap-3 text-sm text-blue-900 bg-blue-100/50 p-2 rounded-lg border border-blue-200/50">
                                        <div className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                                        <span>
                                            **{s.professor_nome}**: Mover **{s.disciplina_nome}** (Turma {s.turma_nome}) da {s.dia_antigo} para a **{s.dia_novo}**.
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <Button 
                                onClick={handleConfirmarComRealocacao} 
                                className="bg-blue-600 hover:bg-blue-700 text-white font-bold h-12 px-8"
                                disabled={isGenerating}
                            >
                                {isGenerating ? <Loader2 className="animate-spin mr-2 h-4 w-4"/> : <CheckCircle2 className="mr-2 h-4 w-4"/>}
                                Aceitar e Gerar Grade Completa
                            </Button>
                            <Button variant="outline" onClick={() => setSugestao(null)} className="h-12 border-blue-200 text-blue-700 hover:bg-blue-100">
                                Cancelar
                            </Button>
                        </div>
                    </AlertDescription>
                </Alert>
            )}

            {genError && !sugestao && (
                <Alert variant="destructive" className="bg-destructive/5 border-destructive/20 animate-in fade-in slide-in-from-top-4 duration-500">
                    <AlertCircle className="h-5 w-5" />
                    <AlertTitle className="text-xl font-bold">Inconsistência Detectada na Grade</AlertTitle>
                    <AlertDescription className="mt-4 space-y-6">
                        <div className="text-sm bg-background/90 p-5 rounded-xl border-2 border-destructive/20 shadow-inner whitespace-pre-line leading-relaxed font-mono overflow-auto max-h-[400px]">
                            {genError}
                        </div>
                        
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                            <div className="rounded-xl bg-orange-100/50 p-5 border border-orange-200 space-y-4">
                                <p className="text-sm font-bold text-orange-900 flex items-center gap-2">
                                    <AlertTriangle className="h-5 w-5 text-orange-600" />
                                    Opção: Gerar com Pendências
                                </p>
                                <p className="text-xs text-orange-800 leading-relaxed">
                                    Se você não conseguir resolver os conflitos agora, pode salvar o horário assim mesmo. As aulas não alocadas ficarão destacadas em **vermelho ("Vago")**.
                                </p>
                                <Button 
                                    size="sm" 
                                    variant="default" 
                                    className="w-full bg-orange-600 hover:bg-orange-700 text-white shadow-lg"
                                    onClick={() => handleConfirmGeracao(true)}
                                    disabled={isGenerating}
                                >
                                    {isGenerating ? <Loader2 className="animate-spin mr-2 h-4 w-4"/> : <Zap className="mr-2 h-4 w-4"/>}
                                    Gerar Grade Mesmo com Erros
                                </Button>
                            </div>

                            <div className="rounded-xl bg-background p-5 border space-y-4 shadow-sm">
                                <p className="text-xs uppercase font-bold tracking-wider text-muted-foreground">Atalhos para Resolução</p>
                                <div className="space-y-3">
                                    <div className="flex items-start gap-3 group">
                                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors"><Users className="h-4 w-4 text-primary"/></div>
                                        <div className="flex-1">
                                            <p className="text-sm font-bold">Ajustar Professores</p>
                                            <p className="text-[11px] text-muted-foreground">Remova restrições para dar mais janelas.</p>
                                            <Link href="/professores" className="text-primary hover:underline text-[11px] font-bold inline-flex items-center mt-1">Ir para Professores <ArrowRight className="h-3 w-3 ml-1"/></Link>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-3 group">
                                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors"><Layers className="h-4 w-4 text-primary"/></div>
                                        <div className="flex-1">
                                            <p className="text-sm font-bold">Revisar Cargas Horárias</p>
                                            <p className="text-[11px] text-muted-foreground">Confira se o total de aulas cabe no turno.</p>
                                            <Link href="/serie" className="text-primary hover:underline text-[11px] font-bold inline-flex items-center mt-1">Ir para Séries <ArrowRight className="h-3 w-3 ml-1"/></Link>
                                        </div>
                                    </div>
                                </div>
                            </div>
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
              <Button size="lg" onClick={handleGerarHorarioClick} disabled={isGenerating || !!sugestao} className="flex-1 h-14 text-lg font-bold shadow-xl hover:scale-[1.02] transition-transform active:scale-95">
                {isGenerating ? (
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
                <p>O algoritmo realiza 100 tentativas e busca otimizar conflitos com outros turnos ativos.</p>
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
                            const isIncompleto = h.nome.includes('Incompleto');

                            return (
                                <Card key={h.id} className="bg-muted/40 overflow-hidden border shadow-sm group hover:border-primary/30 transition-all flex flex-col">
                                    <CardHeader className="pb-3">
                                        <div className="flex items-center justify-between">
                                            <CardTitle className="text-base font-bold truncate pr-2" title={h.nome}>{h.nome}</CardTitle>
                                            <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded-md shadow-sm ${isPublicado ? 'bg-green-500 text-white' : isIncompleto ? 'bg-destructive text-white' : 'bg-orange-500 text-white'}`}>
                                                {isPublicado ? 'Publicado' : isIncompleto ? 'Incompleto' : 'Rascunho'}
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
                                        
                                        {isPublicado && (
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="ghost" size="sm" className="h-9 w-9 p-0 text-orange-600 hover:text-orange-700 hover:bg-orange-100" disabled={isReverting === h.id}>
                                                        {isReverting === h.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent onPointerDownOutside={(e) => e.preventDefault()}>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Cancelar Publicação?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            O horário <strong>{h.nome}</strong> deixará de ser a grade oficial do turno {selectedTurno.nome} e será removido da consulta pública. Você poderá editá-lo novamente como rascunho.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Voltar</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleReverterParaRascunho(h.id)} className="bg-orange-600 hover:bg-orange-700">Confirmar</AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        )}

                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="ghost" size="sm" className="h-9 w-9 p-0 text-destructive/60 hover:text-destructive hover:bg-destructive/10" disabled={isDeleting === h.id}>
                                                    {isDeleting === h.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent onPointerDownOutside={(e) => e.preventDefault()}>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle className={isPublicado ? "text-destructive" : ""}>Excluir {isPublicado ? "Grade PUBLICADA" : "Versão"}?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        {isPublicado ? (
                                                            <div className="space-y-3">
                                                                <p className="font-bold text-foreground">Atenção: Este horário está PUBLICADO.</p>
                                                                <p>Ao excluir esta grade, a escola ficará sem um horário oficial para o turno <strong>{selectedTurno.nome}</strong> e ele desaparecerá da consulta pública imediatamente.</p>
                                                            </div>
                                                        ) : (
                                                            <>Isso apagará permanentemente o rascunho <strong>{h.nome}</strong>. Esta ação não pode ser desfeita.</>
                                                        )}
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
                        <p className="text-xs text-muted-foreground/60 mt-1">Clique no botão "Gerar Nova Grade" para começar.</p>
                    </div>
                )}
            </CardContent>
        </Card>
      )}

      <Dialog open={isConfigDialogOpen} onOpenChange={setIsConfigDialogOpen}>
        <DialogContent onPointerDownOutside={(e) => e.preventDefault()} className="sm:max-w-[600px] max-h-[90vh] flex flex-col p-0">
            <DialogHeader className="p-6 pb-2">
                <DialogTitle className="text-xl font-bold flex items-center gap-2">
                    <Zap className="h-5 w-5 text-primary" />
                    {dialogStep === 'name' ? 'Iniciar Processamento' : 'Configurar Geminação'}
                </DialogTitle>
                <DialogDescription>
                    {dialogStep === 'name' 
                        ? 'Dê um nome para esta nova versão da grade.' 
                        : 'Defina como as aulas com carga horária alta devem ser distribuídas.'}
                </DialogDescription>
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
                            <Settings2 className="h-4 w-4 text-primary" />
                            <AlertTitle className="text-xs uppercase font-bold text-primary">Dica de Otimização</AlertTitle>
                            <AlertDescription className="text-xs">
                                Aulas geminadas (seguidas) são mais difíceis de encaixar. Se o algoritmo falhar, tente desativar a geminação em algumas matérias.
                            </AlertDescription>
                        </Alert>

                        <div className="space-y-2">
                            {disciplinasParaConfig.map(disc => {
                                const config = configGerminacao.find(c => c.componente_id === disc.id);
                                const isHighLoad = disc.maxAulas >= 3;
                                return (
                                    <div 
                                        key={disc.id} 
                                        className={cn(
                                            "flex flex-col p-4 border rounded-xl bg-card shadow-sm hover:border-primary/30 transition-colors gap-4",
                                            isHighLoad && "bg-orange-50/30 border-orange-100 ring-1 ring-orange-100/50"
                                        )}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="space-y-0.5">
                                                <p className={cn("font-bold text-sm", isHighLoad && "text-orange-900")}>{disc.nome} ({disc.sigla})</p>
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
                        <Button onClick={() => handleConfirmGeracao(false)} className="h-11 font-bold px-8 shadow-lg">
                            Começar Processamento <Zap className="ml-2 h-4 w-4" />
                        </Button>
                    </>
                )}
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
