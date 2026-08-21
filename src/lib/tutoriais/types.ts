/**
 * Tipos do tutorial interativo.
 *
 * Um tutorial e uma lista de passos. Cada passo escurece a tela inteira e
 * ilumina um unico elemento, identificado pelo atributo `data-tutorial`.
 */

/**
 * Como o passo avanca:
 * - `proximo`: so pelo botao "Proximo" (passos explicativos).
 * - `acao`: so quando a pessoa clica de verdade no elemento destacado.
 * - `ambos`: aceita o clique real ou o botao (padrao recomendado).
 */
export type ModoAvanco = 'proximo' | 'acao' | 'ambos';

export type PassoTutorial = {
  /**
   * Valor do atributo `data-tutorial` do elemento a destacar.
   * Sem alvo, o passo vira um cartao centralizado (abertura/encerramento).
   */
  alvo?: string;
  titulo: string;
  /** Ate ~90 caracteres, em voz imperativa. O publico do SHE nao le textos longos. */
  texto: string;
  avancar?: ModoAvanco;
  /** Lado preferido do balao. O Radix reposiciona sozinho se nao couber. */
  lado?: 'top' | 'bottom' | 'left' | 'right';
  /** Navega para esta rota antes de procurar o alvo (usado pelo tour completo). */
  rota?: string;
  /** Se o alvo nao existir, pula em silencio em vez de mostrar o cartao de fallback. */
  opcional?: boolean;
};

export type Tutorial = {
  id: string;
  titulo: string;
  passos: PassoTutorial[];
};
