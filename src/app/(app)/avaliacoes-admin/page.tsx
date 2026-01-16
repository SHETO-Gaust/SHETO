import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { getAvaliationsSummary } from "./actions";
import { Star, Users, BarChart3 } from "lucide-react";
import Link from 'next/link';
import { Button } from "@/components/ui/button";

const questionsMap = {
    dominio_tema: 'Domínio do Tema',
    relevancia_profissional: 'Relevância Profissional',
    contribuicao_tema: 'Contribuição do Tema',
    metodologia_adequada: 'Metodologia Adequada'
};

const AverageDisplay = ({ label, value, max = 5 }: { label: string, value: number, max?: number }) => (
    <div className="flex justify-between items-center text-sm">
        <p className="text-muted-foreground">{label}</p>
        <div className="flex items-center gap-2 font-semibold">
            <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
            <span>{value.toFixed(1)} / {max}</span>
        </div>
    </div>
);


export default async function AvaliacoesAdminPage() {
    const summaryData = await getAvaliationsSummary();

    return (
        <div className="space-y-6">
             <Card>
                <CardHeader>
                    <CardTitle>Resultados das Avaliações</CardTitle>
                    <CardDescription>
                        Acompanhe a média geral das avaliações enviadas para cada formação.
                    </CardDescription>
                </CardHeader>
            </Card>

            {summaryData.length > 0 ? (
                <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
                    {summaryData.map(summary => (
                        <Card key={summary.formacao.id} className="flex flex-col">
                            <CardHeader>
                                <CardTitle>{summary.formacao.name}</CardTitle>
                                <CardDescription className="flex items-center gap-2 pt-1">
                                    <Users className="h-4 w-4" />
                                    {summary.totalAvaliacoes} {summary.totalAvaliacoes === 1 ? 'avaliação recebida' : 'avaliações recebidas'}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="flex-grow space-y-4">
                                {summary.totalAvaliacoes > 0 ? (
                                    <>
                                        <div>
                                            <h4 className="font-semibold mb-2">Média Geral dos Formadores</h4>
                                            <div className="space-y-1 rounded-md border p-3">
                                                {Object.entries(summary.formadoresAvg).map(([key, value]) => (
                                                     <AverageDisplay key={key} label={questionsMap[key as keyof typeof questionsMap]} value={value} max={5} />
                                                ))}
                                            </div>
                                        </div>
                                         <div>
                                            <h4 className="font-semibold mb-2">Média da Organização e Infraestrutura</h4>
                                            <div className="space-y-1 rounded-md border p-3">
                                                <AverageDisplay label="Organização e Infraestrutura" value={summary.infraestruturaAvg} max={5} />
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="text-center text-muted-foreground py-10">
                                        <p>Nenhuma avaliação recebida para esta formação ainda.</p>
                                    </div>
                                )}
                            </CardContent>
                            <CardFooter>
                                <Link href={`/avaliacoes-admin/${summary.formacao.id}`} passHref className="w-full">
                                    <Button className="w-full" disabled={summary.totalAvaliacoes === 0}>
                                        <BarChart3 className="mr-2 h-4 w-4" />
                                        Ver Detalhes
                                    </Button>
                                </Link>
                            </CardFooter>
                        </Card>
                    ))}
                </div>
            ) : (
                 <div className="text-center text-muted-foreground border-2 border-dashed rounded-lg p-12">
                    <p className="text-lg">Nenhuma formação encontrada.</p>
                    <p className="text-sm">Cadastre uma formação para começar a receber avaliações.</p>
                </div>
            )}
        </div>
    );
}
