import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import type { Profile, Turno } from "@/lib/types";
import { AlertTriangle } from "lucide-react";
import { RelatoriosClient } from "./relatorios-client";

export default async function RelatoriosPage() {
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
            Por favor, selecione uma escola no menu superior para gerar relatórios.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const { data: turnos } = await supabase
    .from('turnos')
    .select('*')
    .eq('escola_id', escolaId)
    .eq('ativo', true)
    .order('nome');

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Relatórios</CardTitle>
          <CardDescription>
            Selecione o turno e o tipo de relatório que deseja visualizar.
          </CardDescription>
        </CardHeader>
        <CardContent>
            <RelatoriosClient escolaId={escolaId} turnos={turnos as Turno[] || []} />
        </CardContent>
      </Card>
    </div>
  );
}
