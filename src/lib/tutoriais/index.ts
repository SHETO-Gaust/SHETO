import type { Tutorial } from './types';
import { tutorialDashboard } from './dashboard';
import { tutorialTurno } from './turno';
import { tutorialEnsino } from './ensino';
import { tutorialComponentes } from './componentes';
import { tutorialProfessores } from './professores';
import { tutorialSerie } from './serie';
import { tutorialTurmas } from './turmas';
import { tutorialGerarHorarios } from './gerarhorarios';
import { tutorialVisualizarHorario } from './visualizarhorario';
import { tutorialRelatorios } from './relatorios';
import { tutorialRefinoDeHorario } from './refinodehorario';
import { tutorialSubstituicoes } from './substituicoes';

export type { PassoTutorial, Tutorial, ModoAvanco } from './types';

/**
 * Tutorial de cada tela, indexado pela rota.
 *
 * O botao de interrogacao do cabecalho resolve o tutorial sozinho a partir do
 * `usePathname()`, entao basta registrar o modulo aqui para ele ganhar ajuda.
 *
 * A ordem segue a numeracao que a pessoa ve no badge da sidebar
 * (`allLinks` em `src/components/main-nav.tsx`).
 */
export const TUTORIAIS: Record<string, Tutorial> = {
  '/dashboard': tutorialDashboard,
  '/turno': tutorialTurno,
  '/ensino': tutorialEnsino,
  '/componentes': tutorialComponentes,
  '/professores': tutorialProfessores,
  '/serie': tutorialSerie,
  '/turmas': tutorialTurmas,
  '/gerarhorarios': tutorialGerarHorarios,
  '/visualizarhorario': tutorialVisualizarHorario,
  '/relatorios': tutorialRelatorios,
  '/refinodehorario': tutorialRefinoDeHorario,
  '/substituicoes': tutorialSubstituicoes,
};

/**
 * Tutoriais que abrem sozinhos na primeira visita da tela.
 *
 * So o de Turnos, de proposito. Um pop-up em cada aba nao e ajuda, e
 * interrupcao: quem percorre o fluxo fecha doze caixas ate chegar na grade. Como
 * Turnos e o passo 1, e ele que serve de porta de entrada — as demais telas
 * continuam com o tutorial a um clique no botao de interrogacao do cabecalho.
 *
 * Registrar um modulo em `TUTORIAIS` da ajuda a ele; incluir o id aqui e uma
 * decisao separada, e deliberada.
 */
const AUTO_INICIO = new Set<string>(['turno']);

/** Este tutorial abre sozinho, ou so pelo botao de ajuda? */
export function abreSozinho(tutorial: Tutorial): boolean {
  return AUTO_INICIO.has(tutorial.id);
}

/** Tour que atravessa as abas na ordem do fluxo. Chega na Fase 3. */
export const TOUR_COMPLETO: Tutorial | null = null;

/** Acha o tutorial da rota atual, tolerando sub-rotas como `/gerarhorarios/123`. */
export function tutorialDaRota(pathname: string): Tutorial | null {
  const rota = Object.keys(TUTORIAIS).find(
    r => pathname === r || pathname.startsWith(`${r}/`)
  );
  return rota ? TUTORIAIS[rota] : null;
}
