'use client';

import type { ChecklistReportData, ChecklistItemStatus } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { CheckCircle, AlertTriangle, XCircle, ExternalLink } from "lucide-react";
import Link from 'next/link';

const statusConfig: { [key in ChecklistItemStatus]: { icon: React.ElementType, color: string } } = {
  ok: { icon: CheckCircle, color: 'text-green-500' },
  warning: { icon: AlertTriangle, color: 'text-yellow-500' },
  error: { icon: XCircle, color: 'text-red-500' },
};

const StatusIcon = ({ status }: { status: ChecklistItemStatus }) => {
  const { icon: Icon, color } = statusConfig[status];
  return <Icon className={`h-6 w-6 ${color}`} />;
};

export function ChecklistReport({ data }: { data: ChecklistReportData }) {
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          Não foi possível gerar os dados do relatório.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Situação dos Dados Cadastrados</CardTitle>
        <CardDescription>
          Diagnóstico dos cadastros necessários para a geração de horários.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-muted px-4 py-2 font-semibold hidden md:grid md:grid-cols-[1fr_80px] items-center">
            <span>Verificação</span>
            <span className="text-center">Status</span>
          </div>
          <div className="divide-y">
            {data.map((item) => (
              <div key={item.id} className="p-4 grid grid-cols-[1fr_auto] md:grid-cols-[1fr_80px] gap-4 items-start hover:bg-muted/50">
                <div className={item.id.includes('.') ? 'pl-6' : ''}>
                  <p className="font-semibold text-foreground">
                    {item.id}. {item.title}
                  </p>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                  {item.details && (
                    <div className="mt-2 text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded-md">
                      {item.details}
                      {item.link && (
                         <Link href={item.link} className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline font-semibold ml-2">
                             Clique aqui <ExternalLink className="h-3 w-3" />
                         </Link>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex justify-center items-center h-full">
                  <StatusIcon status={item.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
      <CardFooter className="bg-muted/50 p-4 border-t">
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <span className="font-semibold">Legenda:</span>
              <div className="flex items-center gap-2"><XCircle className="h-4 w-4 text-red-500" /> Erro / Incompleto</div>
              <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-yellow-500" /> Atenção / Incompleto</div>
              <div className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-green-500" /> OK</div>
          </div>
      </CardFooter>
    </Card>
  );
}
