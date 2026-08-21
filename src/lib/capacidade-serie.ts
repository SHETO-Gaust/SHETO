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

/** So este status bloqueia o slot (ver `handleCellClick` em `edit-serie-sheet.tsx`). */
const STATUS_BLOQUEADO = 'proibido';

type GradeDoTurno = Pick<Turno, 'aulas_por_dia' | 'dias_semana'> | null | undefined;

/**
 * Quantos slots a serie bloqueou dentro da grade ATUAL do turno.
 *
 * Restringimos a contagem a `dias_semana` x `aulas_por_dia` de proposito: se o
 * turno encolher depois de as restricoes terem sido marcadas (menos dias ou
 * menos aulas por dia), as marcas antigas continuam gravadas no JSONB. Sem este
 * recorte elas descontariam slots que nem existem mais, e a capacidade cairia
 * abaixo do real.
 */
export function contarSlotsProibidos(restricoes: RestricoesSerie, turno: GradeDoTurno): number {
  if (!restricoes || !turno) return 0;

  const aulasPorDia = turno.aulas_por_dia ?? 0;
  let total = 0;

  for (const dia of turno.dias_semana ?? []) {
    const doDia = restricoes[dia];
    if (!doDia) continue;
    for (let indice = 0; indice < aulasPorDia; indice++) {
      if (doDia[indice] === STATUS_BLOQUEADO) total++;
    }
  }

  return total;
}

/**
 * Aulas presenciais que a serie realmente tem por semana: a grade do turno menos
 * os slots proibidos. E este o numero contra o qual a carga horaria das
 * disciplinas deve fechar.
 */
export function capacidadeSemanalDaSerie(turno: GradeDoTurno, restricoes: RestricoesSerie): number {
  if (!turno) return 0;
  const grade = (turno.aulas_por_dia ?? 0) * (turno.dias_semana?.length ?? 0);
  return Math.max(0, grade - contarSlotsProibidos(restricoes, turno));
}
