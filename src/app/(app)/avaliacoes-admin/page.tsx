import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import type { Profile } from "@/lib/types";
import { getTurnosAtivos } from "./actions";
import { AlertTriangle } from "lucide-react";
import { GeradorHorarioClient } from "./gerador-horario-client";

export default async function GerarHorarioPage() {
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
            Por favor, selecione uma escola no menu superior para gerar os horários.
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
            Não há turnos ativos cadastrados para esta escola. Por favor, ative pelo menos um turno na página de <span className="font-semibold">Turnos</span>.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <GeradorHorarioClient escolaId={escolaId} turnosAtivos={turnosAtivos} />
  );
}
