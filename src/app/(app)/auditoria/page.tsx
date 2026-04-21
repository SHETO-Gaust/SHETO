import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getAuditoriaData, getAuditoriaStats } from "./actions";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ShieldCheck, AlertTriangle } from "lucide-react";
import { AuditoriaClient } from "./auditoria-client";

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function AuditoriaPage(props: PageProps) {
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

  const searchParams = await props.searchParams;
  const page = Number(searchParams?.page) || 1;
  const pageSize = Number(searchParams?.limit) || 25;
  const search = typeof searchParams?.q === 'string' ? searchParams.q : '';
  const status = typeof searchParams?.status === 'string' ? searchParams.status : 'all';

  const [stats, listResponse] = await Promise.all([
    getAuditoriaStats(),
    getAuditoriaData({ page, pageSize, search, status })
  ]);

  if (listResponse.error) {
    return (
        <Card className="border-destructive">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-destructive"><AlertTriangle /> Erro no Carregamento</CardTitle>
                <CardDescription>{listResponse.error}</CardDescription>
            </CardHeader>
        </Card>
    );
  }

  return (
    <div className="space-y-6">
        <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                <ShieldCheck className="h-6 w-6 text-primary" />
                Auditoria e Manutenção de Dados
            </h1>
            <p className="text-sm text-muted-foreground">
                Monitore o volume de dados, gerencie rascunhos acumulados e otimize o banco de dados global.
            </p>
        </div>

        <AuditoriaClient 
            data={listResponse.data || []} 
            stats={stats}
            totalItems={listResponse.total || 0}
            currentPage={page}
            pageSize={pageSize}
            searchQuery={search}
            statusFilter={status}
        />
    </div>
  );
}
