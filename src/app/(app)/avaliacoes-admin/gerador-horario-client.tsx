'use client';

import { useState, useTransition } from 'react';
import type { Turno, Horario } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Clock, Zap, Loader2, List, FileText, Trash2, AlertCircle, ArrowRight, Settings2, Users, Layers, Users2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getHorariosSalvos, iniciarGeracaoHorario, deleteHorario } from './actions';
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
  const [genError, setGenError] = useState<string | null>(null);
  
  const [isNameDialogOpen, setIsNameDialogOpen] = useState(false);
  const [nomeHorarioInput, setNomeHorarioInput] = useState('');
  
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

  const handleGerarHorarioClick = () => {
    if (!selectedTurnoId) {
        toast({ title: 'Selecione um turno primeiro', variant: 'destructive' });
        return;
    }
    
    setGenError(null);
    const nextVersion = horarios.length + 1;
    setNomeHorarioInput(`Horário V${nextVersion}`);
    setIsNameDialogOpen(true);
  };

  const handleConfirmGeracao = (force: boolean = false) => {
    if (!nomeHorarioInput.trim()) {
        toast({ title: 'O nome do horário é obrigatório', variant: 'destructive' });
        return;
    }

    setIsNameDialogOpen(false);
    startGenerating(async () => {
        const result = await iniciarGeracaoHorario(escolaId, selectedTurnoId, nomeHorarioInput, force);
        if (result.error) {
            setGenError(result.error);
            toast({ title: 'Problema na Grade', description: 'A grade possui conflitos que impedem a conclusão ideal.', variant: 'destructive' });
        } else {
            setGenError(null);
            toast({ title: 'Geração Concluída!', description: force ? 'A grade foi salva com pendências para ajuste manual.' : 'A grade foi organizada e salva com sucesso.'});
            handleTurnoChange(selectedTurnoId);
        }
    });
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
                                    Se você não conseguir resolver os conflitos agora, pode salvar o horário assim mesmo. As aulas não alocadas ficarão destacadas em <strong>vermelho ("Vago")</strong> para você ajustar manualmente depois.
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
                                            <p className="text-[11px] text-muted-foreground">Remova restrições de "Indisponível" para dar mais janelas ao algoritmo.</p>
                                            <Link href="/professores" className="text-primary hover:underline text-[11px] font-bold inline-flex items-center mt-1">Ir para Professores <ArrowRight className="h-3 w-3 ml-1"/></Link>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-3 group">
                                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors"><Layers className="h-4 w-4 text-primary"/></div>
                                        <div className="flex-1">
                                            <p className="text-sm font-bold">Revisar Cargas Horárias</p>
                                            <p className="text-[11px] text-muted-foreground">Confira se o total de aulas das séries cabe nos slots do turno.</p>
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
              <Button size="lg" onClick={handleGerarHorarioClick} disabled={isGenerating} className="flex-1 h-14 text-lg font-bold shadow-xl hover:scale-[1.02] transition-transform active:scale-95">
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
                <p>O algoritmo tenta encaixar todas as aulas respeitando as folgas dos professores e restrições das séries.</p>
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
                        {horarios.map(h => (
                            <Card key={h.id} className="bg-muted/40 overflow-hidden border shadow-sm group hover:border-primary/30 transition-all">
                                <CardHeader className="pb-3">
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-base font-bold truncate pr-2" title={h.nome}>{h.nome}</CardTitle>
                                        <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded-md shadow-sm ${h.status === 'publicado' ? 'bg-green-500 text-white' : h.nome.includes('Incompleto') ? 'bg-destructive text-white' : 'bg-orange-500 text-white'}`}>
                                            {h.status === 'publicado' ? 'Publicado' : h.nome.includes('Incompleto') ? 'Incompleto' : 'Rascunho'}
                                        </span>
                                    </div>
                                    <CardDescription className="text-[11px] flex items-center gap-1.5 mt-1">
                                        <Clock className="h-3 w-3" />
                                        {format(new Date(h.created_at), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}
                                    </CardDescription>
                                </CardHeader>
                                <CardFooter className="flex gap-2 pt-0">
                                    <Link href={`/avaliacoes-admin/${h.id}`} className="flex-1">
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
                        ))}
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

      {/* DIÁLOGO PARA DEFINIR O NOME DO HORÁRIO */}
      <Dialog open={isNameDialogOpen} onOpenChange={setIsNameDialogOpen}>
        <DialogContent onPointerDownOutside={(e) => e.preventDefault()} className="sm:max-w-[450px]">
            <DialogHeader>
                <DialogTitle className="text-xl font-bold flex items-center gap-2">
                    <Zap className="h-5 w-5 text-primary" />
                    Iniciar Processamento
                </DialogTitle>
                <DialogDescription>
                    Dê um nome para esta nova versão da grade (ex: Grade Principal V1).
                </DialogDescription>
            </DialogHeader>
            <div className="py-6 space-y-4">
                <div className="space-y-3">
                    <Label htmlFor="nome-horario" className="font-bold">Nome da Versão</Label>
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
            <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={() => setIsNameDialogOpen(false)} className="h-11">Cancelar</Button>
                <Button onClick={() => handleConfirmGeracao(false)} disabled={!nomeHorarioInput.trim()} className="h-11 font-bold px-8">
                    Começar Agora
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
