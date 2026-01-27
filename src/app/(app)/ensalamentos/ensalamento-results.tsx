'use client';

import * as React from 'react';
import type { EnsalamentoResult, Inscricao } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Users, Users2, UserCheck, UserX } from 'lucide-react';

const StatCard = ({ title, value, icon: Icon }: { title: string; value: number | string; icon: React.ElementType }) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">{title}</CardTitle>
      <Icon className="h-4 w-4 text-muted-foreground" />
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">{value}</div>
    </CardContent>
  </Card>
);

const ParticipantsTable = ({ participants }: { participants: Inscricao[] }) => (
  <div className="rounded-md border max-h-96 overflow-y-auto">
    <Table>
      <TableHeader className="sticky top-0 bg-muted/50">
        <TableRow>
          <TableHead>Nome</TableHead>
          <TableHead>CPF</TableHead>
          <TableHead>Regional</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {participants.map(p => (
          <TableRow key={p.id}>
            <TableCell className="font-medium">{p.nome_completo}</TableCell>
            <TableCell>{p.cpf}</TableCell>
            <TableCell>{p.dados?.regional || 'N/A'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);


export function EnsalamentoResults({ result }: { result: EnsalamentoResult }) {
  const { salas, naoAlocados, stats } = result;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Passo 3: Resultados do Ensalamento</CardTitle>
          <CardDescription>
            Abaixo estão os resultados da distribuição dos participantes nas salas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Total de Salas" value={stats.totalSalas} icon={Users} />
            <StatCard title="Total de Participantes" value={stats.totalParticipantes} icon={Users2} />
            <StatCard title="Participantes Alocados" value={stats.totalAlocados} icon={UserCheck} />
            <StatCard title="Não Alocados" value={stats.totalNaoAlocados} icon={UserX} />
          </div>
        </CardContent>
      </Card>
      
      <Tabs defaultValue="salas">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="salas">
            <Users className="mr-2 h-4 w-4" />
            Salas Geradas ({salas.length})
          </TabsTrigger>
          <TabsTrigger value="nao-alocados" disabled={naoAlocados.length === 0}>
             <UserX className="mr-2 h-4 w-4" />
            Não Alocados ({naoAlocados.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="salas" className="pt-4">
           {salas.length > 0 ? (
                <Accordion type="single" collapsible className="w-full space-y-2">
                    {salas.map((sala, index) => (
                         <Card key={index}>
                            <AccordionItem value={`item-${index}`} className="border-b-0">
                                <AccordionTrigger className="p-4 hover:no-underline">
                                    <div className="flex flex-col items-start text-left">
                                        <h3 className="font-semibold text-lg">{sala.name}</h3>
                                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                            <span>{sala.participants.length} participante(s)</span>
                                            <Badge variant="secondary">{sala.criterionValue}</Badge>
                                        </div>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent className="p-4 pt-0">
                                    <ParticipantsTable participants={sala.participants} />
                                </AccordionContent>
                            </AccordionItem>
                         </Card>
                    ))}
                </Accordion>
           ) : (
                <Card>
                    <CardContent className="text-center h-48 flex items-center justify-center">
                        <p className="text-muted-foreground">Nenhuma sala pôde ser gerada com os critérios definidos.</p>
                    </CardContent>
                </Card>
           )}
        </TabsContent>
        <TabsContent value="nao-alocados" className="pt-4">
           <Card>
                <CardHeader>
                    <CardTitle>Participantes não Alocados</CardTitle>
                    <CardDescription>
                        Esta é a lista de participantes que não se encaixaram em nenhuma sala com base nos critérios definidos.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <ParticipantsTable participants={naoAlocados} />
                </CardContent>
           </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
