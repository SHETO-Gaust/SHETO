import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Calendar, CheckCircle, Info, XCircle } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"
import type { Profile, Formacao } from "@/lib/types"
import { format, isFuture, isPast, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import Link from "next/link";

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

function getStatusAndNextDate(dates: any): { status: string; nextDate: string, daysUntilNext: number | null } {
    if (!dates || !Array.isArray(dates) || dates.length === 0) {
        return { status: 'Pendente', nextDate: 'A definir', daysUntilNext: null };
    }

    const dateObjects = dates
        .map((d: any) => new Date(d.date))
        .sort((a, b) => a.getTime() - b.getTime());

    const today = new Date();
    const futureDates = dateObjects.filter(d => isFuture(d) || format(d, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd'));
    
    if (futureDates.length > 0) {
        const nextDate = futureDates[0];
        const daysUntil = differenceInDays(nextDate, today);
        const allPast = dateObjects.every(d => isPast(d) && format(d, 'yyyy-MM-dd') !== format(today, 'yyyy-MM-dd'));
        
        // If there are future dates but also past dates, it's in progress
        if (!allPast) {
             return { status: 'Em andamento', nextDate: format(nextDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }), daysUntilNext: daysUntil };
        } else {
             return { status: 'Próxima', nextDate: format(nextDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }), daysUntilNext: daysUntil };
        }
    }
    
    // If all dates are in the past
    if (dateObjects.every(d => isPast(d) && format(d, 'yyyy-MM-dd') !== format(today, 'yyyy-MM-dd'))) {
        return { status: 'Concluída', nextDate: 'N/A', daysUntilNext: null };
    }

    // Default if no other condition is met
    const firstDate = dateObjects[0];
    const daysUntilFirst = differenceInDays(firstDate, new Date());
    return { status: 'Próxima', nextDate: format(firstDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }), daysUntilNext: daysUntilFirst };
}

export default async function DashboardPage() {
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();

  let userProfile: Profile | null = null;
  let displayName = "Usuário";

  if (user) {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    userProfile = profileData;
    displayName = userProfile?.name || user.email || "Usuário";
  }

  const formacoes = await getFormacoes();

  const PendencyItem = ({ name, done }: { name: string, done: boolean }) => (
    <div className="flex items-center gap-2">
      {done ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
      <span className="text-sm text-muted-foreground">{name}</span>
    </div>
  )

  const processFormacoes = (formacoes: Formacao[]) => {
    return formacoes.map(f => {
        const { status, nextDate, daysUntilNext } = getStatusAndNextDate(f.dates);
        return {
            id: f.id,
            name: f.name,
            status,
            nextDate,
            daysUntilNext,
            pendenciasGFCPE: [
                { name: 'Detalhes da Inscrição', done: !!f.gfcpe_info?.inscricao_detalhes },
                { name: 'Formadores', done: !!f.gfcpe_info?.formadores },
                { name: 'Ensalamento', done: !!f.gfcpe_info?.ensalamento },
            ],
            pendenciasGADSG: [
                { name: 'Inscrição', done: !!f.gadsg_info?.inscricao },
                { name: 'Frequência', done: !!f.gadsg_info?.frequencia },
                { name: 'Drive dos Materiais', done: !!f.gadsg_info?.drive_materiais },
                { name: 'Avaliação', done: !!f.gadsg_info?.avaliacao },
            ]
        }
    })
  }

  const processedFormacoes = processFormacoes(formacoes);


  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Olá, {displayName}!</h1>
        <p className="text-muted-foreground">Bem-vindo(a) ao painel Gerenciamento de Formações.</p>
      </div>

      <div className="space-y-2">
          <h2 className="text-xl font-semibold">Formações e Status</h2>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {processedFormacoes.map((formacao) => (
          <Card key={formacao.id} className={`relative overflow-visible ${formacao.status === 'Em andamento' ? 'border-primary border-2' : ''}`}>
            <CardHeader>
              <CardTitle>{formacao.name}</CardTitle>
              <CardDescription className="flex items-center gap-2 pt-2">
                <Calendar className="h-4 w-4" />
                {formacao.status === 'Próxima' || formacao.status === 'Em andamento' ? `Próxima data: ${formacao.nextDate}` : formacao.status}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div>
                    <h4 className="font-semibold text-sm mb-2">Pendências GFCPE</h4>
                    <div className="space-y-1">
                        {formacao.pendenciasGFCPE.map(p => <PendencyItem key={p.name} {...p}/>)}
                    </div>
                </div>
                 <div>
                    <h4 className="font-semibold text-sm mb-2">Pendências GADSG</h4>
                    <div className="space-y-1">
                        {formacao.pendenciasGADSG.map(p => <PendencyItem key={p.name} {...p}/>)}
                    </div>
                </div>

                <Link href={`/formacoes/${formacao.id}`} passHref legacyBehavior>
                  <a className="w-full">
                    <Button variant="outline" className="w-full">
                        <Info className="mr-2 h-4 w-4" />
                        Detalhes
                    </Button>
                  </a>
                </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
