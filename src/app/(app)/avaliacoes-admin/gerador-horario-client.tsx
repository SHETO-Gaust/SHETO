'use client';

import { useState, useTransition } from 'react';
import type { Turno, Horario } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Clock, Bot, PlusCircle, Loader2, List, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getHorariosSalvos, iniciarGeracaoHorario } from './actions';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type GeradorHorarioClientProps = {
  escolaId: string;
  turnosAtivos: Turno[];
};

export function GeradorHorarioClient({ escolaId, turnosAtivos }: GeradorHorarioClientProps) {
  const [selectedTurnoId, setSelectedTurnoId] = useState<string>('');
  const [horarios, setHorarios] = useState<Horario[]>([]);
  const [isLoadingHorarios, setIsLoadingHorarios] = useState(false);
  const [isGenerating, startGenerating] = useTransition();
  const { toast } = useToast();

  const handleTurnoChange = async (turnoId: string) => {
    if (!turnoId) {
      setSelectedTurnoId('');
      setHorarios([]);
      return;
    }
    setSelectedTurnoId(turnoId);
    setIsLoadingHorarios(true);
    const { data, error } = await getHorariosSalvos(turnoId);
    if (error) {
      toast({ title: 'Erro ao buscar horários', description: error, variant: 'destructive' });
    } else {
      setHorarios(data || []);
    }
    setIsLoadingHorarios(false);
  };

  const handleGerarHorario = () => {
    startGenerating(async () => {
        const result = await iniciarGeracaoHorario(escolaId, selectedTurnoId);
        if (result.error) {
            toast({ title: 'Erro ao iniciar geração', description: result.error, variant: 'destructive' });
        } else {
            toast({ title: 'Geração Iniciada!', description: 'Um novo rascunho de horário foi criado.'});
            // Refetch horarios list
            handleTurnoChange(selectedTurnoId);
        }
    });
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
              <Bot className="h-6 w-6 text-primary" />
              Passo 2: Geração do Horário
            </CardTitle>
            <CardDescription>
              Verifique a consistência dos dados e gere uma nova versão do horário para o turno <span className="font-semibold text-foreground">{selectedTurno.nome}</span>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4">
              <Button size="lg" className="flex-1">
                <List className="mr-2 h-4 w-4" />
                Verificar Dados (Checklist)
              </Button>
              <Button size="lg" onClick={handleGerarHorario} disabled={isGenerating} className="flex-1">
                {isGenerating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                    <PlusCircle className="mr-2 h-4 w-4" />
                )}
                Gerar Novo Horário
              </Button>
            </div>
          </CardContent>
          <CardFooter>
             <p className="text-xs text-muted-foreground">
                Ao clicar em "Gerar", nosso assistente de IA criará uma nova proposta de horário. Esse processo pode levar alguns minutos.
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
                            <Card key={h.id} className="bg-muted/50">
                                <CardHeader>
                                    <CardTitle className="flex items-center justify-between">
                                        {h.nome}
                                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${h.status === 'publicado' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                            {h.status === 'publicado' ? 'Publicado' : 'Rascunho'}
                                        </span>
                                    </CardTitle>
                                    <CardDescription>
                                        Criado em {format(new Date(h.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                                    </CardDescription>
                                </CardHeader>
                                <CardFooter>
                                    <Button className="w-full">
                                        <FileText className="mr-2 h-4 w-4" />
                                        Visualizar e Editar
                                    </Button>
                                </CardFooter>
                            </Card>
                        ))}
                    </div>
                ) : (
                    <p className="text-center text-muted-foreground p-8">Nenhum horário gerado para este turno ainda.</p>
                )}
            </CardContent>
        </Card>
      )}
    </div>
  );
}
