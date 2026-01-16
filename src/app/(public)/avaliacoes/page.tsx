import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import type { Formacao } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

async function getOpenFormacoes(): Promise<Formacao[]> {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);
    const { data, error } = await supabase
        .from('formacoes')
        .select('*')
        // @ts-ignore
        .eq('gadsg_info->avaliacao->>open', 'true')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching open formacoes for avaliacao:', error);
        return [];
    }

    return data;
}

export default async function AvaliacoesPage() {
  const formacoes = await getOpenFormacoes();

  const formatDateRange = (dates: any) => {
    if (!dates || !Array.isArray(dates) || dates.length === 0) {
        return 'Período a definir';
    }
    const dateObjects = dates.map((d: any) => new Date(d.date)).sort((a, b) => a.getTime() - b.getTime());
    const firstDate = format(dateObjects[0], 'dd/MM/yy');
    if (dateObjects.length === 1) {
        return firstDate;
    }
    const lastDate = format(dateObjects[dateObjects.length - 1], 'dd/MM/yy');
    return `${firstDate} a ${lastDate}`;
  };

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Avaliação de Formações</h1>
        <p className="text-muted-foreground mt-2">
          Escolha uma das formações abaixo para deixar sua avaliação.
        </p>
      </div>

      {formacoes.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {formacoes.map((formacao) => (
            <Card key={formacao.id} className="flex flex-col">
              <CardHeader>
                <CardTitle>{formacao.name}</CardTitle>
                <CardDescription>Período: {formatDateRange(formacao.dates)}</CardDescription>
              </CardHeader>
              <CardContent className="flex-grow">
                 <p className="text-sm text-muted-foreground">
                    Sua opinião é muito importante para nós. Clique no botão abaixo para avaliar esta formação.
                 </p>
              </CardContent>
              <CardFooter>
                <Link href={`/avaliacoes/${formacao.id}`} className="w-full">
                    <Button className="w-full">
                        Avaliar Formação
                        <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                </Link>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center text-muted-foreground border-2 border-dashed rounded-lg p-12">
            <p className="text-lg">Nenhuma avaliação aberta no momento.</p>
            <p className="text-sm">Por favor, volte mais tarde.</p>
        </div>
      )}
    </div>
  );
}
