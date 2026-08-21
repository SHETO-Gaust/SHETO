'use client';

import * as React from 'react';
import { X, MousePointerClick } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PassoTutorial } from '@/lib/tutoriais/types';

type TutorialBalaoProps = {
  passo: PassoTutorial;
  indice: number;
  total: number;
  onProximo: () => void;
  onVoltar: () => void;
  onSair: () => void;
};

/**
 * O cartao de texto do tutorial.
 *
 * O atributo `data-tutorial-balao` e o que permite ao overlay reconhecer cliques
 * aqui dentro como validos enquanto o resto da tela esta bloqueado.
 */
export function TutorialBalao({
  passo,
  indice,
  total,
  onProximo,
  onVoltar,
  onSair,
}: TutorialBalaoProps) {
  const ultimo = indice === total - 1;
  const modo = passo.avancar ?? 'proximo';
  const soPorAcao = modo === 'acao';

  return (
    <div
      data-tutorial-balao=""
      className="pointer-events-auto w-[min(23rem,calc(100vw-2rem))] rounded-lg border bg-popover p-4 text-popover-foreground shadow-2xl"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-primary">
          Passo {indice + 1} de {total}
        </span>
        <button
          type="button"
          onClick={onSair}
          aria-label="Fechar tutorial"
          className="rounded-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-3 h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${((indice + 1) / total) * 100}%` }}
        />
      </div>

      <h3 className="text-base font-semibold leading-snug">{passo.titulo}</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{passo.texto}</p>

      {modo !== 'proximo' && (
        <p className="mt-3 flex items-center gap-2 rounded-md bg-primary/10 px-2.5 py-2 text-xs font-medium text-primary">
          <MousePointerClick className="h-4 w-4 shrink-0" />
          Clique no item destacado para continuar.
        </p>
      )}

      <div className="mt-4 flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onSair}
          className="text-muted-foreground hover:text-foreground"
        >
          Pular tutorial
        </Button>
        <div className="flex items-center gap-2">
          {indice > 0 && (
            <Button variant="outline" size="sm" onClick={onVoltar}>
              Voltar
            </Button>
          )}
          {/* No modo 'acao' o unico caminho e clicar no elemento real. */}
          {!soPorAcao && (
            <Button size="sm" onClick={onProximo}>
              {ultimo ? 'Concluir' : 'Próximo'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
