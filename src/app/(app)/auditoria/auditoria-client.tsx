
'use client';

import { useState, useTransition, useMemo } from 'react';
import type { AuditoriaRow } from './actions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { 
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { 
    AlertCircle, Trash2, ShieldAlert, Database, Calendar, 
    ArrowRight, Search, Filter, Loader2, Info
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { deleteHorarioAuditoria, limparRascunhosAntigos } from './actions';
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

type Props = {
  initialData: AuditoriaRow[];
};

export function AuditoriaClient({ initialData }: Props) {
  const [data, setData] = useState(initialData);
  const [searchTerm, setSearchTerm] = useState('');
  const [maxDrafts, setMaxDrafts] = useState(5);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const filteredData = useMemo(() => {
    return data.filter(row => 
        row.escola.escolar.toLowerCase().includes(searchTerm.toLowerCase()) ||
        row.escola.regional?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [data, searchTerm]);

  const stats = useMemo(() => {
      let totalRascunhos = 0;
      let turnosExcedidos = 0;
      data.forEach(row => {
          row.turnos.forEach(t => {
              totalRascunhos += t.rascunhos_count;
              if (t.rascunhos_count > maxDrafts) turnosExcedidos++;
          });
      });
      return { totalRascunhos, turnosExcedidos };
  }, [data, maxDrafts]);

  const handleDelete = (id: string) => {
      startTransition(async () => {
          const result = await deleteHorarioAuditoria(id);
          if (result.error) {
              toast({ title: 'Erro', description: result.error, variant: 'destructive' });
          } else {
              toast({ title: 'Rascunho removido' });
              setData(prev => prev.map(row => ({
                  ...row,
                  turnos: row.turnos.map(t => ({
                      ...t,
                      rascunhos: t.rascunhos.filter(r => r.id !== id),
                      rascunhos_count: t.rascunhos.some(r => r.id === id) ? t.rascunhos_count - 1 : t.rascunhos_count
                  }))
              })));
          }
      });
  };

  const handleBulkClean = (dias: number) => {
      startTransition(async () => {
          const result = await limparRascunhosAntigos(dias);
          if (result.error) {
              toast({ title: 'Erro', description: result.error, variant: 'destructive' });
          } else {
              toast({ title: 'Limpeza concluída', description: `Rascunhos com mais de ${dias} dias foram removidos.` });
              window.location.reload();
          }
      });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-primary/5 border-primary/20">
              <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold uppercase text-muted-foreground flex items-center gap-2">
                      <Database className="h-4 w-4" /> Total de Rascunhos
                  </CardTitle>
              </CardHeader>
              <CardContent>
                  <p className="text-3xl font-black text-primary">{stats.totalRascunhos}</p>
                  <p className="text-xs text-muted-foreground">Ocupando espaço no banco de dados.</p>
              </CardContent>
          </Card>

          <Card className={cn(stats.turnosExcedidos > 0 ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200")}>
              <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold uppercase text-muted-foreground flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" /> Turnos Fora do Limite
                  </CardTitle>
              </CardHeader>
              <CardContent>
                  <p className={cn("text-3xl font-black", stats.turnosExcedidos > 0 ? "text-red-600" : "text-green-600")}>
                      {stats.turnosExcedidos}
                  </p>
                  <p className="text-xs text-muted-foreground">Turnos com mais de {maxDrafts} rascunhos.</p>
              </CardContent>
          </Card>

          <Card>
              <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold uppercase text-muted-foreground flex items-center gap-2">
                      <Filter className="h-4 w-4" /> Configurar Alerta
                  </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center gap-4">
                  <div className="flex-1">
                    <Input 
                        type="number" 
                        value={maxDrafts} 
                        onChange={(e) => setMaxDrafts(Number(e.target.value))}
                        className="h-9"
                    />
                  </div>
                  <span className="text-xs font-medium">Rascunhos/Turno</span>
              </CardContent>
          </Card>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-muted/30 p-4 rounded-xl border">
          <div className="relative w-full md:w-96">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Filtrar por escola ou regional..." 
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
          </div>

          <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-muted-foreground uppercase">Limpeza Rápida:</span>
              <Button variant="outline" size="sm" onClick={() => handleBulkClean(30)} disabled={isPending}>+30 dias</Button>
              <Button variant="outline" size="sm" onClick={() => handleBulkClean(15)} disabled={isPending}>+15 dias</Button>
              <Button variant="destructive" size="sm" onClick={() => handleBulkClean(7)} disabled={isPending}>+7 dias</Button>
          </div>
      </div>

      <Card>
          <CardContent className="p-0">
              <Table>
                  <TableHeader>
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                          <TableHead className="w-[300px]">Escola / Regional</TableHead>
                          <TableHead>Turnos Ativos</TableHead>
                          <TableHead className="text-center">Grades (Rascunho)</TableHead>
                          <TableHead className="text-right">Ações de Limpeza</TableHead>
                      </TableRow>
                  </TableHeader>
                  <TableBody>
                      {filteredData.map((row) => (
                          <TableRow key={row.escola.id} className="group">
                              <TableCell>
                                  <div className="font-bold text-foreground uppercase text-xs">{row.escola.escolar}</div>
                                  <div className="text-[10px] text-muted-foreground">{row.escola.regional} | INEP: {row.escola.inep}</div>
                              </TableCell>
                              <TableCell>
                                  <div className="flex flex-wrap gap-1">
                                      {row.turnos.map(t => (
                                          <Badge key={t.id} variant="outline" className={cn(
                                              "text-[9px] uppercase",
                                              t.rascunhos_count > maxDrafts ? "border-red-500 text-red-600 bg-red-50" : ""
                                          )}>
                                              {t.nome} ({t.rascunhos_count})
                                          </Badge>
                                      ))}
                                  </div>
                              </TableCell>
                              <TableCell className="text-center">
                                  <div className="space-y-1">
                                      {row.turnos.flatMap(t => t.rascunhos).slice(0, 3).map(r => (
                                          <div key={r.id} className="flex items-center justify-center gap-2 text-[10px] text-muted-foreground">
                                              <Calendar className="h-3 w-3" />
                                              <span>{r.nome}:</span>
                                              <span className={cn("font-bold", r.dias_vida > 15 ? "text-orange-600" : "")}>
                                                  {r.dias_vida} dias
                                              </span>
                                          </div>
                                      ))}
                                      {row.turnos.reduce((acc, t) => acc + t.rascunhos_count, 0) > 3 && (
                                          <div className="text-[9px] italic opacity-60">e outros...</div>
                                      )}
                                  </div>
                              </TableCell>
                              <TableCell className="text-right">
                                  <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                          <Button variant="ghost" size="sm" className="text-destructive hover:text-white hover:bg-destructive">
                                              <Trash2 className="h-4 w-4 mr-2" />
                                              Limpar Escola
                                          </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                          <AlertDialogHeader>
                                              <AlertDialogTitle>Limpar rascunhos desta escola?</AlertDialogTitle>
                                              <AlertDialogDescription>
                                                  Isso apagará permanentemente TODOS os rascunhos de todos os turnos da unidade <strong>{row.escola.escolar}</strong>. Horários publicados não serão afetados.
                                              </AlertDialogDescription>
                                          </AlertDialogHeader>
                                          <AlertDialogFooter>
                                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                              <AlertDialogAction 
                                                className="bg-destructive"
                                                onClick={() => {
                                                    startTransition(async () => {
                                                        for(const t of row.turnos) {
                                                            for(const r of t.rascunhos) {
                                                                await deleteHorarioAuditoria(r.id);
                                                            }
                                                        }
                                                        toast({ title: 'Escola limpa com sucesso' });
                                                        window.location.reload();
                                                    });
                                                }}
                                              >
                                                  Confirmar Limpeza
                                              </AlertDialogAction>
                                          </AlertDialogFooter>
                                      </AlertDialogContent>
                                  </AlertDialog>
                              </TableCell>
                          </TableRow>
                      ))}
                  </TableBody>
              </Table>
          </CardContent>
      </Card>

      <div className="bg-orange-50 border border-orange-200 p-4 rounded-xl flex items-start gap-3">
          <Info className="h-5 w-5 text-orange-600 shrink-0" />
          <p className="text-xs text-orange-800 leading-relaxed">
              <strong>Dica de Performance:</strong> Manter muitos rascunhos antigos aumenta o tempo de processamento do algoritmo de geração e o custo de armazenamento. Recomenda-se manter no máximo 3 rascunhos ativos por turno para cada escola.
          </p>
      </div>
    </div>
  );
}
