
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { getTurmas, getEnsalamentoDependencies } from "./actions";
import { AlertTriangle } from "lucide-react";
import { TurmasClient } from "./turmas-client";
import { StepNavigation } from "@/components/step-navigation";

export default async function TurmasPage() {
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
            Por favor, selecione uma escola no menu superior para gerenciar as turmas.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  
  const { data: turmas, error } = await getTurmas(escolaId);
  const dependencies = await getEnsalamentoDependencies(escolaId);
  
  // Calcula a carga horária atribuída e as alocações para cada professor
  const assignedClassesMap = new Map<string, number>();
  const professorAlocacoesMap = new Map<string, { turma_nome: string, serie_nome: string; aulas: number; componente_nome: string }[]>();

  if (turmas && dependencies.series) {
    for (const turma of turmas) {
      const serie = dependencies.series.find(s => s.id === turma.serie_id);
      if (!serie) continue;

      for (const ensalamento of turma.professores) {
        const componenteDaSerie = serie.componentes.find(c => c.componente_id === ensalamento.componente_id);
        if (componenteDaSerie) {
            const aulas = (componenteDaSerie.aulas_presenciais || 0) + (componenteDaSerie.aulas_nao_presenciais || 0);
            const profId = ensalamento.professor_id;
            
            // Atualiza total de aulas
            const currentTotal = assignedClassesMap.get(profId) || 0;
            assignedClassesMap.set(profId, currentTotal + aulas);

            // Atualiza mapa de alocações
            const currentAlocacoes = professorAlocacoesMap.get(profId) || [];
            currentAlocacoes.push({
                serie_nome: serie.nome,
                turma_nome: turma.nome,
                aulas: aulas,
                componente_nome: (componenteDaSerie as any).componente?.sigla || (componenteDaSerie as any).componente?.nome || 'Disc.'
            });
            professorAlocacoesMap.set(profId, currentAlocacoes);
        }
      }
    }
  }

  const professoresComCarga = dependencies.professores.map(prof => ({
    ...prof,
    aulas_atribuidas: assignedClassesMap.get(prof.id) || 0,
    alocacoes: professorAlocacoesMap.get(prof.id) || [],
  }));

  const dependenciesComCarga = {
    ...dependencies,
    professores: professoresComCarga
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
            <CardTitle>Passo 6: Turmas</CardTitle>
            <CardDescription>
                Gerencie as turmas de cada série e aloque os professores para as disciplinas correspondentes.
            </CardDescription>
        </CardHeader>
        <CardContent>
            {error && <p className="text-destructive">{error}</p>}
            {turmas && <TurmasClient 
                initialTurmas={turmas} 
                escolaId={escolaId}
                dependencies={dependenciesComCarga}
            />}
        </CardContent>
      </Card>
      <StepNavigation currentStep={6} />
    </div>
  );
}
