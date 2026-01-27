import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getActiveFormations } from './actions';
import { EnsalamentoClient } from './ensalamento-client';

export default async function EnsalamentosPage() {
    const activeFormations = await getActiveFormations();

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Gerenciamento de Ensalamentos</CardTitle>
                    <CardDescription>
                        Crie e gerencie o ensalamento para as formações ativas. Siga os passos para distribuir os participantes em salas.
                    </CardDescription>
                </CardHeader>
            </Card>
            <EnsalamentoClient formations={activeFormations} />
        </div>
    );
}
