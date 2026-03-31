
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { getTurnosAtivos } from "./actions";
import { AlertTriangle, Search } from "lucide-react";
import { VisualizadorOperacionalClient } from "./visualizador-operacional-client";
import { StepNavigation } from "@/components/step-navigation";

export default async function VisualizarHorarioPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Erro</CardTitle>
          <CardDescription>Usuário não encontrado.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('ue')
    .eq('id', user.id)
    .single<Pick<Profile, 'ue'>>();

  const escolaId = profile?.ue;

  if (!escolaId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><AlertTriangle /> Nenhuma Escola Selecionada</CardTitle>
          <CardDescription>
            Por favor, selecione uma escola no menu superior para visualizar os horários oficiais.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  
  const { data: turnosAtivos, error } = await getTurnosAtivos(escolaId);

  if (error) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><AlertTriangle /> Erro ao carregar</CardTitle>
                <CardDescription>{error}</CardDescription>
            </CardHeader>
        </Card>
    );
  }

  if (!turnosAtivos || turnosAtivos.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><AlertTriangle /> Nenhum Turno Ativo</CardTitle>
          <CardDescription>
            Não há turnos ativos cadastrados. Ative pelo menos um turno para visualizar horários.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
        <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
                <Search className="h-6 w-6 text-primary" />
                Passo 8: Visualizar Horário Oficial
            </h1>
            <p className="text-sm text-muted-foreground">Consulte as grades horárias que já foram consolidadas e estão em vigor na unidade escolar.</p>
        </div>
        
        <VisualizadorOperacionalClient turnosAtivos={turnosAtivos} />
        
        <StepNavigation currentStep={8} />
    </div>
  );
}
