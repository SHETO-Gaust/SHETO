'use client';

import type { Formacao } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, CheckCircle, Clock, MapPin, Monitor, Sun, Sunset, XCircle } from "lucide-react";
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Separator } from "../ui/separator";

type FormacaoDetailsProps = {
    formacao: Formacao;
};

const PendencyItem = ({ name, done }: { name: string, done: boolean }) => (
    <div className="flex items-center gap-2">
        {done ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
        <span className="text-sm text-muted-foreground">{name}</span>
    </div>
);

export function FormacaoDetails({ formacao }: FormacaoDetailsProps) {
    const pendenciasGFCPE = [
        { name: 'Detalhes da Inscrição', done: !!formacao.gfcpe_info?.inscricao_detalhes },
        { name: 'Formadores', done: !!formacao.gfcpe_info?.formadores },
        { name: 'Ensalamento', done: !!formacao.gfcpe_info?.ensalamento },
    ];
    const pendenciasGADSG = [
        { name: 'Inscrição', done: !!formacao.gadsg_info?.inscricao },
        { name: 'Frequência', done: !!formacao.gadsg_info?.frequencia },
        { name: 'Drive dos Materiais', done: !!formacao.gadsg_info?.drive_materiais },
        { name: 'Avaliação', done: !!formacao.gadsg_info?.avaliacao },
    ];

    const sortedDates = formacao.dates 
        ? [...formacao.dates].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        : [];

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div>
                        <CardTitle className="text-2xl">{formacao.name}</CardTitle>
                        <CardDescription className="flex items-center gap-2 pt-2">
                             {formacao.modality === 'online' ? <Monitor className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
                            <Badge variant={formacao.modality === 'presencial' ? 'secondary' : 'default'}>
                                {formacao.modality.charAt(0).toUpperCase() + formacao.modality.slice(1)}
                            </Badge>
                        </CardDescription>
                    </div>
                    {/* Add action buttons here if needed */}
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                <Separator />
                
                {/* Dates and Locations Section */}
                <div className="space-y-4">
                    <h3 className="font-semibold text-lg">Datas e Locais</h3>
                    <div className="grid gap-4 md:grid-cols-2">
                        {sortedDates.map((day: any, index: number) => (
                             <Card key={index} className="p-4 space-y-3">
                                <div className="flex items-center gap-2 font-semibold">
                                    <Calendar className="h-5 w-5 text-primary" />
                                    <span>{format(new Date(day.date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</span>
                                    <span className="text-muted-foreground text-sm">({format(new Date(day.date), "EEEE", { locale: ptBR })})</span>
                                </div>
                                <div className="pl-7 space-y-2 text-sm">
                                    {day.location?.morning && (
                                        <div className="flex items-start gap-2">
                                            <Sun className="h-4 w-4 mt-0.5 text-amber-500" />
                                            <div>
                                                <p className="font-medium text-foreground">Período Matutino</p>
                                                <p className="text-muted-foreground">{day.location.morning_location || 'Local a definir'}</p>
                                            </div>
                                        </div>
                                    )}
                                     {day.location?.afternoon && (
                                        <div className="flex items-start gap-2">
                                            <Sunset className="h-4 w-4 mt-0.5 text-orange-500" />
                                             <div>
                                                <p className="font-medium text-foreground">Período Vespertino</p>
                                                <p className="text-muted-foreground">{day.location.afternoon_location || 'Local a definir'}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </Card>
                        ))}
                    </div>
                </div>

                <Separator />

                {/* Pendencies Section */}
                <div className="space-y-4">
                     <h3 className="font-semibold text-lg">Status das Pendências</h3>
                    <div className="grid gap-6 md:grid-cols-2">
                        <div className="space-y-2">
                            <h4 className="font-semibold text-md mb-2">Pendências GFCPE</h4>
                            <div className="space-y-1">
                                {pendenciasGFCPE.map(p => <PendencyItem key={p.name} {...p}/>)}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <h4 className="font-semibold text-md mb-2">Pendências GADSG</h4>
                            <div className="space-y-1">
                                {pendenciasGADSG.map(p => <PendencyItem key={p.name} {...p}/>)}
                            </div>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
