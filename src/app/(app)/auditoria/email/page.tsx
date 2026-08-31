import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getUsersForCommunication } from "../actions";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ShieldCheck, AlertTriangle } from "lucide-react";
import { EmailMassaClient } from "./email-client";

export const metadata = {
  title: "E-mail em Massa",
};

export default async function EmailMassaPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return (
      <div className="p-8 flex items-center justify-center">
        <Card className="max-w-md text-center">
          <CardHeader>
            <ShieldCheck className="h-12 w-12 text-destructive mx-auto mb-4" />
            <CardTitle>Acesso Restrito</CardTitle>
            <CardDescription>Esta página é exclusiva para administradores globais do sistema.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const { data: users, error } = await getUsersForCommunication();

  if (error) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle /> Erro no Carregamento
          </CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return <EmailMassaClient users={users || []} />;
}
