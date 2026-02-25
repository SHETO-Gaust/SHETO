import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import type { Profile } from "@/lib/types";
import { getComponentes } from "./actions";
import { AlertTriangle } from "lucide-react";
import { ComponentesClient } from "./componentes-client";
import { StepNavigation } from "@/components/step-navigation";

export default async function ComponentesPage() {
  const cookieStore = cookies();
  const supabase = await createClient(cookieStore);

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
            Por favor, selecione uma escola no menu superior para gerenciar os componentes curriculares.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  
  const { data: componentes, error } = await getComponentes(escolaId);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
            <CardTitle>Passo 3: Componentes Curriculares</CardTitle>
            <CardDescription>
                Gerencie os componentes curriculares (disciplinas) e suas siglas para a escola selecionada.
            </CardDescription>
        </CardHeader>
        <CardContent>
            {error && <p className="text-destructive">{error}</p>}
            {componentes && <ComponentesClient initialComponentes={componentes} escolaId={escolaId} />}
        </CardContent>
      </Card>
      <StepNavigation currentStep={3} />
    </div>
  );
}
