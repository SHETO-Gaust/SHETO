import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormacoesForm } from "@/components/formacoes/formacoes-form";

export default function FormacoesPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cadastro de Formações</CardTitle>
        <CardDescription>
          Gerencie e cadastre novas formações.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FormacoesForm />
      </CardContent>
    </Card>
  );
}
