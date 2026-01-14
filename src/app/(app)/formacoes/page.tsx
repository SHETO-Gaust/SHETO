import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormacoesForm } from "@/components/formacoes/formacoes-form";
import { FormacoesTable } from "@/components/formacoes/formacoes-table";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { Separator } from "@/components/ui/separator";
import type { Formacao } from "@/lib/types";

async function getFormacoes(): Promise<Formacao[]> {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);
    const { data, error } = await supabase.from('formacoes').select('*').order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching formacoes:', error);
        return [];
    }

    return data;
}


export default async function FormacoesPage() {
  const formacoes = await getFormacoes();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Cadastro de Formações</CardTitle>
          <CardDescription>
            Preencha o formulário para cadastrar uma nova formação.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormacoesForm />
        </CardContent>
      </Card>

      <Separator />

      <Card>
        <CardHeader>
            <CardTitle>Formações Cadastradas</CardTitle>
            <CardDescription>
                Visualize, edite ou delete as formações existentes.
            </CardDescription>
        </CardHeader>
        <CardContent>
            <FormacoesTable data={formacoes} />
        </CardContent>
      </Card>
    </div>
  );
}
