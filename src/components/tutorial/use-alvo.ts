'use client';

import { useEffect, useState } from 'react';

export type RetanguloAlvo = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export type EstadoAlvo =
  /** O passo nao tem alvo: o balao vai centralizado sobre um fundo escuro. */
  | { situacao: 'centralizado' }
  /** Ainda esperando o elemento aparecer no DOM (sheet abrindo, hidratacao, navegacao). */
  | { situacao: 'procurando' }
  /** Estourou o tempo de espera: mostramos o texto centralizado para nao travar o tutorial. */
  | { situacao: 'ausente' }
  | { situacao: 'encontrado'; rect: RetanguloAlvo; elemento: HTMLElement };

/** Depois disso desistimos de procurar o alvo e caimos no cartao centralizado. */
const TIMEOUT_MS = 4000;
/**
 * Espera bem menor para passos marcados como opcionais.
 *
 * Um passo opcional aponta para algo que pode legitimamente nao existir (o botao
 * de restricoes so aparece se ja houver professor cadastrado). Esperar os 4s
 * inteiros deixaria a tela escura e travada num passo que vamos pular de todo
 * jeito — melhor desistir rapido e seguir.
 */
const TIMEOUT_OPCIONAL_MS = 700;
/**
 * Se o alvo ja tinha sido encontrado e sumiu (a pessoa fechou o sheet, por exemplo),
 * nao faz sentido esperar os 4s inteiros — mas tambem nao podemos reagir ao primeiro
 * frame, porque um re-render normal remove e recria o elemento.
 */
const TOLERANCIA_SUMICO_MS = 400;
/** Folga em volta do elemento, para o recorte nao encostar na borda dele. */
const MARGEM = 6;

function mesmoRetangulo(a: RetanguloAlvo, b: RetanguloAlvo) {
  return (
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}

/**
 * Resolve `data-tutorial="<seletor>"` num retangulo que acompanha o elemento em tempo real.
 *
 * O conteudo do SHE vive dentro de um container com `overflow-auto` proprio
 * (ver `(app)/layout.tsx`), entao ouvir `scroll` na window nao basta. Um loop de
 * `requestAnimationFrame` relendo o `getBoundingClientRect` resolve de uma vez so:
 * scroll interno, resize, animacao de abertura dos Sheets, hidratacao tardia
 * (o SchoolSelector so renderiza depois de montado) e qualquer layout shift.
 * O custo e um `getBoundingClientRect` por frame num unico elemento.
 */
export function useAlvo(
  seletor: string | undefined,
  chavePasso: number,
  opcional = false
): EstadoAlvo {
  const [estado, setEstado] = useState<EstadoAlvo>(
    seletor ? { situacao: 'procurando' } : { situacao: 'centralizado' }
  );

  useEffect(() => {
    if (!seletor) {
      setEstado({ situacao: 'centralizado' });
      return;
    }

    setEstado({ situacao: 'procurando' });

    let frame = 0;
    let jaRolou = false;
    let jaEncontrou = false;
    let sumiuEm = 0;
    let ultimoRect: RetanguloAlvo | null = null;
    let ultimoEl: HTMLElement | null = null;
    const inicio = performance.now();

    const medir = () => {
      const el = document.querySelector<HTMLElement>(`[data-tutorial="${seletor}"]`);

      if (!el) {
        const agora = performance.now();
        if (jaEncontrou) {
          // O alvo existia e sumiu: damos uma tolerancia curta antes de desistir.
          if (sumiuEm === 0) sumiuEm = agora;
          if (agora - sumiuEm > TOLERANCIA_SUMICO_MS) {
            setEstado({ situacao: 'ausente' });
            return; // encerra o loop
          }
        } else if (agora - inicio > (opcional ? TIMEOUT_OPCIONAL_MS : TIMEOUT_MS)) {
          setEstado({ situacao: 'ausente' });
          return; // encerra o loop
        }
        frame = requestAnimationFrame(medir);
        return;
      }

      sumiuEm = 0;
      jaEncontrou = true;

      // Rola ate o alvo uma unica vez; depois so acompanhamos.
      if (!jaRolou) {
        jaRolou = true;
        el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
      }

      const r = el.getBoundingClientRect();
      const rect: RetanguloAlvo = {
        top: r.top - MARGEM,
        left: r.left - MARGEM,
        width: r.width + MARGEM * 2,
        height: r.height + MARGEM * 2,
      };

      if (el !== ultimoEl || !ultimoRect || !mesmoRetangulo(ultimoRect, rect)) {
        ultimoRect = rect;
        ultimoEl = el;
        setEstado({ situacao: 'encontrado', rect, elemento: el });
      }

      frame = requestAnimationFrame(medir);
    };

    frame = requestAnimationFrame(medir);
    return () => cancelAnimationFrame(frame);
  }, [seletor, chavePasso, opcional]);

  return estado;
}
