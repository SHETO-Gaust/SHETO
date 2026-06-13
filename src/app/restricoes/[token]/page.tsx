
import { getSolicitacaoByToken } from "@/app/(app)/professores/actions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { RestricoesProfessorPublicClient } from "./restricoes-professor-public-client";

export default async function PublicRestrictionPage({ params }: { params: { token: string } }) {
  const { token } = await params;
  const { data, error } = await getSolicitacaoByToken(token);

  if (error || !data) {
    const isAlreadyResponded = error?.includes('já foi respondida');

    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center py-8">
          <CardHeader>
            <div className={cn("mx-auto h-16 w-16 rounded-full flex items-center justify-center mb-4", isAlreadyResponded ? "bg-green-100 dark:bg-green-900/50" : "bg-destructive/10")}>
                {isAlreadyResponded ? (
                    <CheckCircle2 className="h-8 w-8 text-green-600" />
                ) : (
                    <AlertTriangle className="h-8 w-8 text-destructive" />
                )}
            </div>
            <CardTitle>{isAlreadyResponded ? 'Solicitação Respondida' : 'Link Inválido ou Expirado'}</CardTitle>
            <CardDescription>
                {isAlreadyResponded 
                    ? 'Esta solicitação de disponibilidade já foi preenchida e enviada para a coordenação.' 
                    : (error || 'Esta solicitação não está mais disponível.')}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const { professor, turnos } = data;

  return (
    <div className="min-h-screen bg-muted/20 pb-12">
      <header className="bg-background border-b shadow-sm sticky top-0 z-30">
          <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
              <div className="flex items-center gap-3">
                  <Clock className="h-6 w-6 text-primary" />
                  <span className="font-bold text-xl tracking-tight">SHE</span>
              </div>
              <div className="text-right hidden sm:block">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Unidade Escolar</p>
                  <p className="text-sm font-bold text-primary truncate max-w-[200px]">{professor.escola.escolar}</p>
              </div>
          </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 pt-8 space-y-8">
          <div className="space-y-2">
              <h1 className="text-3xl font-black text-foreground leading-tight">Olá, Prof. {professor.nome_horario}</h1>
              <p className="text-slate-600 text-lg">
                  Informe abaixo seus horários de <strong>indisponibilidade</strong> para que possamos organizar a grade horária.
              </p>
          </div>

          <RestricoesProfessorPublicClient 
            token={token} 
            professor={professor} 
            turnos={turnos} 
          />
      </main>

      <footer className="mt-12 text-center text-[10px] text-muted-foreground uppercase tracking-widest pb-8">
          Secretaria da Educação do Tocantins © 2026
      </footer>
    </div>
  );
}

import { cn } from "@/lib/utils";
