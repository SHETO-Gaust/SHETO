import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getParticipationSummaries } from './actions';
import { RelatorioCard } from '@/components/relatorios/relatorio-card';
import type { ParticipacaoSummary } from '@/lib/types';
import { FileText } from "lucide-react";

export default async function RelatoriosPage() {
    const summaries: ParticipacaoSummary[] = await getParticipationSummaries();

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Relatórios de Participação</CardTitle>
                    <CardDescription>
                        Acompanhe a participação e a frequência em cada formação.
                    </CardDescription>
                </CardHeader>
            </Card>
            
            {summaries.length > 0 ? (
                <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
                    {summaries.map((summary) => (
                        <RelatorioCard key={summary.formacao.id} summary={summary} />
                    ))}
                </div>
            ) : (
                <div className="text-center text-muted-foreground border-2 border-dashed rounded-lg p-12 mt-6">
                    <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
                    <h3 className="mt-4 text-lg font-semibold">Nenhum relatório para exibir</h3>
                    <p className="mt-1 text-sm">Ainda não há formações ou dados de participação para gerar relatórios.</p>
                </div>
            )}
        </div>
    );
}
