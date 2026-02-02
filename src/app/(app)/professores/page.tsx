import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import type { Profile, ComponenteCurricular, Turno } from "@/lib/types";
import { getProfessores } from "./actions";
import { AlertTriangle } from "lucide-react";
import { ProfessoresClient } from "./professores-client";

export default async function ProfessoresPage() {
  const cookieStore = cookies();
  const supabase = await createClient(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return <Card><CardHeader><CardTitle>Erro</CardTitle><CardDescription>Usuário não encontrado.</CardDescription></CardHeader></Card>;
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
            Por favor, selecione uma escola no menu superior para gerenciar os professores.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  
  const { data: professores, error: profError } = await getProfessores(escolaId);
  
  // Fetch supporting data for the forms
  const { data: turnos, error: turnoError } = await supabase.from('turnos').select('*').eq('escola_id', escolaId).eq('ativo', true);
  const { data: componentes, error: compError } = await supabase.from('componentes_curriculares').select('*').eq('escola_id', escolaId);
  const error = profError || turnoError || compError;


  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
            <CardTitle>Professores</CardTitle>
            <CardDescription>
                Gerencie os professores da sua escola, suas disciplinas e restrições de horário.
            </CardDescription>
        </CardHeader>
        <CardContent>
            {error && <p className="text-destructive">{error}</p>}
            {professores && (
                <ProfessoresClient 
                    initialProfessores={professores} 
                    escolaId={escolaId}
                    turnosDaEscola={turnos as Turno[] || []}
                    componentesDaEscola={componentes as ComponenteCurricular[] || []}
                />
            )}
        </CardContent>
      </Card>
    </div>
  );
}
