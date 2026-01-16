import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AvaliacaoDetalhesPage({ params }: { params: { id: string } }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Dashboard de Avaliação (Em Construção)</CardTitle>
                <CardDescription>
                    Formação ID: {params.id}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <p>Esta página irá exibir gráficos interativos e detalhes das avaliações para esta formação.</p>
            </CardContent>
        </Card>
    );
}
