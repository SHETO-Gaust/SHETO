import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { getFinishedFormacoes } from './actions';
import { MetricasClient } from './metricas-client';

export default async function MetricasGeraisPage() {
    const formacoes = await getFinishedFormacoes();

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Métricas Gerais</CardTitle>
                    <CardDescription>
                        Selecione as formações concluídas que deseja analisar e clique em "Gerar Métricas" para visualizar os dados consolidados.
                    </CardDescription>
                </CardHeader>
            </Card>
            <MetricasClient finishedFormacoes={formacoes} />
        </div>
    );
}
