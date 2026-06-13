
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, CheckCircle2, User } from "lucide-react";

export function WorkloadReport({ data }: { data: any[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Auditoria de Carga Horária Docente</CardTitle>
        <CardDescription>
          Verificação das aulas atribuídas em turmas versus a carga horária disponível no cadastro de cada professor.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Professor</TableHead>
                <TableHead className="text-center">Aulas Atribuídas</TableHead>
                <TableHead className="text-center">Carga Disponível</TableHead>
                <TableHead className="w-[200px]">Utilização</TableHead>
                <TableHead className="text-right">Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((prof) => {
                const isOverloaded = prof.atribuido > prof.disponivel;
                const isUnderloaded = prof.atribuido < prof.disponivel;
                const percent = Math.min((prof.atribuido / prof.disponivel) * 100, 100);

                return (
                  <TableRow key={prof.id} className={isOverloaded ? "bg-destructive/5" : ""}>
                    <TableCell className="font-bold">
                        <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            {prof.nome}
                        </div>
                    </TableCell>
                    <TableCell className="text-center font-semibold">{prof.atribuido} aulas</TableCell>
                    <TableCell className="text-center text-muted-foreground">{prof.disponivel} aulas</TableCell>
                    <TableCell>
                        <div className="space-y-1">
                            <Progress value={percent} className={isOverloaded ? "[&>div]:bg-destructive" : ""} />
                            <p className="text-[10px] text-right font-medium text-muted-foreground">{Math.round((prof.atribuido / prof.disponivel) * 100)}%</p>
                        </div>
                    </TableCell>
                    <TableCell className="text-right">
                        {isOverloaded ? (
                            <Badge variant="destructive" className="gap-1">
                                <AlertCircle className="h-3 w-3" /> Sobrecarga (+{Math.abs(prof.saldo)})
                            </Badge>
                        ) : isUnderloaded ? (
                            <Badge variant="outline" className="text-orange-600 border-orange-200 bg-orange-50 gap-1 dark:text-orange-400 dark:border-orange-800 dark:bg-orange-950/30">
                                <AlertCircle className="h-3 w-3" /> Subutilizado (-{prof.saldo})
                            </Badge>
                        ) : (
                            <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 gap-1 dark:text-green-400 dark:border-green-800 dark:bg-green-950/30">
                                <CheckCircle2 className="h-3 w-3" /> Carga Exata
                            </Badge>
                        )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
