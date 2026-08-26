/**
 * Quando dois slots de horário acontecem ao mesmo tempo.
 *
 * Vivia dentro de `timetabling.ts`, privado. Saiu de lá porque o certificado de
 * inviabilidade precisa da MESMA regra: enquanto ele contava ocupação por
 * índice de aula e o motor comparava minutos reais, os dois davam respostas
 * diferentes sobre o mesmo professor — e a tela acusava conflito que o motor
 * não via.
 */

import type { Turno } from './types';

/** Converte "HH:mm" → minutos desde meia-noite. Retorna -1 se inválido. */
export function timeToMinutes(hhmm: string | undefined | null): number {
  if (!hhmm) return -1;
  const parts = hhmm.split(':');
  if (parts.length < 2) return -1;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return -1;
  return h * 60 + m;
}

/**
 * Retorna [inicio_min, fim_min] para um slot de um turno.
 * Se o turno não tiver horários definidos, retorna [-1, -1].
 */
export function getSlotMinutes(turno: Turno | undefined, aulaIdx: number): [number, number] {
  const h = turno?.horarios?.[aulaIdx];
  const ini = timeToMinutes(h?.inicio);
  const fim = timeToMinutes(h?.fim);
  return [ini, fim];
}

/**
 * Verifica sobreposição real de dois slots.
 * Usa minutos pré-calculados: conflito quando ini1 < fim2 AND ini2 < fim1.
 * Contato exato (fim1 === ini2) NÃO é conflito.
 * Fail-safe: se qualquer horário for desconhecido (-1), assume conflito = true
 * (conservador — melhor rejeitar do que gerar choque).
 * Exceção: se os dois slots pertencem ao MESMO turno, usa índice direto.
 */
export function minutesConflitam(
  ini1: number, fim1: number,
  ini2: number, fim2: number,
  mesmoTurno: boolean,
  idx1: number,
  idx2: number,
): boolean {
  // Mesmo turno: conflito somente se mesmo índice
  if (mesmoTurno) return idx1 === idx2;

  // Horários não mapeados — conservador: assume conflito
  if (ini1 < 0 || fim1 < 0 || ini2 < 0 || fim2 < 0) return true;

  return ini1 < fim2 && ini2 < fim1;
}
