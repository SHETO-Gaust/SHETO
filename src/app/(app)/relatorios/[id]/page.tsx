import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function RelatorioDetalhesPage({ params }: { params: { id: string } }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Relatório Detalhado</CardTitle>
                <CardDescription>
                    Análise detalhada da participação para a formação ID: {params.id}.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <p>Página em construção.</p>
            </CardContent>
        </Card>
    );
}
