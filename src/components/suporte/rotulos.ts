import type { PrioridadeChamado, StatusChamado, TipoChamado } from '@/lib/suporte/chamados-db';

/** Rotulos e cores compartilhados entre o formulario, a lista e o detalhe. */

export const PRIORIDADES: { valor: PrioridadeChamado; rotulo: string; descricao: string; classe: string }[] = [
  {
    valor: 'alta',
    rotulo: 'Alta',
    descricao: 'Não consigo trabalhar',
    classe: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300',
  },
  {
    valor: 'media',
    rotulo: 'Média',
    descricao: 'Atrapalha, mas dá para seguir',
    classe: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300',
  },
  {
    valor: 'baixa',
    rotulo: 'Baixa',
    descricao: 'Dúvida ou sugestão',
    classe: 'border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300',
  },
];

export function prioridade(valor: PrioridadeChamado) {
  return PRIORIDADES.find(p => p.valor === valor) ?? PRIORIDADES[1];
}

export const TIPO_ROTULO: Record<TipoChamado, string> = {
  duvida: 'Dúvida',
  erro: 'Erro',
};

export const STATUS_ROTULO: Record<StatusChamado, { rotulo: string; classe: string }> = {
  aberto: {
    rotulo: 'Aberto',
    classe: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300',
  },
  respondido: {
    rotulo: 'Respondido',
    classe: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300',
  },
};

export function formatarDataHora(iso: string | Date | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Araguaina',
  });
}
