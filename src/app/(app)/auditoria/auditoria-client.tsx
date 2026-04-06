
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
    AlertCircle, Trash2, Database, Calendar, 
    Search, Filter, Info, CheckCircle2, Clock, XCircle
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
      let totalPublicados = 0;
      let semDados = 0;
      data.forEach(row => {
          if (row.status_global === 'sem_dados') semDados++;
          if (row.status_global === 'publicado') totalPublicados++;
          row.turnos.forEach(t => {
              totalRascunhos += t.rascunhos_count;
          });
      });
      return { totalRascunhos, totalPublicados, semDados };
  }, [data]);

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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-primary/5 border-primary/20">
              <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" /> Escolas com Grade Oficial
                  </CardTitle>
              </CardHeader>
              <CardContent>
                  <p className="text-3xl font-black text-primary">{stats.totalPublicados}</p>
                  <p className="text-[10px] text-muted-foreground">Unidades com horários publicados.</p>
              </CardContent>
          </Card>

          <Card className="bg-orange-50 border-orange-200">
              <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-2">
                      <Database className="h-4 w-4" /> Total de Rascunhos
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
                  />
                  <span className="text-[10px] font-bold text-muted-foreground uppercase leading-tight">Rascunhos<br/>por Turno</span>
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
              <span className="text-xs font-bold text-muted-foreground uppercase">Limpeza em Massa:</span>
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
                          <TableHead className="text-center">Status Global</TableHead>
                          <TableHead>Turnos Ativos</TableHead>
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
                              <TableCell className="text-center">
                                  {row.status_global === 'publicado' ? (
                                      <Badge className="bg-green-500 text-white font-black text-[9px] uppercase tracking-tighter">Oficializado</Badge>
                                  ) : row.status_global === 'em_rascunho' ? (
                                      <Badge variant="outline" className="text-orange-600 border-orange-200 bg-orange-50 font-black text-[9px] uppercase tracking-tighter">Em Rascunho</Badge>
                                  ) : (
                                      <Badge variant="ghost" className="text-muted-foreground/40 font-black text-[9px] uppercase tracking-tighter">Sem Dados</Badge>
                                  )}
                              </TableCell>
                              <TableCell>
                                  <div className="flex flex-wrap gap-1">
                                      {row.turnos.map(t => (
                                          <div key={t.id} className="flex flex-col gap-0.5">
                                            <Badge variant="outline" className={cn(
                                                "text-[9px] uppercase font-bold px-1.5 h-5",
                                                t.publicado ? "bg-green-50 border-green-500 text-green-700" : t.rascunhos_count > maxDrafts ? "bg-red-50 border-red-500 text-red-700" : ""
                                            )}>
                                                {t.nome} ({t.rascunhos_count})
                                            </Badge>
                                          </div>
                                      ))}
                                      {row.turnos.length === 0 && <span className="text-[10px] text-muted-foreground italic">Nenhum turno configurado</span>}
                                  </div>
                              </TableCell>
                              <TableCell className="text-right">
                                  {row.turnos.some(t => t.rascunhos_count > 0) && (
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="ghost" size="sm" className="text-destructive hover:text-white hover:bg-destructive h-8 px-2 text-[10px] font-bold">
                                                <Trash2 className="h-3.5 w-3.5 mr-1" />
                                                Limpar Escola
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
                                  )}
                              </TableCell>
                          </TableRow>
                      ))}
                  </TableBody>
              </Table>
          </CardContent>
      </Card>

      <div className="bg-orange-50 border border-orange-200 p-4 rounded-xl flex items-start gap-3 shadow-sm">
          <Info className="h-5 w-5 text-orange-600 shrink-0 mt-0.5" />
          <p className="text-[11px] text-orange-800 leading-relaxed">
              <strong>Gestão de Armazenamento:</strong> O algoritmo de geração ganha em performance quando o volume de dados obsoletos é reduzido. Recomenda-se que as unidades escolares mantenham apenas os últimos 3 rascunhos de cada turno. A limpeza em massa remove apenas grades que não foram oficializadas.
          </p>
      </div>
    </div>
  );
}
