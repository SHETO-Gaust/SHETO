'use client';

import { useState } from 'react';
import type { Turno } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { getChecklistReportData, getDadosInstituicao, getRestricoesProfessores, getHorariosTurmas } from './actions';
import { useToast } from '@/hooks/use-toast';
import { ChecklistReport } from './_components/checklist-report';
import { ReportPlaceholder } from './_components/report-placeholder';

type RelatoriosClientProps = {
  escolaId: string;
  turnos: Turno[];
};

type ReportType = 'situacao' | 'dados' | 'restricoes' | 'horarios';

const reportCards = [
    { id: 'situacao', title: '1. Situação dos Dados Cadastrados', description: 'Exibe o status do cadastro de todas as etapas do sistema.' },
    { id: 'dados', title: '2. Dados Cadastrados da Instituição', description: 'Exibe os dados cadastrados por Turno: Turmas, Professores, Disciplinas e Número de Aulas.' },
    { id: 'restricoes', title: '3. Restrições dos Professores', description: 'Exibe as restrições (folgas) dos professores por Turno.' },
    { id: 'horarios', title: '4. Horários selecionados para as Turmas', description: 'Exibe os horários de aulas definidos para cada Turma.' },
];

export function RelatoriosClient({ escolaId, turnos }: RelatoriosClientProps) {
  const [selectedTurnoId, setSelectedTurnoId] = useState<string | null>(null);
  const [activeReport, setActiveReport] = useState<ReportType | null>(null);
  const [loadingReport, setLoadingReport] = useState<ReportType | null>(null);
  const [reportData, setReportData] = useState<any>(null);
  const { toast } = useToast();

  const handleGenerateReport = async (reportType: ReportType) => {
    if (!selectedTurnoId) {
        toast({ title: 'Selecione um turno primeiro', variant: 'destructive' });
        return;
    }
    setLoadingReport(reportType);
    setActiveReport(null);
    setReportData(null);

    let result;
    try {
        switch (reportType) {
            case 'situacao':
                result = await getChecklistReportData(escolaId, selectedTurnoId!);
                break;
            case 'dados':
                result = await getDadosInstituicao(escolaId, selectedTurnoId!);
                break;
            case 'restricoes':
                result = await getRestricoesProfessores(escolaId, selectedTurnoId!);
                break;
            case 'horarios':
                result = await getHorariosTurmas(escolaId, selectedTurnoId!);
                break;
        }

        if (result.error) {
            throw new Error(result.error);
        }
        
        setReportData(result.data);
        setActiveReport(reportType);

    } catch (error: any) {
        toast({ title: 'Erro ao gerar relatório', description: error.message, variant: 'destructive'});
    } finally {
        setLoadingReport(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row items-start gap-8">
        <div className="flex md:flex-col items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">1</div>
            <div className="h-px w-16 md:h-24 md:w-px bg-border"></div>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">2</div>
        </div>
        <div className="flex-1 space-y-8 w-full">
            <Card>
                <CardHeader>
                    <CardTitle>Selecione o Turno</CardTitle>
                    <CardDescription>Selecione o turno para o qual deseja gerar o relatório.</CardDescription>
                </CardHeader>
                <CardContent>
                    <RadioGroup value={selectedTurnoId || ''} onValueChange={setSelectedTurnoId}>
                        <div className="flex flex-wrap gap-4">
                            {turnos.length > 0 ? turnos.map(turno => (
                                <div key={turno.id} className="flex items-center space-x-2">
                                    <RadioGroupItem value={turno.id} id={`turno-${turno.id}`} />
                                    <Label htmlFor={`turno-${turno.id}`}>{turno.nome}</Label>
                                </div>
                            )) : (
                                <p className="text-sm text-muted-foreground">Nenhum turno ativo encontrado. Cadastre um em "Dados do Horário" &gt; "Turno".</p>
                            )}
                        </div>
                    </RadioGroup>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Selecione o Relatório</CardTitle>
                    <CardDescription>Clique no botão para visualizar o relatório desejado.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {reportCards.map(report => {
                            const isDisabled = !selectedTurnoId;
                            const isLoading = loadingReport === report.id;
                            
                            return (
                                <Card key={report.id} className="bg-muted/50 p-4 flex flex-col justify-between">
                                    <div>
                                        <h3 className="font-semibold">{report.title}</h3>
                                        <p className="text-sm text-muted-foreground mt-1">{report.description}</p>
                                    </div>
                                    <Button 
                                        className="mt-4 w-full" 
                                        onClick={() => handleGenerateReport(report.id as ReportType)}
                                        disabled={isDisabled || isLoading}
                                    >
                                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Gerar Relatório
                                    </Button>
                                </Card>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>
        </div>
      </div>
      
      {activeReport && reportData && (
        <div className="mt-8">
            {activeReport === 'situacao' && <ChecklistReport data={reportData} />}
            {activeReport === 'dados' && <ReportPlaceholder data={reportData} title="Dados Cadastrados da Instituição" />}
            {activeReport === 'restricoes' && <ReportPlaceholder data={reportData} title="Restrições dos Professores" />}
            {activeReport === 'horarios' && <ReportPlaceholder data={reportData} title="Horários Selecionados para as Turmas" />}
        </div>
      )}
    </div>
  );
}
