
import { createClient } from "@/lib/supabase/server";
import { getTurnosAtivos } from "./actions";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AlertTriangle, UserX } from "lucide-react";
import { SubstituicoesClient } from "./substituicoes-client";
import { getProfessores } from "../professores/actions";
import { StepNavigation } from "@/components/step-navigation";

export default async function SubstituicoesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('ue')
    .eq('id', user.id)
    .single();

  const escolaId = profile?.ue;

  if (!escolaId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><AlertTriangle /> Escola não selecionada</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  const { data: turnos } = await getTurnosAtivos(escolaId);
  const { data: professores } = await getProfessores(escolaId);

  return (
    <div className="space-y-6">
        <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
                <UserX className="h-6 w-6 text-primary" />
                Passo 10: Substituições Temporárias
            </h1>
            <p className="text-sm text-muted-foreground">Gerencie a ausência de professores e encontre substitutos disponíveis no momento.</p>
        </div>

        <SubstituicoesClient 
            escolaId={escolaId} 
            turnos={turnos || []} 
            professores={professores || []} 
        />

        <StepNavigation currentStep={10} />
    </div>
  );
}
