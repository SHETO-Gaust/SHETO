import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import type { Profile } from "@/lib/types";
import { getTurnosAtivos } from "./actions";
import { AlertTriangle } from "lucide-react";
import { GeradorHorarioClient } from "./gerador-horario-client";
import { StepNavigation } from "@/components/step-navigation";

export default async function GerarHorarioPage() {
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
    <div className="space-y-6">
        <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">Passo 7: Gerar Horário</h1>
            <p className="text-sm text-muted-foreground">Utilize o algoritmo de otimização para organizar as aulas com base nos dados e restrições cadastrados.</p>
        </div>
        <GeradorHorarioClient escolaId={escolaId} turnosAtivos={turnosAtivos} />
        <StepNavigation currentStep={7} />
    </div>
  );
}
