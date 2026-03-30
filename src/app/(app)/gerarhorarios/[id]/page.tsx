
import { getHorarioDetalhado } from "../actions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { VisualizadorHorarioClient } from "./visualizador-horario-client";

export default async function DetalhesHorarioPage({ params }: { params: { id: string } }) {
  const { id } = await params;
  const { data: horario, error } = await getHorarioDetalhado(id);

  if (error || !horario) {
    return (
      <div className="p-6">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle /> Erro ao carregar horário
            </CardTitle>
            <CardDescription>{error || 'Não foi possível carregar os detalhes do horário.'}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/gerarhorarios">
              <Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" /> Voltar</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{horario.nome}</h1>
          <p className="text-sm text-muted-foreground">
            Visualizando grade para o turno: <span className="font-semibold text-foreground">{horario.turno.nome}</span>
          </p>
        </div>
        <Link href="/gerarhorarios">
          <Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" /> Voltar</Button>
        </Link>
      </div>

      <VisualizadorHorarioClient horario={horario} />
    </div>
  );
}
