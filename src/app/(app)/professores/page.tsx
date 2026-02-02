import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import type { Profile, ComponenteCurricular, Turno } from "@/lib/types";
import { getProfessores } from "./actions";
import { AlertTriangle } from "lucide-react";

// CORREÇÃO DO NOME DO ARQUIVO:
// Adicionado o "es" para bater com o nome do arquivo que você possui na pasta.
import { ProfessoresClient } from "./professores-client";

export default async function ProfessoresPage() {
  // No Next 15, cookies() deve ser aguardado se for passado como argumento,
  // mas o ideal é que o createClient() já faça isso internamente.
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="p-4">
        <Card><CardHeader><CardTitle>Erro</CardTitle><CardDescription>Usuário não encontrado.</CardDescription></CardHeader></Card>
      </div>
    );
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('ue')
    .eq('id', user.id)
    .single();

  const escolaId = profile?.ue;

  if (!escolaId) {
    return (
      <div className="p-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><AlertTriangle /> Nenhuma Escola Selecionada</CardTitle>
            <CardDescription>
              Por favor, selecione uma escola no menu superior para gerenciar os professores.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }
  
  // Buscas de dados (Aguardando as promises)
  const { data: professores, error: profError } = await getProfessores(escolaId);
  const { data: turnos } = await supabase.from('turnos').select('*').eq('escola_id', escolaId).eq('ativo', true);
  const { data: componentes } = await supabase.from('componentes_curriculares').select('*').eq('escola_id', escolaId);

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
            {profError && <p className="text-destructive mb-4">{profError}</p>}
            
            <ProfessoresClient 
                initialProfessores={professores || []} 
                escolaId={escolaId}
                turnosDaEscola={turnos as Turno[] || []}
                componentesDaEscola={componentes as ComponenteCurricular[] || []}
            />
        </CardContent>
      </Card>
    </div>
  );
}