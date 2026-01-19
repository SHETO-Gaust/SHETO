'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Calendar, CheckCircle, XCircle, Monitor, MapPin, Sun, Sunset, Users } from "lucide-react"
import type { Profile, Formacao, Formador } from "@/lib/types"
import { format, isFuture, isPast, differenceInDays, isToday, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { createClient } from "@/lib/supabase/client"
import { useEffect, useState } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator";

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
  const [formadores, setFormadores] = useState<{[formacaoId: string]: Formador[]}>({});
  const [inscricoesCounts, setInscricoesCounts] = useState<{[formacaoId: string]: number}>({});
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

      const { data: formacoesData, error: formacoesError } = await supabase
        .from('formacoes')
        .select('*')
        .order('created_at', { ascending: false });

      if (formacoesError) {
        console.error('Error fetching formacoes:', formacoesError);
        setFormacoes([]);
      } else {
        setFormacoes(formacoesData);
        if (formacoesData && formacoesData.length > 0) {
          const formacaoIds = formacoesData.map(f => f.id);
          const { data: formadoresData, error: formadoresError } = await supabase
            .from('formadores')
            .select('*')
            .in('formacao_id', formacaoIds);
          
          if (formadoresError) {
              console.error('Error fetching formadores:', formadoresError);
          } else {
              const formadoresByFormacao = formadoresData.reduce((acc, formador) => {
                  if (!acc[formador.formacao_id]) {
                      acc[formador.formacao_id] = [];
                  }
                  acc[formador.formacao_id].push(formador);
                  return acc;
              }, {} as {[formacaoId: string]: Formador[]});
              setFormadores(formadoresByFormacao);
          }
          
          const { data: inscricoesData, error: inscricoesError } = await supabase
            .from('inscricoes')
            .select('formacao_id')
            .limit(100000); 

          if (inscricoesError) {
            console.error('Error fetching inscricoes for count:', inscricoesError);
          } else {
            const counts = inscricoesData.reduce((acc: {[key: string]: number}, item) => {
              acc[item.formacao_id] = (acc[item.formacao_id] || 0) + 1;
              return acc;
            }, {});
            setInscricoesCounts(counts);
          }
        }
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

  const processFormacoes = (formacoes: Formacao[], allFormadores: {[formacaoId: string]: Formador[]}, allInscricoesCounts: {[formacaoId: string]: number}) => {
    return formacoes.map(f => {
        const { status, nextDate } = getStatusAndNextDate(f.dates);
        
        const getSubscriptionStatus = (): 'done' | 'pending' | 'configured' => {
            if (!f.subscription_form_config) return 'pending';
            if (f.subscription_form_config.open) return 'done';
            return 'configured';
        }

        const getAttendanceStatus = (): 'done' | 'pending' | 'configured' => {
            if (!f.attendance_list_info?.periods) return 'pending';
            if (f.attendance_list_info.open) return 'done';
            return 'configured';
        }
        
        const isDone = (status: 'done' | 'pending' | 'configured') => status === 'done';

        const formadoresForFormacao = allFormadores[f.id] || [];
        
        const sortedDates = f.dates 
          ? [...f.dates].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
          : [];
        
        return {
            id: f.id,
            name: f.name,
            status,
            nextDate,
            modality: f.modality,
            dates: sortedDates,
            inscritosCount: allInscricoesCounts[f.id] || 0,
            pendencias: [
                { name: 'Formadores', done: formadoresForFormacao.length > 0 },
                { name: 'Ensalamento', done: !!f.gfcpe_info?.ensalamento },
                { name: 'Inscrição', done: isDone(getSubscriptionStatus()) },
                { name: 'Frequência', done: isDone(getAttendanceStatus()) },
                { name: 'Avaliação', done: !!f.gadsg_info?.avaliacao },
            ]
        }
    }).filter(f => f.status !== 'Concluída');
  }

  const processedFormacoes = processFormacoes(formacoes, formadores, inscricoesCounts);


  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Olá, {displayName}!</h1>
        <p className="text-muted-foreground">Bem-vindo(a) ao painel Gerenciamento de Formações.</p>
      </div>

      <div className="space-y-2">
          <h2 className="text-xl font-semibold">Formações e Status</h2>
      </div>

      <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
        {loading ? (
          <>
            <Skeleton className="h-[28rem] w-full rounded-xl" />
            <Skeleton className="h-[28rem] w-full rounded-xl" />
          </>
        ) : (
          processedFormacoes.map((formacao) => (
            <Card key={formacao.id} className={cn('shadow-lg rounded-xl flex flex-col', { 'border-2 border-blue-300 bg-blue-50/50': formacao.status === 'Em andamento' })}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle>{formacao.name}</CardTitle>
                    <CardDescription className="flex items-center gap-2 pt-2">
                      <Calendar className="h-4 w-4" />
                      {formacao.status === 'Próxima' || formacao.status === 'Em andamento' ? `Próxima data: ${formacao.nextDate}` : formacao.status}
                    </CardDescription>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                      <div className="flex items-center gap-2">
                        {formacao.modality && (
                            <Badge variant={formacao.modality === 'presencial' ? 'secondary' : 'default'} className="flex items-center gap-1">
                            {formacao.modality === 'online' ? <Monitor className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
                            {formacao.modality.charAt(0).toUpperCase() + formacao.modality.slice(1)}
                            </Badge>
                        )}
                        {formacao.status === 'Em andamento' && (
                            <Badge variant="secondary" className="bg-blue-100 text-blue-800 border-blue-300">EM ANDAMENTO</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Users className="h-4 w-4" />
                          <span>{formacao.inscritosCount} {formacao.inscritosCount === 1 ? 'inscrito' : 'inscritos'}</span>
                      </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 flex-grow flex flex-col">
                  
                  <Separator />

                  <div>
                      <h4 className="font-semibold text-sm mb-3">Status das Pendências</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
                          {formacao.pendencias.map(p => <PendencyItem key={p.name} {...p}/>)}
                      </div>
                  </div>
                  
                  <Separator />

                  <div className="flex-grow">
                      <h4 className="font-semibold text-sm mb-3">Datas e Locais</h4>
                      <div className="space-y-3 text-sm">
                        {formacao.dates.length > 0 ? formacao.dates.map((day: any, index: number) => (
                          <div key={index}>
                             <div className="flex items-center gap-2 font-medium">
                                <Calendar className="h-4 w-4 text-primary" />
                                <span>{format(parseISO(day.date), "dd/MM/yyyy, EEEE", { locale: ptBR })}</span>
                              </div>
                              <div className="pl-6 mt-1 space-y-1 text-xs">
                                {day.location?.morning && (
                                    <div className="flex items-start gap-2 text-muted-foreground">
                                        <Sun className="h-3 w-3 mt-0.5 text-amber-500" />
                                        <span>Manhã: {day.location.morning_location || 'A definir'}</span>
                                    </div>
                                )}
                                 {day.location?.afternoon && (
                                    <div className="flex items-start gap-2 text-muted-foreground">
                                        <Sunset className="h-3 w-3 mt-0.5 text-orange-500" />
                                         <span>Tarde: {day.location.afternoon_location || 'A definir'}</span>
                                    </div>
                                )}
                              </div>
                          </div>
                        )) : <p className="text-sm text-muted-foreground">Nenhuma data cadastrada.</p>}
                      </div>
                  </div>

              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
