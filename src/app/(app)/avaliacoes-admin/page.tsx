import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { getFormacoesForAvaliacao } from './actions';
import { AvaliacoesAdminClient } from './avaliacoes-admin-client';

export default async function AvaliacoesAdminPage() {
    const formacoes = await getFormacoesForAvaliacao();

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Resultados das Avaliações</CardTitle>
                    <CardDescription>
                        Selecione as formações que deseja analisar e clique em "Gerar Resumos" para visualizar as médias.
                    </CardDescription>
                </CardHeader>
            </Card>
            <AvaliacoesAdminClient allFormacoes={formacoes} />
        </div>
    );
}
