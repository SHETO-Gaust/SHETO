import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

export default async function RestricoesPage() {
    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Restrições</CardTitle>
                    <CardDescription>
                        Gerencie as restrições de horários para professores e turmas.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <p>Página em construção.</p>
                </CardContent>
            </Card>
        </div>
    );
}
