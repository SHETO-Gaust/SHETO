'use client';

import { useMemo, useState } from 'react';
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend, LabelList } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChartContainer, ChartTooltipContent, ChartConfig } from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Formacao, Avaliacao, Formador, Inscricao } from '@/lib/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { User, MessageSquare, Star, Building, Users } from 'lucide-react';
import { Label } from '@/components/ui/label';

type AvaliacaoDashboardProps = {
  details: {
    formacao: Formacao;
    avaliacoes: Avaliacao[];
    inscricoes: Inscricao[];
    formadores: Formador[];
  }
};

const questionsMap = {
    dominio_tema: 'Domínio do Tema',
    relevancia_profissional: 'Relevância Profissional',
    contribuicao_tema: 'Contribuição do Tema',
    metodologia_adequada: 'Metodologia Adequada'
};

const infraQuestionsMap = {
    espaco_fisico: 'Espaço Físico',
    equipe_apoio: 'Equipe de Apoio',
    internet: 'Internet',
};

const chartConfigBase = {
  '1': { label: '1 Estrela', color: 'hsl(var(--destructive))' },
  '2': { label: '2 Estrelas', color: 'hsl(var(--chart-2))' },
  '3': { label: '3 Estrelas', color: 'hsl(var(--chart-3))' },
  '4': { label: '4 Estrelas', color: 'hsl(var(--chart-4))' },
  '5': { label: '5 Estrelas', color: 'hsl(var(--chart-1))' },
} satisfies ChartConfig;

const ScoreDistributionChart = ({ title, data }: { title: string, data: any[] }) => (
  <Card>
    <CardHeader>
      <CardTitle className="text-base font-medium">{title}</CardTitle>
    </CardHeader>
    <CardContent>
      <ChartContainer config={chartConfigBase} className="h-40 w-full">
        <BarChart data={data} layout="vertical" margin={{ left: 10, right: 10 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" hide />
          <Tooltip 
            cursor={{ fill: 'hsl(var(--secondary))' }} 
            content={<ChartTooltipContent formatter={(value) => `${(value as number).toFixed(2)}%`} />} 
          />
          <Legend />
          <Bar dataKey="1" stackId="a" fill="var(--color-1)" radius={[4, 0, 0, 4]}>
            <LabelList dataKey="1" position="center" fill="white" formatter={(v: number) => v > 3 ? `${v.toFixed(2)}%` : ''} fontSize={12} />
          </Bar>
          <Bar dataKey="2" stackId="a" fill="var(--color-2)" >
            <LabelList dataKey="2" position="center" fill="black" formatter={(v: number) => v > 3 ? `${v.toFixed(2)}%` : ''} fontSize={12} />
          </Bar>
          <Bar dataKey="3" stackId="a" fill="var(--color-3)">
            <LabelList dataKey="3" position="center" fill="white" formatter={(v: number) => v > 3 ? `${v.toFixed(2)}%` : ''} fontSize={12} />
          </Bar>
          <Bar dataKey="4" stackId="a" fill="var(--color-4)">
            <LabelList dataKey="4" position="center" fill="black" formatter={(v: number) => v > 3 ? `${v.toFixed(2)}%` : ''} fontSize={12} />
          </Bar>
          <Bar dataKey="5" stackId="a" fill="var(--color-5)" radius={[0, 4, 4, 0]}>
            <LabelList dataKey="5" position="center" fill="white" formatter={(v: number) => v > 3 ? `${v.toFixed(2)}%` : ''} fontSize={12} />
          </Bar>
        </BarChart>
      </ChartContainer>
    </CardContent>
  </Card>
);

export function AvaliacaoDashboard({ details }: AvaliacaoDashboardProps) {
  const { formacao, avaliacoes, formadores, inscricoes } = details;
  const [periodo, setPeriodo] = useState('geral');
  const [formadorId, setFormadorId] = useState('geral');
  
  const formadoresOptions = useMemo(() => [
    { value: 'geral', label: 'Todos os Formadores' },
    ...formadores.map(f => ({ value: f.id, label: f.name }))
  ], [formadores]);

  const filteredAvals = useMemo(() => {
    return avaliacoes.filter(aval => {
      if (periodo === 'geral') return true;
      return aval.periodo === periodo;
    });
  }, [avaliacoes, periodo]);
  
  const { chartData, comments } = useMemo(() => {
    let avalsToProcess = filteredAvals;
    
    if (formadorId !== 'geral') {
        avalsToProcess = avalsToProcess.filter(aval => 
            aval.feedback_formadores?.some((fb: any) => fb.formador_id === formadorId)
        );
    }
    
    const formadorQuestionKeys = Object.keys(questionsMap);
    const infraQuestionKeys = Object.keys(infraQuestionsMap);
    
    const formadoresChart = formadorQuestionKeys.map(key => {
      const counts: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
      let totalFeedbacks = 0;
      avalsToProcess.forEach(aval => {
        aval.feedback_formadores?.forEach((fb: any) => {
          if (formadorId === 'geral' || fb.formador_id === formadorId) {
            const score = fb[key];
            if (score >= 1 && score <= 5) {
              counts[score]++;
              totalFeedbacks++;
            }
          }
        });
      });
      // Calculate percentage
      const percentageCounts = Object.keys(counts).reduce((acc, score) => {
        acc[score] = totalFeedbacks > 0 ? (counts[score] / totalFeedbacks) * 100 : 0;
        return acc;
      }, {} as Record<string, number>);
      return { name: questionsMap[key as keyof typeof questionsMap], ...percentageCounts };
    });

    const infraChart = infraQuestionKeys.map(key => {
        const counts: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
        let totalInfraAvals = 0;
        avalsToProcess.forEach(aval => {
            const score = aval.infraestrutura?.[key as keyof typeof infraQuestionsMap];
            if (score >= 1 && score <= 5) {
                counts[score]++;
                totalInfraAvals++;
            }
        });
        const percentageCounts = Object.keys(counts).reduce((acc, score) => {
          acc[score] = totalInfraAvals > 0 ? (counts[score] / totalInfraAvals) * 100 : 0;
          return acc;
        }, {} as Record<string, number>);
        return { name: infraQuestionsMap[key as keyof typeof infraQuestionsMap], ...percentageCounts };
    });

    const allComments = avalsToProcess.flatMap(aval => {
        const generalSugg = aval.general_suggestions ? [{
            type: 'Sugestão Geral',
            text: aval.general_suggestions,
            author: aval.nome_participante,
            target: '-'
        }] : [];
        const formadorComms = aval.feedback_formadores?.flatMap((fb: any) => fb.comentario ? [{
            type: 'Comentário do Formador',
            text: fb.comentario,
            author: aval.nome_participante,
            target: formadores.find(f => f.id === fb.formador_id)?.name || 'N/A'
        }] : []) || [];
        return [...generalSugg, ...formadorComms];
    });


    return { chartData: { formadores: formadoresChart, infra: infraChart }, comments: allComments };
  }, [filteredAvals, formadorId, formadores]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{formacao.name}</CardTitle>
          <CardDescription>
            Dashboard analítico das avaliações recebidas.
          </CardDescription>
        </CardHeader>
        <CardContent>
            <div className="flex flex-wrap gap-4">
                <div className='space-y-2'>
                  <Label>Filtrar por Período</Label>
                  <Select value={periodo} onValueChange={setPeriodo}>
                    <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="geral">Geral</SelectItem>
                      <SelectItem value="MAT">Manhã</SelectItem>
                      <SelectItem value="VESP">Tarde</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className='space-y-2'>
                  <Label>Filtrar por Formador</Label>
                   <Select value={formadorId} onValueChange={setFormadorId}>
                    <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {formadoresOptions.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
            </div>
        </CardContent>
      </Card>
      
      <div className="grid gap-4 md:grid-cols-2">
         <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Avaliações</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filteredAvals.length}</div>
            <p className="text-xs text-muted-foreground">no período selecionado</p>
          </CardContent>
        </Card>
         <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Comentários</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{comments.length}</div>
            <p className="text-xs text-muted-foreground">sugestões e comentários</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="formadores">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="formadores"><User className="mr-2 h-4 w-4" />Formadores</TabsTrigger>
          <TabsTrigger value="infra"><Building className="mr-2 h-4 w-4" />Infraestrutura</TabsTrigger>
          <TabsTrigger value="comentarios"><MessageSquare className="mr-2 h-4 w-4" />Comentários</TabsTrigger>
        </TabsList>
        <TabsContent value="formadores" className="pt-4">
            <div className="grid gap-4 md:grid-cols-2">
              {chartData.formadores.map(data => (
                <ScoreDistributionChart key={data.name} title={data.name} data={[data]} />
              ))}
            </div>
        </TabsContent>
        <TabsContent value="infra" className="pt-4">
             <div className="grid gap-4 md:grid-cols-2">
              {chartData.infra.map(data => (
                <ScoreDistributionChart key={data.name} title={data.name} data={[data]} />
              ))}
            </div>
        </TabsContent>
        <TabsContent value="comentarios" className="pt-4">
            <Card>
                <CardHeader><CardTitle>Comentários e Sugestões</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[150px]">Tipo</TableHead>
                        <TableHead className="w-[200px]">Alvo</TableHead>
                        <TableHead>Comentário</TableHead>
                        <TableHead className="w-[200px]">Autor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                        {comments.length > 0 ? comments.map((comment, index) => (
                           <TableRow key={index}>
                            <TableCell>{comment.type}</TableCell>
                            <TableCell>{comment.target}</TableCell>
                            <TableCell className="max-w-xs whitespace-pre-wrap">{comment.text}</TableCell>
                            <TableCell>{comment.author}</TableCell>
                           </TableRow>
                        )) : (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center h-24">Nenhum comentário para os filtros selecionados.</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                  </Table>
                </CardContent>
            </Card>
        </TabsContent>
      </Tabs>

    </div>
  );
}
