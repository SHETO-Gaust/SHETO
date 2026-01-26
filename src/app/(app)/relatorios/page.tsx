import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { getFormacoesForRelatorios } from './actions';
import { RelatoriosClient } from './relatorios-client';

export default async function RelatoriosPage() {
    const formacoes = await getFormacoesForRelatorios();

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Relatórios de Participação</CardTitle>
                    <CardDescription>
                        Selecione as formações que deseja analisar e clique em "Gerar Relatórios" para visualizar os dados de frequência.
                    </CardDescription>
                </CardHeader>
            </Card>
            <RelatoriosClient allFormacoes={formacoes} />
        </div>
    );
}
