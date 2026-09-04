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
const cacheMinutos = new WeakMap<Turno, [number, number][]>();

export function getSlotMinutes(turno: Turno | undefined, aulaIdx: number): [number, number] {
  if (!turno) return [-1, -1];

  /**
   * Os minutos de um slot são fixos: dependem só do turno e do índice, e o
   * turno não muda durante uma geração. Sem esta memória, `timeToMinutes`
   * refazia o `split(':')` e dois `parseInt` a cada pergunta de conflito —
   * milhões de vezes por geração, e 5% do tempo total no perfil da escola de
   * 22 turmas. `WeakMap` para o cache morrer junto com o turno, sem prender
   * objeto nenhum na memória.
   *
   * Isto assume que `turno.horarios` não é reescrito com o turno em uso. Hoje
   * ele é lido do banco e tratado como imutável em toda a geração; quem passar
   * a editá-lo em memória precisa invalidar aqui.
   */
  let porIndice = cacheMinutos.get(turno);
  if (!porIndice) {
    porIndice = [];
    cacheMinutos.set(turno, porIndice);
  }

  const guardado = porIndice[aulaIdx];
  if (guardado) return guardado;

  const h = turno.horarios?.[aulaIdx];
  const calculado: [number, number] = [timeToMinutes(h?.inicio), timeToMinutes(h?.fim)];
  porIndice[aulaIdx] = calculado;
  return calculado;
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

/**
 * REGRA DO DIA — o que pode acontecer com uma disciplina dentro de um dia.
 *
 * Recebe os índices que a disciplina ocuparia naquele dia (já com a colocação
 * candidata dentro) e responde se isso é aceitável. Três perguntas
 * independentes, e é importante que sejam três:
 *
 *   1. SEQUÊNCIA — nenhuma corrida contígua passa de `limiteRun`. É o que faz
 *      "geminar 2x" significar duas seguidas e não três.
 *
 *   2. ESPAÇAMENTO — entre duas corridas vizinhas da mesma disciplina precisa
 *      sobrar espaço: pelo menos 1 aula livre entre duas avulsas, pelo menos 2
 *      quando qualquer uma das duas é dupla. Três aulas de Matemática num dia a
 *      escola usa, desde que respirem; o par colado numa terceira, não.
 *
 *   3. TETO — quantas cabem no dia, no total.
 *
 *   segunda, 5 aulas          segunda, 9 aulas (integral)
 *   MAT -- MAT -- MAT   ok    MAT MAT -- -- MAT MAT -- -- --   ok
 *   MAT MAT -- -- MAT   ok    MAT -- MAT -- MAT -- MAT -- --   ok (no teto)
 *   MAT MAT -- MAT --   não   MAT MAT -- MAT MAT -- -- -- --   não (vão de 1)
 *   MAT MAT MAT -- --   não
 *
 * Houve aqui, antes, um teto de CONTAGEM puro: no máximo 2 no dia. Ele matava o
 * defeito certo — o par mais a avulsa, relatado na Dona Cândida — mas junto
 * proibia o espalhado, que a escola aceita. Custou 3 pendências na escola mais
 * apertada da referência, e essas pendências não compravam nada.
 *
 * Note que para duas avulsas a regra 2 é automática: corridas distintas já têm
 * pelo menos um vão. Ela está escrita assim mesmo assim porque descreve a
 * intenção, e porque volta a ter efeito se um dia o limite de sequência mudar.
 */
export function regraDoDiaViolada(
  indices: number[],
  limiteRun: number,
  tetoDeAulas: number,
): boolean {
  const ordenados = [...new Set(indices)].sort((a, b) => a - b);
  if (ordenados.length === 0) return false;
  if (ordenados.length > tetoDeAulas) return true;

  const corridas: { ini: number; fim: number; tam: number }[] = [];
  let i = 0;
  while (i < ordenados.length) {
    let fim = i;
    while (fim + 1 < ordenados.length && ordenados[fim + 1] === ordenados[fim] + 1) fim++;
    corridas.push({ ini: ordenados[i], fim: ordenados[fim], tam: fim - i + 1 });
    i = fim + 1;
  }

  for (const c of corridas) {
    if (c.tam > limiteRun) return true;
  }

  for (let k = 1; k < corridas.length; k++) {
    const anterior = corridas[k - 1];
    const atual = corridas[k];
    const vao = atual.ini - anterior.fim - 1;
    const minimo = anterior.tam >= 2 || atual.tam >= 2 ? 2 : 1;
    if (vao < minimo) return true;
  }

  return false;
}

/**
 * Turnos cujo `horarios` não cobre todas as aulas do dia.
 *
 * Sem os minutos de um slot, `minutesConflitam` não tem como comparar aquele
 * turno com outro e assume conflito — que é a postura certa, e também a que faz
 * a tela recusar movimento atrás de movimento sem explicar por quê. Quem
 * pergunta isto está atrás da explicação: o problema é o cadastro do turno, não
 * a busca.
 */
export function turnosSemHorarioCompleto(
  turnos: Iterable<Turno>,
): { id: string; nome: string; faltam: number }[] {
  const incompletos: { id: string; nome: string; faltam: number }[] = [];
  for (const t of turnos) {
    const previstas = t.aulas_por_dia ?? 0;
    if (previstas <= 0) continue;
    let cobertas = 0;
    for (let i = 0; i < previstas; i++) {
      const [ini, fim] = getSlotMinutes(t, i);
      if (ini >= 0 && fim >= 0) cobertas++;
    }
    if (cobertas < previstas) incompletos.push({ id: t.id, nome: t.nome, faltam: previstas - cobertas });
  }
  return incompletos;
}

/** Dia longo o bastante para comportar duas duplas espaçadas da mesma matéria. */
export const DIA_LONGO_MIN_AULAS = 7;
/** Teto de aulas da mesma disciplina no dia: dia longo / dia curto. */
export const TETO_DIA_LONGO = 4;
export const TETO_DIA_CURTO = 3;
