'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { HelpCircle, PlayCircle, Route } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TOUR_COMPLETO, tutorialDaRota } from '@/lib/tutoriais';
import type { Tutorial } from '@/lib/tutoriais/types';
import { cn } from '@/lib/utils';
import { useTutorial } from './tutorial-provider';

type Opcao = {
  tutorial: Tutorial;
  rotulo: string;
  descricao: string;
  icone: typeof PlayCircle;
};

export function TutorialButton() {
  const pathname = usePathname();
  const { iniciar, vistos } = useTutorial();
  const [menuAberto, setMenuAberto] = React.useState(false);

  const daTela = tutorialDaRota(pathname);

  const opcoes = React.useMemo<Opcao[]>(() => {
    const lista: Opcao[] = [];
    if (daTela) {
      lista.push({
        tutorial: daTela,
        rotulo: 'Ajuda desta tela',
        descricao: daTela.titulo,
        icone: PlayCircle,
      });
    }
    if (TOUR_COMPLETO) {
      lista.push({
        tutorial: TOUR_COMPLETO,
        rotulo: 'Passo a passo completo',
        descricao: 'Do cadastro até gerar o horário',
        icone: Route,
      });
    }
    return lista;
  }, [daTela]);

  // Chama a atencao enquanto a pessoa ainda nao concluiu o tutorial desta tela.
  const pendente = !!daTela && !vistos.includes(daTela.id);

  const abrir = (tutorial: Tutorial) => {
    setMenuAberto(false);
    iniciar(tutorial);
  };

  const aoClicarNoBotao = () => {
    if (opcoes.length === 0) return;
    // Com uma unica opcao nao faz sentido pedir mais um clique de quem so quer ajuda.
    if (opcoes.length === 1) {
      abrir(opcoes[0].tutorial);
      return;
    }
    setMenuAberto(aberto => !aberto);
  };

  if (opcoes.length === 0) return null;

  return (
    <Popover open={menuAberto} onOpenChange={setMenuAberto}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={aoClicarNoBotao}
          aria-label="Abrir tutorial desta tela"
          title="Tutorial desta tela"
          className={cn(
            'shrink-0 rounded-full text-muted-foreground hover:text-primary',
            pendente && 'animate-tutorial-pulso text-primary'
          )}
        >
          <HelpCircle className="h-5 w-5" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="w-72 p-1">
        <div className="flex flex-col">
          {opcoes.map(opcao => (
            <button
              key={opcao.tutorial.id}
              type="button"
              onClick={() => abrir(opcao.tutorial)}
              className="flex items-start gap-3 rounded-md p-2.5 text-left transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <opcao.icone className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{opcao.rotulo}</span>
                <span className="block text-xs text-muted-foreground">{opcao.descricao}</span>
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
