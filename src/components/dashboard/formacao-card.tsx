'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Calendar, CheckCircle, XCircle, Monitor, MapPin, Sun, Sunset, Users, AlertCircle } from "lucide-react";
import type { Formacao, Formador } from "@/lib/types";
import { format, isFuture, isPast, differenceInDays, isToday, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Skeleton } from "../ui/skeleton";

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

type PendencyStatus = 'done' | 'pending' | 'configured';

const PendencyItem = ({ name, status }: { name: string, status: PendencyStatus }) => {
    const getStatusIcon = () => {
        switch (status) {
            case 'done':
                return <CheckCircle className="h-4 w-4 text-green-500" />;
            case 'pending':
                return <XCircle className="h-4 w-4 text-red-500" />;
            case 'configured':
                 return <AlertCircle className="h-4 w-4 text-orange-500" />;
            default:
                return <XCircle className="h-4 w-4 text-red-500" />;
        }
    }
    return (
        <div className="flex items-center gap-2">
            {getStatusIcon()}
            <span className="text-sm text-muted-foreground">{name}</span>
        </div>
    );
};

type FormacaoCardProps = {
    formacao: Formacao;
};

export function FormacaoCard({ formacao }: FormacaoCardProps) {
    const [details, setDetails] = useState<{ formadores: Formador[], inscritosCount: number, ensalamentoCount: number } | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const supabase = createClient();
        
        async function fetchDetails() {
            setLoading(true);

            const formadoresPromise = supabase
                .from('formadores')
                .select('*')
                .eq('formacao_id', formacao.id);

            const inscritosPromise = supabase
                .from('inscricoes')
                .select('id', { count: 'exact', head: true })
                .eq('formacao_id', formacao.id);

            const ensalamentoPromise = supabase
                .from('ensalamentos')
                .select('id', { count: 'exact', head: true })
                .eq('formacao_id', formacao.id);

            const [formadoresResult, inscritosResult, ensalamentoResult] = await Promise.all([formadoresPromise, inscritosPromise, ensalamentoPromise]);

            if (formadoresResult.error) {
                console.error(`Error fetching formadores for ${formacao.id}:`, formadoresResult.error);
            }
            if (inscritosResult.error) {
                console.error(`Error fetching inscritos count for ${formacao.id}:`, inscritosResult.error);
            }
            if (ensalamentoResult.error) {
                console.error(`Error fetching ensalamento count for ${formacao.id}:`, ensalamentoResult.error);
            }

            setDetails({
                formadores: formadoresResult.data || [],
                inscritosCount: inscritosResult.count ?? 0,
                ensalamentoCount: ensalamentoResult.count ?? 0,
            });

            setLoading(false);
        }

        fetchDetails();

    }, [formacao.id]);

    const { status, nextDate } = getStatusAndNextDate(formacao.dates);
        
    const getSubscriptionStatus = (): 'done' | 'pending' | 'configured' => {
        if (!formacao.subscription_form_config) return 'pending';
        if (formacao.subscription_form_config.open) return 'done';
        return 'configured';
    }

    const getAttendanceStatus = (): 'done' | 'pending' | 'configured' => {
        if (!formacao.attendance_list_info?.periods) return 'pending';
        if (formacao.attendance_list_info.open) return 'done';
        return 'configured';
    }
    
    const hasFormadores = (details?.formadores.length ?? 0) > 0;
    
    const getAvaliacaoStatus = (): 'done' | 'pending' | 'configured' => {
        if (!hasFormadores) return 'pending';
        if (formacao.gadsg_info?.avaliacao?.open) return 'done';
        if (formacao.gadsg_info?.hasOwnProperty('avaliacao')) return 'configured';
        return 'pending';
    };

    const pendencias = [
        { name: 'Formadores', status: hasFormadores ? 'done' : 'pending' },
        { name: 'Ensalamento', status: (details?.ensalamentoCount ?? 0) > 0 ? 'done' : 'pending' },
        { name: 'Inscrição', status: getSubscriptionStatus() },
        { name: 'Frequência', status: getAttendanceStatus() },
        { name: 'Avaliação', status: getAvaliacaoStatus() },
    ];
    
    const sortedDates = formacao.dates 
      ? [...formacao.dates].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      : [];
    
    return (
        <Card className={cn('shadow-lg rounded-xl flex flex-col', { 'border-2 border-blue-300 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20': status === 'Em andamento' })}>
            <CardHeader>
            <div className="flex justify-between items-start">
                <div>
                <CardTitle>{formacao.name}</CardTitle>
                <CardDescription className="flex items-center gap-2 pt-2">
                    <Calendar className="h-4 w-4" />
                    {status === 'Próxima' || status === 'Em andamento' ? `Próxima data: ${nextDate}` : status}
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
                    {status === 'Em andamento' && (
                        <Badge variant="secondary" className="bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700">EM ANDAMENTO</Badge>
                    )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Users className="h-4 w-4" />
                        {loading ? <Skeleton className="h-4 w-16" /> : <span>{details?.inscritosCount ?? 0} {details?.inscritosCount === 1 ? 'inscrito' : 'inscritos'}</span>}
                    </div>
                </div>
            </div>
            </CardHeader>
            <CardContent className="space-y-4 flex-grow flex flex-col">
                
                <Separator />

                <div>
                    <h4 className="font-semibold text-sm mb-3">Status das Pendências</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
                        {loading ? <>
                            <Skeleton className="h-5 w-24" /><Skeleton className="h-5 w-24" /><Skeleton className="h-5 w-24" /><Skeleton className="h-5 w-24" /><Skeleton className="h-5 w-24" />
                        </> : pendencias.map(p => <PendencyItem key={p.name} {...p}/>)}
                    </div>
                </div>
                
                <Separator />

                <div className="flex-grow">
                    <h4 className="font-semibold text-sm mb-3">Datas e Locais</h4>
                    <div className="space-y-3 text-sm">
                    {sortedDates.length > 0 ? sortedDates.map((day: any, index: number) => (
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
    );
}
