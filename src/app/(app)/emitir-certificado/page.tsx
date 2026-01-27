import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getFinishedFormationsWithCounts } from "./actions";
import Link from "next/link";
import { Users, Settings, Award } from "lucide-react";

export default async function EmitirCertificadoPage() {
    const formacoes = await getFinishedFormationsWithCounts();

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Emissão de Certificados</CardTitle>
                    <CardDescription>
                        Gerencie e emita os certificados para as formações que já foram concluídas.
                    </CardDescription>
                </CardHeader>
            </Card>

            {formacoes.length > 0 ? (
                <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
                    {formacoes.map((formacao) => (
                        <Card key={formacao.id}>
                            <CardHeader>
                                <CardTitle>{formacao.name}</CardTitle>
                                <CardDescription className="flex items-center pt-1">
                                    <Users className="mr-2 h-4 w-4" />
                                    {formacao.inscritosCount} {formacao.inscritosCount === 1 ? 'participante' : 'participantes'}
                                </CardDescription>
                            </CardHeader>
                             <CardContent>
                                <p className="text-sm text-muted-foreground">
                                    {formacao.certificate_config ? 'A certificação está configurada. Você já pode emitir os certificados.' : 'O primeiro passo é configurar o modelo do certificado para esta formação.'}
                                </p>
                            </CardContent>
                            <CardFooter className="gap-2">
                                 <Link href={`/emitir-certificado/${formacao.id}`} className="w-full">
                                    <Button variant="outline" className="w-full">
                                        <Settings className="mr-2 h-4 w-4" />
                                        Configurar
                                    </Button>
                                </Link>
                                <Button className="w-full" disabled={!formacao.certificate_config}>
                                    <Award className="mr-2 h-4 w-4" />
                                    Emitir Certificados
                                </Button>
                            </CardFooter>
                        </Card>
                    ))}
                </div>
            ) : (
                <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                        <p>Nenhuma formação concluída encontrada.</p>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
