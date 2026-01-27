import { notFound } from 'next/navigation';
import * as actions from '../actions';
import { EnsalamentoClient } from '../ensalamento-client';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default async function EnsalamentoViewPage({ params }: { params: { id: string } }) {
    const ensalamento = await actions.getEnsalamentoDetails(params.id);

    if (!ensalamento) {
        notFound();
    }

    const activeFormations = await actions.getActiveFormationsWithCount();

    return (
        <div className="space-y-6">
             <Card>
                <CardHeader>
                    <CardTitle>Visualizando Ensalamento: {ensalamento.name}</CardTitle>
                    <CardDescription>
                        Formação: {ensalamento.formacoes?.name || 'N/A'}. Você pode continuar editando este ensalamento.
                    </CardDescription>
                </CardHeader>
            </Card>
            <EnsalamentoClient formations={activeFormations} initialEnsalamento={ensalamento} />
        </div>
    );
}
