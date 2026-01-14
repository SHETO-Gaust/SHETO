'use client';

import { useState } from 'react';
import type { Formacao } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Settings } from 'lucide-react';
import { FormBuilderSheet } from './form-builder-sheet';

type GerenciamentoCardProps = {
  formacao: Formacao;
};

const PendencyItem = ({ name, done, onManageClick }: { name: string, done: boolean, onManageClick?: () => void }) => (
  <div className="flex items-center justify-between p-3 border rounded-md">
    <div className="flex items-center gap-3">
      {done ? <CheckCircle className="h-5 w-5 text-green-500" /> : <XCircle className="h-5 w-5 text-red-500" />}
      <span className="font-medium">{name}</span>
    </div>
    {onManageClick && (
      <Button variant="outline" size="sm" onClick={onManageClick}>
        <Settings className="mr-2 h-4 w-4" />
        Gerenciar
      </Button>
    )}
  </div>
);

export function GerenciamentoCard({ formacao }: GerenciamentoCardProps) {
    const [isFormBuilderOpen, setIsFormBuilderOpen] = useState(false);

    const pendencias = [
        { name: 'Formadores', done: !!formacao.gfcpe_info?.formadores },
        { name: 'Ensalamento', done: !!formacao.gfcpe_info?.ensalamento },
        { name: 'Inscrição', done: !!formacao.subscription_form_config, onManageClick: () => setIsFormBuilderOpen(true) },
        { name: 'Frequência', done: !!formacao.attendance_list_info },
        { name: 'Avaliação', done: !!formacao.gadsg_info?.avaliacao },
    ];


  return (
    <>
        <Card>
            <CardHeader>
                <CardTitle>{formacao.name}</CardTitle>
                <CardDescription>
                    Gerencie as pendências e configurações desta formação.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-3">
                {pendencias.map((p, index) => (
                    <PendencyItem key={index} name={p.name} done={p.done} onManageClick={p.onManageClick} />
                ))}
                </div>
            </CardContent>
        </Card>
        {isFormBuilderOpen && (
            <FormBuilderSheet
                isOpen={isFormBuilderOpen}
                setIsOpen={setIsFormBuilderOpen}
                formacao={formacao}
            />
        )}
    </>
  );
}
