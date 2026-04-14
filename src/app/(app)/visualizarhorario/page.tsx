
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Search, AlertTriangle } from "lucide-react";
import { VisualizadorOperacionalClient } from "./visualizador-operacional-client";
import { StepNavigation } from "@/components/step-navigation";

export default async function VisualizarHorarioPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('ue')
    .eq('id', user.id)
    .single();

  const escolaId = profile?.ue;

  if (!escolaId) {
    return (
      <div className="p-6">
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-800"><AlertTriangle /> Nenhuma Escola Selecionada</CardTitle>
            <CardDescription className="text-orange-700">
              Selecione uma unidade escolar no menu superior para visualizar os horários oficiais.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
        <div className="space-y-1 print:hidden">
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                <Search className="h-6 w-6 text-primary" />
                Passo 8: Visualizar Horário Oficial
            </h1>
            <p className="text-sm text-muted-foreground">Portal de consulta da unidade escolar. Selecione o modo de visualização desejado.</p>
        </div>
        
        <VisualizadorOperacionalClient escolaId={escolaId} />
        
        <StepNavigation currentStep={8} />
    </div>
  );
}
