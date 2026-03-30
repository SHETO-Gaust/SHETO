'use client';

import { useState, useTransition } from 'react';
import type { Turno, Horario } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Clock, Zap, Loader2, List, FileText, Trash2, AlertCircle } from 'lucide-react';
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

  const handleConfirmGeracao = () => {
    if (!nomeHorarioInput.trim()) {
        toast({ title: 'O nome do horário é obrigatório', variant: 'destructive' });
        return;
    }

    setIsNameDialogOpen(false);
    startGenerating(async () => {
        const result = await iniciarGeracaoHorario(escolaId, selectedTurnoId, nomeHorarioInput);
        if (result.error) {
            setGenError(result.error);
            toast({ title: 'Falha na Geração', description: 'O horário não pôde ser gerado completamente.', variant: 'destructive' });
        } else {
            setGenError(null);
            toast({ title: 'Geração Concluída!', description: 'A grade foi organizada e salva com sucesso.'});
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
              Verifique a consistência dos dados e processe uma nova grade horária para o turno <span className="font-semibold text-foreground">{selectedTurno.nome}</span>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {genError && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Erro de Consistência</AlertTitle>
                    <AlertDescription>
                        {genError}
                    </AlertDescription>
                </Alert>
            )}

            <div className="flex flex-col md:flex-row gap-4">
              <Link href="/relatorios" className="flex-1">
                <Button size="lg" variant="outline" className="w-full">
                    <List className="mr-2 h-4 w-4" />
                    Verificar Dados (Checklist)
                </Button>
              </Link>
              <Button size="lg" onClick={handleGerarHorarioClick} disabled={isGenerating} className="flex-1">
                {isGenerating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                    <Zap className="mr-2 h-4 w-4" />
                )}
                Gerar Grade
              </Button>
            </div>
          </CardContent>
          <CardFooter>
             <p className="text-xs text-muted-foreground">
                O sistema só permitirá o salvamento se for possível alocar todas as aulas previstas respeitando as restrições.
             </p>
          </CardFooter>
        </Card>
      )}

      {selectedTurno && (
        <Card>
            <CardHeader>
                <CardTitle>Horários Salvos - {selectedTurno.nome}</CardTitle>
                <CardDescription>Gerencie as versões do horário geradas para este turno.</CardDescription>
            </CardHeader>
            <CardContent>
                {isLoadingHorarios ? (
                    <div className="flex items-center justify-center p-8">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                ) : horarios.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {horarios.map(h => (
                            <Card key={h.id} className="bg-muted/50 overflow-hidden border-none shadow-sm">
                                <CardHeader className="pb-2">
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-lg">{h.nome}</CardTitle>
                                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${h.status === 'publicado' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}`}>
                                            {h.status === 'publicado' ? 'Publicado' : 'Rascunho'}
                                        </span>
                                    </div>
                                    <CardDescription>
                                        {format(new Date(h.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                                    </CardDescription>
                                </CardHeader>
                                <CardFooter className="flex gap-2">
                                    <Link href={`/avaliacoes-admin/${h.id}`} className="flex-1">
                                        <Button variant="secondary" className="w-full" size="sm">
                                            <FileText className="mr-2 h-4 w-4" />
                                            Visualizar e Editar
                                        </Button>
                                    </Link>
                                    
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" disabled={isDeleting === h.id}>
                                                {isDeleting === h.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent onPointerDownOutside={(e) => e.preventDefault()}>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Excluir Horário?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    Isso apagará permanentemente o rascunho <strong>{h.nome}</strong> e todas as alocações de aula associadas a ele.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                <AlertDialogAction onClick={() => handleDelete(h.id)} className="bg-destructive hover:bg-destructive/90">Excluir</AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </CardFooter>
                            </Card>
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed rounded-lg bg-muted/20">
                        <Clock className="h-12 w-12 text-muted-foreground/40 mb-4" />
                        <p className="text-muted-foreground">Nenhum horário gerado para este turno ainda.</p>
                    </div>
                )}
            </CardContent>
        </Card>
      )}

      {/* DIÁLOGO PARA DEFINIR O NOME DO HORÁRIO */}
      <Dialog open={isNameDialogOpen} onOpenChange={setIsNameDialogOpen}>
        <DialogContent onPointerDownOutside={(e) => e.preventDefault()}>
            <DialogHeader>
                <DialogTitle>Gerar Novo Horário</DialogTitle>
                <DialogDescription>
                    Como você deseja nomear esta versão da grade para o turno {selectedTurno?.nome}?
                </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="nome-horario">Nome do Horário</Label>
                    <Input 
                        id="nome-horario" 
                        value={nomeHorarioInput} 
                        onChange={(e) => setNomeHorarioInput(e.target.value)}
                        placeholder="Ex: Grade 2026 V1"
                        autoFocus
                    />
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setIsNameDialogOpen(false)}>Cancelar</Button>
                <Button onClick={handleConfirmGeracao} disabled={!nomeHorarioInput.trim()}>
                    Iniciar Geração
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
