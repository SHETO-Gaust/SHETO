'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { CheckCircle2, MessageSquareReply, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { buscarRespostasPendentes, marcarRespostaVista } from '@/app/(app)/chamados/actions';
import type { RespostaPendente } from '@/lib/suporte/chamados-db';
import { formatarDataHora } from './rotulos';

/**
 * Mostra, uma unica vez, a resposta de um chamado a quem o abriu.
 *
 * Consulta a cada troca de tela (e nao so no layout): o layout do App Router
 * nao roda de novo na navegacao pelo menu, entao uma resposta dada com a
 * pessoa ja dentro do sistema so apareceria no proximo F5.
 *
 * "Vista" so e gravado quando a pessoa fecha a janela: se a pagina recarregar
 * com ela aberta, a resposta aparece de novo em vez de se perder.
 */
export function RespostaChamadoModal() {
  const pathname = usePathname();
  const [fila, setFila] = React.useState<RespostaPendente[]>([]);

  React.useEffect(() => {
    let cancelado = false;
    buscarRespostasPendentes()
      .then(pendentes => {
        if (!cancelado) setFila(pendentes);
      })
      .catch(() => {
        // Sem modal e melhor do que quebrar a tela por causa dele.
      });
    return () => {
      cancelado = true;
    };
  }, [pathname]);

  const atual = fila[0];

  const fechar = () => {
    if (!atual) return;
    void marcarRespostaVista(atual.id).catch(() => {});
    setFila(f => f.slice(1));
  };

  return (
    <Dialog open={!!atual} onOpenChange={aberto => !aberto && fechar()}>
      {atual && (
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquareReply className="h-5 w-5 text-primary" />
              Seu chamado #{atual.protocolo} foi respondido
            </DialogTitle>
            <DialogDescription>
              Respondido por {atual.respondido_por_nome || 'equipe do SHE'} em {formatarDataHora(atual.respondido_em)}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Você escreveu</p>
              <p className="line-clamp-4 whitespace-pre-wrap text-muted-foreground">{atual.mensagem}</p>
            </div>
            <div>
              <p className="mb-1 flex items-center gap-1.5 font-semibold">
                <CheckCircle2 className="h-4 w-4 text-primary" /> Resposta
              </p>
              <p className="whitespace-pre-wrap rounded-md border-l-4 border-primary bg-muted/50 p-3">{atual.resposta}</p>
            </div>
            {atual.correcao && (
              <div>
                <p className="mb-1 flex items-center gap-1.5 font-semibold">
                  <Wrench className="h-4 w-4 text-green-600" /> O que foi corrigido
                </p>
                <p className="whitespace-pre-wrap rounded-md border-l-4 border-green-600 bg-muted/50 p-3">
                  {atual.correcao}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button onClick={fechar}>Entendi</Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
