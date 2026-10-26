'use client';

import * as React from 'react';
import Link from 'next/link';
import { Paperclip, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { ChamadoResumo, PrioridadeChamado, StatusChamado } from '@/lib/suporte/chamados-db';
import { PRIORIDADES, STATUS_ROTULO, TIPO_ROTULO, formatarDataHora, prioridade } from '@/components/suporte/rotulos';

/** Sem acento e sem maiuscula, como a busca da aba Usuarios. */
function normalizar(texto: string) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function ChamadosClient({ chamados }: { chamados: ChamadoResumo[] }) {
  const [status, setStatus] = React.useState<StatusChamado | 'todos'>('aberto');
  const [filtroPrioridade, setFiltroPrioridade] = React.useState<PrioridadeChamado | 'todas'>('todas');
  const [busca, setBusca] = React.useState('');

  const contagem = React.useMemo(
    () => ({
      aberto: chamados.filter(c => c.status === 'aberto').length,
      respondido: chamados.filter(c => c.status === 'respondido').length,
    }),
    [chamados]
  );

  const visiveis = React.useMemo(() => {
    const termo = normalizar(busca.trim());
    return chamados.filter(c => {
      if (status !== 'todos' && c.status !== status) return false;
      if (filtroPrioridade !== 'todas' && c.prioridade !== filtroPrioridade) return false;
      if (!termo) return true;
      return normalizar(
        [c.protocolo, c.user_nome, c.user_email, c.escola_nome, c.mensagem_inicio].filter(Boolean).join(' ')
      ).includes(termo);
    });
  }, [chamados, status, filtroPrioridade, busca]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={status} onValueChange={v => setStatus(v as typeof status)}>
          <TabsList>
            <TabsTrigger value="aberto">Abertos ({contagem.aberto})</TabsTrigger>
            <TabsTrigger value="respondido">Respondidos ({contagem.respondido})</TabsTrigger>
            <TabsTrigger value="todos">Todos</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Protocolo, nome, escola..."
              className="pl-8 sm:w-64"
            />
          </div>
          <Select value={filtroPrioridade} onValueChange={v => setFiltroPrioridade(v as typeof filtroPrioridade)}>
            <SelectTrigger className="sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as prioridades</SelectItem>
              {PRIORIDADES.map(p => (
                <SelectItem key={p.valor} value={p.valor}>
                  Prioridade {p.rotulo.toLowerCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Nº</TableHead>
              <TableHead>Prioridade</TableHead>
              <TableHead>Solicitante</TableHead>
              <TableHead className="hidden lg:table-cell">Mensagem</TableHead>
              <TableHead className="hidden md:table-cell">Aberto em</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visiveis.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  {chamados.length === 0 ? 'Nenhum chamado aberto até agora.' : 'Nenhum chamado com esses filtros.'}
                </TableCell>
              </TableRow>
            )}
            {visiveis.map(c => {
              const p = prioridade(c.prioridade);
              return (
                <TableRow key={c.id} className="cursor-pointer">
                  <TableCell className="font-mono font-semibold">
                    <Link href={`/chamados/${c.id}`} className="hover:underline">
                      #{c.protocolo}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={p.classe}>
                      {p.rotulo}
                    </Badge>
                    <span className="ml-2 text-xs text-muted-foreground">{TIPO_ROTULO[c.tipo]}</span>
                  </TableCell>
                  <TableCell>
                    <Link href={`/chamados/${c.id}`} className="block">
                      <span className="block font-medium">{c.user_nome || c.user_email}</span>
                      <span className="block text-xs text-muted-foreground">{c.escola_nome || 'Sem escola'}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="hidden max-w-md lg:table-cell">
                    <Link href={`/chamados/${c.id}`} className="line-clamp-2 text-sm text-muted-foreground">
                      {c.total_anexos > 0 && <Paperclip className="mr-1 inline h-3.5 w-3.5" />}
                      {c.mensagem_inicio}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap text-sm md:table-cell">
                    {formatarDataHora(c.created_at)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_ROTULO[c.status].classe}>
                      {STATUS_ROTULO[c.status].rotulo}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
