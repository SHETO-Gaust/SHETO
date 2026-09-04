/**
 * Geminação personalizada do professor — leitura e normalização.
 *
 * O valor vem de um JSONB (`professores.geminacao_personalizada`) preenchido na
 * tela de cadastro, então chega aqui sem garantia nenhuma de forma: pode ser
 * `null`, pode ser um objeto de uma versão anterior, pode ter número em texto.
 * Toda leitura passa por `normalizarGeminacaoPersonalizada` para que o motor, o
 * refino e a tela concordem sobre o que aquele registro significa — foi a
 * divergência entre duas leituras da mesma regra que produziu, no teto do dia,
 * o defeito que `regraDoDiaViolada` existe para impedir.
 *
 * O acordo é POR MATÉRIA, não por pessoa: o mesmo professor pode aceitar
 * dobradinha em Matemática e recusar em Projeto de Vida. Por isso o registro é
 * um mapa `componente_id → regra`, e não um par de números solto.
 */

import type { GeminacaoPersonalizada, GeminacaoPorComponente } from './types';

/** Emendas oferecidas na tela. Mexer aqui muda a tela e o que o motor aceita. */
export const OPCOES_MAX_CONSECUTIVAS = [2, 3] as const;
/** Tetos diários oferecidos na tela. */
export const OPCOES_MAX_NO_DIA = [2, 3, 4, 5] as const;

export const GEMINACAO_PERSONALIZADA_PADRAO: GeminacaoPersonalizada = {
  max_consecutivas: 2,
  max_no_dia: 3,
};

/**
 * Chave curinga do formato ANTIGO, em que a regra era uma só para o professor
 * inteiro (`{max_consecutivas, max_no_dia}` na raiz do jsonb).
 *
 * Os registros gravados naquele formato continuam válidos e passam a valer para
 * todas as matérias daquele professor — que é exatamente o que significavam.
 * Migrar o dado no banco exigiria saber quais disciplinas ele leciona, e a
 * resposta muda quando a habilitação muda; resolver na leitura não tem esse
 * problema. Some sozinho: qualquer gravação pela tela já sai no formato novo.
 */
export const CHAVE_TODAS_AS_MATERIAS = '*';

/**
 * Uma regra válida, ou `null`.
 *
 * `max_no_dia` nunca sai menor que `max_consecutivas`: "bloco de 3, no máximo 2
 * no dia" é um pedido que se contradiz, e o motor precisa de um par coerente —
 * o teto do dia com o número menor recusaria justamente o bloco pedido.
 */
export function normalizarRegra(bruto: unknown): GeminacaoPersonalizada | null {
  if (!bruto || typeof bruto !== 'object') return null;
  const obj = bruto as Record<string, unknown>;

  const consBruto = Number(obj.max_consecutivas);
  if (!Number.isFinite(consBruto) || consBruto < 2) return null;
  const max_consecutivas = (consBruto >= 3 ? 3 : 2) as GeminacaoPersonalizada['max_consecutivas'];

  const diaBruto = Number(obj.max_no_dia);
  const dia = Number.isFinite(diaBruto) ? diaBruto : max_consecutivas;
  const max_no_dia = Math.min(5, Math.max(max_consecutivas, Math.round(dia))) as GeminacaoPersonalizada['max_no_dia'];

  return { max_consecutivas, max_no_dia };
}

/**
 * O mapa `componente_id → regra` do professor, ou `null` quando não há nenhuma.
 *
 * Aceita os dois formatos: o novo (mapa por matéria) e o antigo (regra única na
 * raiz), que vira uma entrada em `CHAVE_TODAS_AS_MATERIAS`.
 */
export function normalizarGeminacaoPersonalizada(bruto: unknown): GeminacaoPorComponente | null {
  if (!bruto || typeof bruto !== 'object') return null;

  const raiz = normalizarRegra(bruto);
  if (raiz) return { [CHAVE_TODAS_AS_MATERIAS]: raiz };

  const mapa: GeminacaoPorComponente = {};
  for (const [componenteId, valor] of Object.entries(bruto as Record<string, unknown>)) {
    const regra = normalizarRegra(valor);
    if (regra) mapa[componenteId] = regra;
  }
  return Object.keys(mapa).length > 0 ? mapa : null;
}

/** A regra daquele professor NAQUELA matéria, ou `null` se ele não personalizou. */
export function regraDaMateria(
  mapa: GeminacaoPorComponente | null | undefined,
  componenteId: string,
): GeminacaoPersonalizada | null {
  if (!mapa) return null;
  return mapa[componenteId] ?? mapa[CHAVE_TODAS_AS_MATERIAS] ?? null;
}

/** Atalho para quem tem o registro cru na mão. */
export function regraDoProfessorNaMateria(
  bruto: unknown,
  componenteId: string,
): GeminacaoPersonalizada | null {
  return regraDaMateria(normalizarGeminacaoPersonalizada(bruto), componenteId);
}

/** `professor_id` → mapa por matéria, só para quem personalizou alguma. */
export function mapaGeminacaoPorProfessor(
  professores: { id: string; geminacao_personalizada?: unknown }[],
): Map<string, GeminacaoPorComponente> {
  const mapa = new Map<string, GeminacaoPorComponente>();
  for (const p of professores) {
    const g = normalizarGeminacaoPersonalizada(p.geminacao_personalizada);
    if (g) mapa.set(p.id, g);
  }
  return mapa;
}

/**
 * Texto curto para a tela: "2x, até 3/dia".
 *
 * Mora aqui, e não no componente, porque a mesma frase aparece na lista fechada
 * e no painel aberto — duas cópias sairiam do ar uma da outra na primeira vez
 * que alguém mexesse numa delas.
 */
export function resumoDaRegra(regra: GeminacaoPersonalizada): string {
  return `${regra.max_consecutivas}x, até ${regra.max_no_dia}/dia`;
}

/**
 * O mapa com a regra de UMA matéria trocada — ou removida, quando `regra` é
 * `null`. Mapa que fica vazio vira `null`, e não `{}`.
 *
 * O `{}` importa: gravado no jsonb ele é indistinguível de "personalizou" para
 * quem só testa a presença do campo, e o professor apareceria como
 * personalizado sem uma única regra dentro.
 */
export function comRegra(
  mapa: GeminacaoPorComponente | null | undefined,
  componenteId: string,
  regra: GeminacaoPersonalizada | null,
): GeminacaoPorComponente | null {
  const proximo: GeminacaoPorComponente = { ...(mapa ?? {}) };
  if (regra) proximo[componenteId] = regra;
  else delete proximo[componenteId];
  return Object.keys(proximo).length > 0 ? proximo : null;
}
