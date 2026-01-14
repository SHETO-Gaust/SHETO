'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { Fine } from '@/lib/types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type FinesTableProps = {
  data: Fine[];
};

export function FinesTable({ data }: FinesTableProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[100px]">ID da Multa</TableHead>
            <TableHead>Motivo</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Data</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((fine) => (
            <TableRow key={fine.id}>
              <TableCell className="font-medium">{fine.id}</TableCell>
              <TableCell>{fine.reason}</TableCell>
              <TableCell className="text-right">
                ${fine.amount.toFixed(2)}
              </TableCell>
              <TableCell>
                <Badge
                  variant={
                    fine.status === 'paid' ? 'secondary' : 'destructive'
                  }
                >
                  {fine.status === 'paid' ? 'Paga' : 'Não Paga'}
                </Badge>
              </TableCell>
              <TableCell>
                {format(new Date(fine.createdAt), 'd MMM, yyyy', { locale: ptBR })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
