
'use client';

import { useState } from 'react';
import type { Turno } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, AlertTriangle, CheckCircle2, Users, CalendarDays, ClipboardCheck, BarChart3 } from 'lucide-react';
import { getChecklistReportData, getWorkloadReportData, getBottleneckReportData } from './actions';
import { useToast } from '@/hooks/use-toast';
import { ChecklistReport } from './_components/checklist-report';
import { WorkloadReport } from './_components/workload-report';
import { BottleneckReport } from './_components/bottleneck-report';

type RelatoriosClientProps = {
  escolaId: string;
  turnos: Turno[];
};

type ReportType = 'checklist' | 'workload' | 'bottleneck';

const reportCards = [
    { id: 'checklist', title: 'Checklist de Configuração', description: 'Auditoria completa dos passos 1 ao 6 para garantir que o horário possa ser gerado.', icon: ClipboardCheck },
    { id: 'workload', title: 'Carga Horária Docente', description: 'Comparativo detalhado entre aulas atribuídas e contrato do professor.', icon: Users },
    { id: 'bottleneck', title: 'Mapa de Disponibilidade', description: 'Identifica horários críticos onde faltam professores para cobrir todas as turmas.', icon: CalendarDays },
];

export function RelatoriosClient({ escolaId, turnos }: RelatoriosClientProps) {
  const [selectedTurnoId, setSelectedTurnoId] = useState<string | null>(turnos[0]?.id || null);
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
    
    try {
        let result;
        if (reportType === 'checklist') result = await getChecklistReportData(escolaId, selectedTurnoId);
        else if (reportType === 'workload') result = await getWorkloadReportData(escolaId, selectedTurnoId);
        else result = await getBottleneckReportData(escolaId, selectedTurnoId);

        if (result.error) throw new Error(result.error);
        
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
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Card className="lg:col-span-1 border-primary/10">
            <CardHeader className="pb-4">
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" /> 1. Turno de Análise
                </CardTitle>
            </CardHeader>
            <CardContent>
                <RadioGroup value={selectedTurnoId || ''} onValueChange={setSelectedTurnoId} className="space-y-3">
                    {turnos.map(turno => (
                        <div key={turno.id} className={`flex items-center space-x-3 p-3 rounded-lg border transition-all cursor-pointer hover:bg-muted/50 ${selectedTurnoId === turno.id ? 'border-primary bg-primary/5' : 'border-transparent'}`}>
                            <RadioGroupItem value={turno.id} id={`turno-${turno.id}`} />
                            <Label htmlFor={`turno-${turno.id}`} className="flex-1 cursor-pointer font-semibold">{turno.nome}</Label>
                        </div>
                    ))}
                </RadioGroup>
            </CardContent>
        </Card>

        <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4">
            {reportCards.map(report => (
                <Card key={report.id} className={`group hover:border-primary/50 transition-all cursor-pointer ${activeReport === report.id ? 'border-primary ring-1 ring-primary/20 shadow-md' : 'bg-muted/30'}`} onClick={() => handleGenerateReport(report.id as ReportType)}>
                    <CardHeader>
                        <report.icon className={`h-8 w-8 mb-2 transition-colors ${activeReport === report.id ? 'text-primary' : 'text-muted-foreground group-hover:text-primary'}`} />
                        <CardTitle className="text-base">{report.title}</CardTitle>
                        <CardDescription className="text-xs line-clamp-2">{report.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button variant={activeReport === report.id ? "default" : "outline"} className="w-full text-xs font-bold" disabled={loadingReport === report.id}>
                            {loadingReport === report.id ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : null}
                            {activeReport === report.id ? "Atualizar" : "Gerar Dados"}
                        </Button>
                    </CardContent>
                </Card>
            ))}
        </div>
      </div>
      
      {activeReport && reportData && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {activeReport === 'checklist' && <ChecklistReport data={reportData} />}
            {activeReport === 'workload' && <WorkloadReport data={reportData} />}
            {activeReport === 'bottleneck' && <BottleneckReport data={reportData} />}
        </div>
      )}
    </div>
  );
}
