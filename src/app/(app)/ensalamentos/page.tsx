import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { getActiveFormationsWithCount, getSavedEnsalamentos } from './actions';
import { EnsalamentoClient } from './ensalamento-client';
import { Separator } from "@/components/ui/separator";
import { EnsalamentosList } from "./ensalamentos-list";

export default async function EnsalamentosPage() {
    const activeFormations = await getActiveFormationsWithCount();
    const savedEnsalamentos = await getSavedEnsalamentos();

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
            
            <Separator />

            <Card>
                <CardHeader>
                    <CardTitle>Ensalamentos Salvos</CardTitle>
                    <CardDescription>
                        Visualize e gerencie seus ensalamentos salvos.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <EnsalamentosList initialEnsalamentos={savedEnsalamentos} />
                </CardContent>
            </Card>
        </div>
    );
}
