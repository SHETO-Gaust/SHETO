import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { getTurnos } from "./actions";
import { AlertTriangle } from "lucide-react";
import { TurnoClient } from "./turno-client";
import { StepNavigation } from "@/components/step-navigation";

export default async function TurnoPage() {
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
            Por favor, selecione uma escola no menu superior para gerenciar os turnos.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  
  const { data: turnos, error } = await getTurnos(escolaId);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
            <CardTitle>Passo 1: Turnos</CardTitle>
            <CardDescription>
                Gerencie os turnos e seus respectivos horários de aula para a escola selecionada.
            </CardDescription>
        </CardHeader>
        <CardContent>
            {error && <p className="text-destructive">{error}</p>}
            {turnos && <TurnoClient initialTurnos={turnos} escolaId={escolaId} />}
        </CardContent>
      </Card>
      <StepNavigation currentStep={1} />
    </div>
  );
}
