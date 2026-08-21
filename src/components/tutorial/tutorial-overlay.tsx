'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { useSidebar } from '@/components/ui/sidebar';
import { useTutorial } from './tutorial-provider';
import { useAlvo } from './use-alvo';
import { TutorialBalao } from './tutorial-balao';

/**
 * Quanto esperamos, procurando o alvo, antes de mostrar o balao no centro.
 *
 * No caso comum o alvo aparece em um ou dois frames e o balao ja nasce ancorado,
 * sem piscar no centro. Se demorar mais que isso, mostramos o balao mesmo assim:
 * a tela esta escurecida e sem ele a pessoa ficaria sem botao de saida.
 */
const ESPERA_ATE_MOSTRAR_BALAO_MS = 600;

export function TutorialOverlay() {
  const { tutorial, indice, proximo, voltar, sair } = useTutorial();
  const { isMobile, setOpenMobile } = useSidebar();
  const [montado, setMontado] = React.useState(false);

  React.useEffect(() => setMontado(true), []);

  const passo = tutorial?.passos[indice];
  const estado = useAlvo(passo?.alvo, indice, passo?.opcional);
  const alvoEl = estado.situacao === 'encontrado' ? estado.elemento : null;

  // Em telas pequenas a sidebar vira um Sheet: precisa estar aberta antes de
  // conseguirmos destacar um item de menu.
  React.useEffect(() => {
    if (!passo?.alvo || !isMobile) return;
    if (passo.alvo.startsWith('nav-')) setOpenMobile(true);
  }, [passo?.alvo, isMobile, setOpenMobile]);

  // Passo marcado como opcional cujo alvo nao existe nesta tela: segue adiante.
  React.useEffect(() => {
    if (estado.situacao === 'ausente' && passo?.opcional) proximo();
  }, [estado.situacao, passo?.opcional, proximo]);

  // Ver ESPERA_ATE_MOSTRAR_BALAO_MS.
  const [buscaDemorou, setBuscaDemorou] = React.useState(false);
  React.useEffect(() => {
    if (estado.situacao !== 'procurando') {
      setBuscaDemorou(false);
      return;
    }
    const t = window.setTimeout(() => setBuscaDemorou(true), ESPERA_ATE_MOSTRAR_BALAO_MS);
    return () => window.clearTimeout(t);
  }, [estado.situacao, indice]);

  // O tutorial nao bloqueia a interacao com o resto da tela: o escurecimento e
  // so uma dica visual. Tudo continua clicavel, inclusive menu, sidebar e
  // qualquer botao fora do recorte — quem quiser mexer em outra coisa no meio do
  // tutorial consegue, sem precisar sair dele.
  //
  // Modo "aprender fazendo": o clique real no elemento destacado avanca o passo.
  // Ouvimos na fase de bolha do document para que o onClick do proprio app
  // (delegado por React na raiz) rode antes — o Sheet ja comeca a abrir e so
  // entao trocamos de passo.
  const modo = passo?.avancar ?? 'proximo';
  React.useEffect(() => {
    if (!tutorial || modo === 'proximo' || !alvoEl) return;
    const aoClicar = (e: MouseEvent) => {
      if (e.target instanceof Node && alvoEl.contains(e.target)) proximo();
    };
    document.addEventListener('click', aoClicar);
    return () => document.removeEventListener('click', aoClicar);
  }, [tutorial, modo, alvoEl, proximo]);

  if (!montado || !tutorial || !passo) return null;

  const balao = (
    <TutorialBalao
      passo={passo}
      indice={indice}
      total={tutorial.passos.length}
      onProximo={proximo}
      onVoltar={voltar}
      onSair={sair}
    />
  );

  const conteudo =
    estado.situacao === 'encontrado' ? (
      <>
        {/*
          Um unico elemento faz o "escurece tudo menos isto": a sombra de 9999px
          pinta o resto da tela e o interior da caixa fica intocado, entao o alvo
          aparece com brilho total mesmo estando dentro de um Sheet em z-50.
        */}
        <div
          /*
            Transicao curta de proposito: o retangulo e reescrito a cada frame para
            acompanhar o scroll, e uma duracao longa faria o recorte arrastar atras
            do elemento durante a rolagem.
          */
          className="pointer-events-none fixed transition-[top,left,width,height] duration-200 ease-out"
          style={{
            top: estado.rect.top,
            left: estado.rect.left,
            width: estado.rect.width,
            height: estado.rect.height,
            borderRadius: 'calc(var(--radius) + 2px)',
            boxShadow: [
              '0 0 0 3px hsl(var(--primary))',
              '0 0 0 6px hsl(var(--primary) / 0.25)',
              '0 0 0 9999px rgba(0, 0, 0, 0.65)',
            ].join(', '),
          }}
        />
        <Popover open modal={false}>
          <PopoverAnchor asChild>
            <div
              className="pointer-events-none fixed"
              style={{
                top: estado.rect.top,
                left: estado.rect.left,
                width: estado.rect.width,
                height: estado.rect.height,
              }}
            />
          </PopoverAnchor>
          <PopoverContent
            side={passo.lado ?? 'bottom'}
            align="center"
            sideOffset={14}
            collisionPadding={16}
            onOpenAutoFocus={e => e.preventDefault()}
            onInteractOutside={e => e.preventDefault()}
            onEscapeKeyDown={e => e.preventDefault()}
            className="z-[95] w-auto border-0 bg-transparent p-0 shadow-none"
          >
            {balao}
          </PopoverContent>
        </Popover>
      </>
    ) : (
      // Sem alvo (abertura/encerramento) ou alvo nao encontrado: cartao no centro,
      // para que o tutorial nunca fique apontando para o vazio nem trave.
      <div className="fixed inset-0 grid place-items-center bg-black/65 p-4">
        {(estado.situacao !== 'procurando' || buscaDemorou) && balao}
      </div>
    );

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[90] print:hidden">{conteudo}</div>,
    document.body
  );
}
