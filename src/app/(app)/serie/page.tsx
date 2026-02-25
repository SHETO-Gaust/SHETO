import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { getSeries, getSerieDependencies } from "./actions";
import { AlertTriangle } from "lucide-react";
import { SerieClient } from "./serie-client";
import { StepNavigation } from "@/components/step-navigation";

export default async function SeriePage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Card><CardHeader><CardTitle>Erro</CardTitle><CardDescription>Usuário não encontrado.</CardDescription></CardHeader></Card>
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
            Por favor, selecione uma escola no menu superior para gerenciar as séries.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  
  const { data: series, error } = await getSeries(escolaId);
  const dependencies = await getSerieDependencies(escolaId);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
            <CardTitle>Passo 5: Séries (Modelos)</CardTitle>
            <CardDescription>
                Gerencie os modelos de série da sua unidade escolar. Defina a carga horária de cada disciplina. A criação das turmas e a alocação de professores é feita na tela de "Turmas".
            </CardDescription>
        </CardHeader>
        <CardContent>
            {error && <p className="text-destructive">{error}</p>}
            {series && <SerieClient 
                initialSeries={series} 
                escolaId={escolaId}
                dependencies={dependencies}
            />}
        </CardContent>
      </Card>
      <StepNavigation currentStep={5} />
    </div>
  );
}
