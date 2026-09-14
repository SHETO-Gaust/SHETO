import type { Turno } from './types';

/**
 * Capacidade real de aulas presenciais de uma serie.
 *
 * A grade bruta do turno (`aulas_por_dia` x `dias_semana`) NAO e a capacidade da
 * serie: os slots que a serie marcou como `proibido` na aba Restricoes ficam
 * indisponiveis, e o motor de geracao ja os pula (ver `serie_restricoes` em
 * `timetabling.ts`). Contar a grade bruta faz a tela prometer mais aulas do que
 * o gerador consegue encaixar — uma serie com 20 slots e 3 restricoes tem 17.
 */

/** Forma do JSONB `series.restricoes`: dia -> indice da aula -> status. */
export type RestricoesSerie = Record<string, Record<string | number, string>> | null | undefined;

/** Slot vetado: nenhuma aula cai aqui, de tipo nenhum. */
const STATUS_BLOQUEADO = 'proibido';

/**
 * Slot reservado para aula NAO PRESENCIAL dentro do proprio turno da serie.
 *
 * E o segundo status que a aba Restricoes sabe pintar (ver `handleCellClick` em
 * `edit-serie-sheet.tsx`). Marcar um slot assim faz duas coisas ao mesmo tempo:
 * tira ele da capacidade presencial e cria uma vaga de NP no proprio horario da
 * turma — sem depender de turno oposto, que e o que destrava o Noturno.
 */
const STATUS_NAO_PRESENCIAL = 'nao_presencial';

type GradeDoTurno = Pick<Turno, 'aulas_por_dia' | 'dias_semana'> | null | undefined;

/**
 * Quantos slots da grade ATUAL do turno tem um dado status.
 *
 * O recorte por `dias_semana` x `aulas_por_dia` e deliberado e vale para os dois
 * status: se o turno encolher depois de as marcas terem sido feitas (menos dias
 * ou menos aulas por dia), elas continuam gravadas no JSONB. Sem o recorte, marca
 * orfa descontaria slot que nem existe mais.
 */
function contarSlotsComStatus(restricoes: RestricoesSerie, turno: GradeDoTurno, status: string): number {
  if (!restricoes || !turno) return 0;

  const aulasPorDia = turno.aulas_por_dia ?? 0;
  let total = 0;

  for (const dia of turno.dias_semana ?? []) {
    const doDia = restricoes[dia];
    if (!doDia) continue;
    for (let indice = 0; indice < aulasPorDia; indice++) {
      if (doDia[indice] === status) total++;
    }
  }

  return total;
}

/** Quantos slots a serie bloqueou dentro da grade ATUAL do turno. */
export function contarSlotsProibidos(restricoes: RestricoesSerie, turno: GradeDoTurno): number {
  return contarSlotsComStatus(restricoes, turno, STATUS_BLOQUEADO);
}

/** Quantos slots a serie reservou para aula nao presencial no proprio turno. */
export function contarSlotsNaoPresenciais(restricoes: RestricoesSerie, turno: GradeDoTurno): number {
  return contarSlotsComStatus(restricoes, turno, STATUS_NAO_PRESENCIAL);
}

/**
 * Aulas presenciais que a serie realmente tem por semana: a grade do turno menos
 * os slots proibidos E menos os reservados para nao presencial. E este o numero
 * contra o qual a carga horaria presencial das disciplinas deve fechar.
 *
 * Os dois status descontam pelo mesmo motivo: nenhum dos dois aceita aula
 * presencial. Um slot marcado como nao presencial nao e uma aula a mais, e uma
 * aula presencial a menos que virou vaga de NP.
 */
export function capacidadeSemanalDaSerie(turno: GradeDoTurno, restricoes: RestricoesSerie): number {
  if (!turno) return 0;
  const grade = (turno.aulas_por_dia ?? 0) * (turno.dias_semana?.length ?? 0);
  const indisponiveis = contarSlotsProibidos(restricoes, turno) + contarSlotsNaoPresenciais(restricoes, turno);
  return Math.max(0, grade - indisponiveis);
}

/**
 * Aulas nao presenciais que cabem no proprio turno da serie: exatamente os slots
 * que ela marcou. E o teto contra o qual `series.aulas_nao_presenciais_semanais`
 * deve fechar quando a serie usa este modo.
 */
export function capacidadeNaoPresencialDaSerie(turno: GradeDoTurno, restricoes: RestricoesSerie): number {
  return contarSlotsNaoPresenciais(restricoes, turno);
}

/**
 * A serie coloca as aulas NP dentro do proprio horario, em vez de manda-las para
 * o contraturno?
 *
 * E o INTERRUPTOR DO MODO, e a resposta e o dado, nao uma configuracao a parte:
 * marcou slot, usa o proprio turno. Serie sem marca nenhuma responde `false` e
 * segue no contraturno, que e o comportamento de sempre — por isso nada do que ja
 * esta cadastrado muda de lugar.
 *
 * Tela, motor e exibicao leem daqui. Se responderem coisas diferentes, a aula
 * aparece num lugar e e gerada noutro.
 */
export function serieUsaNpNoProprioTurno(restricoes: RestricoesSerie, turno: GradeDoTurno): boolean {
  return contarSlotsNaoPresenciais(restricoes, turno) > 0;
}

/** O slot esta reservado para aula nao presencial? */
export function slotEhNaoPresencial(restricoes: RestricoesSerie, dia: string, idx: number): boolean {
  return restricoes?.[dia]?.[idx] === STATUS_NAO_PRESENCIAL;
}

/** O slot esta vetado a qualquer aula? */
export function slotEhProibido(restricoes: RestricoesSerie, dia: string, idx: number): boolean {
  return restricoes?.[dia]?.[idx] === STATUS_BLOQUEADO;
}

/**
 * O slot aceita um bloco deste tipo?
 *
 * Fonte unica da regra de slot, usada tanto pelo motor quanto pelas validacoes de
 * travamento. Os tres casos:
 *
 *   - presencial          -> qualquer slot sem marca; `proibido` e `nao_presencial` vetam.
 *   - NP no proprio turno -> SO os slots marcados `nao_presencial`.
 *   - NP no contraturno   -> sempre aceita: as marcas sao da grade de outro turno,
 *                            e nao dizem nada sobre onde a aula vai cair.
 */
export function slotAceitaAula(
  restricoes: RestricoesSerie,
  dia: string,
  idx: number,
  tipo: 'presencial' | 'nao_presencial',
  npNoProprioTurno: boolean,
): boolean {
  if (tipo === 'presencial') {
    return !slotEhProibido(restricoes, dia, idx) && !slotEhNaoPresencial(restricoes, dia, idx);
  }
  if (!npNoProprioTurno) return true;
  return slotEhNaoPresencial(restricoes, dia, idx);
}
