'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { Tutorial } from '@/lib/tutoriais/types';
import { abreSozinho, tutorialDaRota } from '@/lib/tutoriais';
import { marcarTutorialVisto } from '@/app/(app)/profile/actions';
import { TutorialOverlay } from './tutorial-overlay';

/** Folga para a pagina carregar os dados antes de abrirmos o tutorial sozinhos. */
const ATRASO_AUTO_INICIO_MS = 900;

type TutorialContexto = {
  tutorial: Tutorial | null;
  indice: number;
  /** IDs de tutoriais que este usuario ja concluiu. */
  vistos: string[];
  iniciar: (tutorial: Tutorial) => void;
  proximo: () => void;
  voltar: () => void;
  sair: () => void;
};

const Contexto = React.createContext<TutorialContexto | null>(null);

export function useTutorial() {
  const ctx = React.useContext(Contexto);
  if (!ctx) throw new Error('useTutorial precisa estar dentro de <TutorialProvider>');
  return ctx;
}

type TutorialProviderProps = {
  children: React.ReactNode;
  /** `profiles.tutoriais_vistos` do usuario logado. */
  tutoriaisVistos: string[];
  /** Sem escola selecionada as paginas nao renderizam seus alvos. */
  escolaSelecionada: boolean;
};

/**
 * Guarda o estado do tutorial e renderiza o overlay.
 *
 * Fica dentro do `SidebarProvider` de proposito: assim o overlay consegue usar
 * `useSidebar()` para abrir a sidebar mobile antes de destacar um item de menu.
 * Renderiza um fragmento (sem div) para nao interferir no flex do layout.
 *
 * Como este componente vive no layout de `(app)`, ele nao remonta durante a
 * navegacao client-side — e por isso que o tour completo consegue atravessar
 * varias rotas sem perder o passo atual.
 */
export function TutorialProvider({
  children,
  tutoriaisVistos,
  escolaSelecionada,
}: TutorialProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [tutorial, setTutorial] = React.useState<Tutorial | null>(null);
  const [indice, setIndice] = React.useState(0);
  const [vistos, setVistos] = React.useState<string[]>(tutoriaisVistos);

  const sair = React.useCallback(() => {
    setTutorial(null);
    setIndice(0);
  }, []);

  /**
   * Marca o tutorial como visto no instante em que ele aparece.
   *
   * O compromisso e "cada tela se apresenta uma unica vez": a partir do momento
   * em que a pessoa viu, tanto faz se ela concluiu, pulou ou fechou — o sistema
   * nao insiste de novo. Marcar na abertura (e nao no ultimo passo) tambem
   * cobre quem fecha a aba no meio, que de outro modo reveria tudo.
   */
  const iniciar = React.useCallback((novo: Tutorial) => {
    setTutorial(novo);
    setIndice(0);

    setVistos(atual => (atual.includes(novo.id) ? atual : [...atual, novo.id]));
    void marcarTutorialVisto(novo.id).catch(erro => {
      // Falhar aqui nao pode travar a interface; no pior caso o tutorial
      // reaparece na proxima visita.
      console.error('Nao foi possivel registrar o tutorial como visto:', erro);
    });
  }, []);

  const proximo = React.useCallback(() => {
    if (!tutorial) return;
    if (indice < tutorial.passos.length - 1) {
      setIndice(i => i + 1);
      return;
    }
    sair();
  }, [tutorial, indice, sair]);

  const voltar = React.useCallback(() => {
    setIndice(i => Math.max(0, i - 1));
  }, []);

  const daRota = tutorialDaRota(pathname);

  /**
   * Guarda a rota em que ja tentamos abrir sozinhos. Sem isto, sair do tutorial
   * cairia direto no efeito de novo (o tutorial continua "nao visto") e ele
   * reabriria em loop, sem deixar a pessoa usar a tela.
   */
  const rotaAutoIniciada = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!daRota || tutorial) return;
    // A maioria das telas so abre o tutorial pelo botao de ajuda (ver AUTO_INICIO).
    if (!abreSozinho(daRota)) return;
    if (rotaAutoIniciada.current === pathname) return;
    if (vistos.includes(daRota.id)) return;
    // Sem escola escolhida a pagina mostra um aviso no lugar do conteudo:
    // abrir o tutorial ali so mostraria cartoes apontando para o vazio.
    if (!escolaSelecionada && daRota.id !== 'dashboard') return;

    rotaAutoIniciada.current = pathname;
    // Passa por `iniciar` de proposito: e ele que registra o tutorial como visto.
    const t = window.setTimeout(() => iniciar(daRota), ATRASO_AUTO_INICIO_MS);
    return () => window.clearTimeout(t);
  }, [pathname, daRota, tutorial, vistos, escolaSelecionada, iniciar]);

  // Passos do tour completo pedem uma rota; navegamos antes de procurar o alvo.
  const rotaDoPasso = tutorial?.passos[indice]?.rota;
  React.useEffect(() => {
    if (rotaDoPasso) router.push(rotaDoPasso);
  }, [rotaDoPasso, router]);

  // Esc sai do tutorial a qualquer momento (mesmo padrao do ThemeShortcut).
  React.useEffect(() => {
    if (!tutorial) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') sair();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [tutorial, sair]);

  const valor = React.useMemo<TutorialContexto>(
    () => ({ tutorial, indice, vistos, iniciar, proximo, voltar, sair }),
    [tutorial, indice, vistos, iniciar, proximo, voltar, sair]
  );

  return (
    <Contexto.Provider value={valor}>
      {children}
      <TutorialOverlay />
    </Contexto.Provider>
  );
}
