'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Calendar, CheckCircle, Info, XCircle } from "lucide-react"
import type { Profile, Formacao } from "@/lib/types"
import { format, isFuture, isPast, differenceInDays, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import Link from "next/link";
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { createClient } from "@/lib/supabase/client"
import { useEffect, useState } from "react"
import { Skeleton } from "@/components/ui/skeleton"

function getStatusAndNextDate(dates: any): { status: 'Próxima' | 'Em andamento' | 'Concluída' | 'Pendente'; nextDate: string, daysUntilNext: number | null } {
    if (!dates || !Array.isArray(dates) || dates.length === 0) {
        return { status: 'Pendente', nextDate: 'A definir', daysUntilNext: null };
    }

    const dateObjects = dates
        .map((d: any) => new Date(d.date))
        .sort((a, b) => a.getTime() - b.getTime());

    const today = new Date();
    
    const pastDates = dateObjects.filter(d => isPast(d) && !isToday(d));
    const futureDates = dateObjects.filter(d => isFuture(d) || isToday(d));

    if (futureDates.length === 0) {
        return { status: 'Concluída', nextDate: 'N/A', daysUntilNext: null };
    }
    
    const nextDateCand = futureDates.length > 0 ? futureDates[0] : null;

    if ( pastDates.length > 0 || isToday(futureDates[0]) ) {
         const daysUntil = nextDateCand ? differenceInDays(nextDateCand, today) : null;
         const formattedNextDate = nextDateCand ? format(nextDateCand, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : 'N/A';
         return { status: 'Em andamento', nextDate: formattedNextDate, daysUntilNext: daysUntil };
    }
    
    if (futureDates.length > 0) {
        const daysUntil = nextDateCand ? differenceInDays(nextDateCand, today) : null;
        const formattedNextDate = nextDateCand ? format(nextDateCand, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : 'N/A';
        return { status: 'Próxima', nextDate: formattedNextDate, daysUntilNext: daysUntil };
    }
    
    const formattedNextDate = nextDateCand ? format(nextDateCand, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : 'N/A';
    const daysUntil = nextDateCand ? differenceInDays(nextDateCand, today) : null;
    
    return { status: 'Pendente', nextDate: formattedNextDate, daysUntilNext: daysUntil };
}


export default function DashboardPage() {
  const [userProfile, setUserProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState("Usuário");
  const [formacoes, setFormacoes] = useState<Formacao[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function fetchData() {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        setUserProfile(profileData);
        setDisplayName(profileData?.name || user.email || "Usuário");
      }

      const { data: formacoesData, error } = await supabase
        .from('formacoes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching formacoes:', error);
        setFormacoes([]);
      } else {
        setFormacoes(formacoesData);
      }
      setLoading(false);
    }

    fetchData();
  }, []);

  const PendencyItem = ({ name, done }: { name: string, done: boolean }) => (
    <div className="flex items-center gap-2">
      {done ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
      <span className="text-sm text-muted-foreground">{name}</span>
    </div>
  )

  const processFormacoes = (formacoes: Formacao[]) => {
    return formacoes.map(f => {
        const { status, nextDate } = getStatusAndNextDate(f.dates);
        return {
            id: f.id,
            name: f.name,
            status,
            nextDate,
            pendenciasGFCPE: [
                { name: 'Formadores', done: !!f.gfcpe_info?.formadores },
                { name: 'Ensalamento', done: !!f.gfcpe_info?.ensalamento },
            ],
            pendenciasGADSG: [
                { name: 'Inscrição', done: !!f.gadsg_info?.inscricao },
                { name: 'Frequência', done: !!f.gadsg_info?.frequencia },
                { name: 'Avaliação', done: !!f.gadsg_info?.avaliacao },
            ]
        }
    }).filter(f => f.status !== 'Concluída');
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
        {loading ? (
          <>
            <Skeleton className="h-96 w-full rounded-xl" />
            <Skeleton className="h-96 w-full rounded-xl" />
            <Skeleton className="h-96 w-full rounded-xl" />
          </>
        ) : (
          processedFormacoes.map((formacao) => (
            <Card key={formacao.id} className={cn('relative transition-all duration-300 ease-in-out shadow-lg rounded-xl flex flex-col', { 'border-2 border-blue-300 bg-blue-50/50': formacao.status === 'Em andamento' })}>
              <CardHeader>
                <CardTitle>{formacao.name}</CardTitle>
                <CardDescription className="flex items-center gap-2 pt-2">
                  <Calendar className="h-4 w-4" />
                  {formacao.status === 'Próxima' || formacao.status === 'Em andamento' ? `Próxima data: ${formacao.nextDate}` : formacao.status}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 flex-grow flex flex-col">
                  <div className="flex-grow">
                      <div>
                          <h4 className="font-semibold text-sm mb-2">Pendências GFCPE</h4>
                          <div className="space-y-1">
                              {formacao.pendenciasGFCPE.map(p => <PendencyItem key={p.name} {...p}/>)}
                          </div>
                      </div>
                       <div className="mt-4">
                          <h4 className="font-semibold text-sm mb-2">Pendências GADSG</h4>
                          <div className="space-y-1">
                              {formacao.pendenciasGADSG.map(p => <PendencyItem key={p.name} {...p}/>)}
                          </div>
                      </div>
                  </div>

                  <div className="mt-auto pt-4 space-y-2">
                      {formacao.status === 'Em andamento' && (
                          <div className="flex justify-end">
                              <Badge variant="secondary" className="bg-blue-100 text-blue-800 border-blue-300">EM ANDAMENTO</Badge>
                          </div>
                      )}
                      <Link href={`/formacoes/${formacao.id}`} className="w-full">
                        <Button variant="outline" className="w-full">
                            <Info className="mr-2 h-4 w-4" />
                            Detalhes
                        </Button>
                      </Link>
                  </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
