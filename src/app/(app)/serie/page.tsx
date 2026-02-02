import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { getSeries, getSerieDependencies } from "./actions";
import { AlertTriangle } from "lucide-react";
import { SerieClient } from "./serie-client";

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

  // Calcula a carga horária atribuída para cada professor
  const assignedClassesMap = new Map<string, number>();
  if (series) {
    for (const s of series) {
      for (const sc of s.componentes) {
        if (sc.professor_id) {
          const currentCount = assignedClassesMap.get(sc.professor_id) || 0;
          assignedClassesMap.set(sc.professor_id, currentCount + sc.aulas_semanais);
        }
      }
    }
  }
  const professoresComCarga = dependencies.professores.map(prof => ({
    ...prof,
    aulas_atribuidas: assignedClassesMap.get(prof.id) || 0,
  }));

  const dependenciesComCarga = {
    ...dependencies,
    professores: professoresComCarga
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
            <CardTitle>Séries</CardTitle>
            <CardDescription>
                Gerencie as séries da sua unidade escolar, sua carga horária e restrições.
            </CardDescription>
        </CardHeader>
        <CardContent>
            {error && <p className="text-destructive">{error}</p>}
            {series && <SerieClient 
                initialSeries={series} 
                escolaId={escolaId}
                dependencies={dependenciesComCarga}
            />}
        </CardContent>
      </Card>
    </div>
  );
}
