/**
 * Refino de horário: mover uma aula de slot, ou trocar duas de lugar.
 *
 * Roda no navegador, sobre a grade que a tela já tem em mãos — é o que permite
 * o painel de impacto responder no clique.
 *
 * DUAS BASES, E A DISTINÇÃO É O CORAÇÃO DO MÓDULO. `aulasMoveis` são as aulas
 * da grade que está sendo editada, as únicas que qualquer rota pode mexer.
 * `aulasReferencia` são as aulas das OUTRAS grades vigentes da escola — uma por
 * turno, escolhida na tela: elas ocupam professor e turma no relógio e nunca
 * saem do lugar. Sem elas, o Integral e o Matutino (que começam os dois às 7h)
 * não se falavam, e o refino aceitava pôr o mesmo professor nos dois ao mesmo
 * tempo, em turmas diferentes — grade que a tela aprova e a escola não cumpre.
 *
 * O tempo é comparado por MINUTOS REAIS, pela conta canônica de
 * `horario-slots.ts`, a mesma do motor de geração. A cópia privada que morava
 * aqui concluía "sem conflito" quando o turno não tinha horários cadastrados —
 * exatamente ao contrário do que se deve presumir.
 */

import type { Turno } from './types';
import { getSlotMinutes, minutesConflitam } from './horario-slots';
import {
  chaveProfessor,
  restricaoDoSlot,
  rotuloImpedimento,
  type ProfessorRefino,
} from './refino/professor';
import type { MotivoImpedimento } from './restricoes-professor';

export type { ProfessorRefino };

export type AulaRefino = {
  id: string;
  horario_id: string;
  /** Nome da grade de origem. Serve para o painel dizer ONDE está o choque. */
  horario_nome?: string;
  turma_id: string;
  turma_nome: string;
  componente_id: string;
  componente_nome: string;
  componente_sigla: string;
  professor_id: string | null;
  professor_nome: string;
  professor_cpf?: string | null;
  dia_semana: string;
  aula_index: number;
  tipo: 'presencial' | 'nao_presencial';
  turno_id: string;
  // Rastreamento de aulas fixas/compartilhadas
  aula_fixa_id?: string | null;
  compartilhada?: boolean;
  aula_compartilhada_id?: string | null;
  /**
   * `false` = veio de uma grade de referência e é imóvel.
   * Ausente/`true` = pertence à grade em edição.
   */
  movel?: boolean;
};

export type Move = {
  aulaId: string;
  novoDia: string;
  novoSlot: number;
  novoTurnoId: string;
};

/**
 * Represents a single movement within an option, with full metadata for rich UI rendering.
 */
export type PassoDetalhado = {
  aulaId: string;
  /** true = this is the primary move requested by the user; false = secondary/support move */
  isPrincipal: boolean;
  componente_sigla: string;
  componente_nome: string;
  turma_nome: string;
  professor_nome: string;
  turno_nome: string;
  tipo: 'presencial' | 'nao_presencial';
  // Origin
  origemDia: string;
  origemSlot: number;
  // Destination
  destinoDia: string;
  destinoSlot: number;
  destinoTurnoId: string;
};

export type Possibilidade = {
  id: string;
  moves: Move[];
  impactoTurmas: number;
  impactoProfessores: number;
  qtdMovimentos: number;
  passos: PassoDetalhado[];
};

export type ImpactoAnalise = {
  status: 'livre' | 'sugestao' | 'atencao' | 'bloqueado' | 'possibilidades';
  mensagem: string;
  mudancasNecessarias: Move[];
  possibilidades?: Possibilidade[];
};

// ============================================
// Contexto e vocabulário de impedimentos
// ============================================

export type Endereco = { dia: string; slot: number; turnoId: string };

/** Por que uma aula não pode ocupar um endereço. Irmão de `Empecilho` em `preencher-vagas.ts`. */
export type ImpedimentoRefino =
  | 'aula_fixa'             // aula_fixa_id != null — imóvel por contrato com a série
  | 'somente_leitura'       // é de uma grade de referência
  | 'turma_ocupada'         // outra aula da turma no mesmo instante (por minutos)
  | 'professor_ocupado'     // o professor está em sala no mesmo instante (por minutos)
  | 'professor_restrito'    // restrição declarada do professor
  | 'slot_inexistente'      // o dia/índice não existe no turno de destino
  | 'horario_desconhecido'; // o turno de destino não está carregado

export type Bloqueio = {
  motivo: ImpedimentoRefino;
  /** Quem segura o lugar, quando o motivo é de ocupação. */
  culpado?: AulaRefino | null;
  /** Qual restrição, quando o motivo é `professor_restrito`. */
  restricao?: MotivoImpedimento | null;
};

export type ContextoRefino = {
  /** Aulas da grade em edição. As ÚNICAS que qualquer rota pode mover. */
  aulasMoveis: AulaRefino[];
  /** Aulas das grades de referência (uma por turno). Bloqueiam; nunca se movem. */
  aulasReferencia: AulaRefino[];
  turnosById: Map<string, Turno>;
  /** Ausente = restrição declarada não é checada (comportamento antigo). */
  professoresById?: Map<string, ProfessorRefino>;
};

const SEM_IGNORADOS: ReadonlySet<string> = new Set();

export function enderecoDe(a: AulaRefino): Endereco {
  return { dia: a.dia_semana, slot: a.aula_index, turnoId: a.turno_id };
}

/**
 * A grade inteira que conta para conflito: o que está sendo editado mais o que
 * as outras grades já ocupam. Memoizado porque `motivoNaoAceita` roda dentro da
 * busca, dezenas de milhares de vezes, e concatenar a cada chamada custaria mais
 * que a checagem em si.
 */
const cacheGradeCompleta = new WeakMap<ContextoRefino, AulaRefino[]>();
function gradeCompleta(ctx: ContextoRefino): AulaRefino[] {
  let todas = cacheGradeCompleta.get(ctx);
  if (!todas) {
    todas = [...ctx.aulasMoveis, ...ctx.aulasReferencia];
    cacheGradeCompleta.set(ctx, todas);
  }
  return todas;
}

/** É desta aula que estamos falando, esteja ela em qual base estiver. */
function acharAula(ctx: ContextoRefino, aulaId: string): AulaRefino | undefined {
  return gradeCompleta(ctx).find(a => a.id === aulaId);
}

/**
 * Por que esta aula não pode ocupar este endereço — ou `null` se pode.
 *
 * Fonte única da regra: o movimento (com a busca em cadeia) e a troca passam
 * pelos mesmos olhos, senão as duas metades da tela discordariam sobre a mesma
 * grade. Espelha `motivoNaoMove` de `preencher-vagas.ts`.
 *
 * `posicaoDe` é onde cada aula está na grade SIMULADA — a busca não clona a
 * grade, mantém um diff. `ignorar` são as aulas que já saíram do lugar e não
 * devem contar como ocupantes; é o que a troca usa para as duas pontas pararem
 * de bloquear uma à outra.
 */
function motivoNaoAceita(
  ctx: ContextoRefino,
  aula: AulaRefino,
  para: Endereco,
  posicaoDe: (a: AulaRefino) => Endereco,
  ignorar: ReadonlySet<string>,
): Bloqueio | null {
  if (aula.aula_fixa_id) return { motivo: 'aula_fixa' };
  if (aula.movel === false) return { motivo: 'somente_leitura' };

  const turnoDestino = ctx.turnosById.get(para.turnoId);
  if (!turnoDestino) return { motivo: 'horario_desconhecido' };

  if (para.slot < 0 || para.slot >= (turnoDestino.aulas_por_dia ?? 0)) return { motivo: 'slot_inexistente' };
  if (turnoDestino.dias_semana?.length && !turnoDestino.dias_semana.includes(para.dia)) {
    return { motivo: 'slot_inexistente' };
  }

  if (aula.professor_id && ctx.professoresById) {
    const { dura } = restricaoDoSlot(
      ctx.professoresById.get(aula.professor_id), turnoDestino, para.dia, para.slot,
    );
    if (dura) return { motivo: 'professor_restrito', restricao: dura };
  }

  const [ini, fim] = getSlotMinutes(turnoDestino, para.slot);
  const chave = chaveProfessor(aula.professor_id, aula.professor_cpf);

  for (const outra of gradeCompleta(ctx)) {
    if (outra.id === aula.id || ignorar.has(outra.id)) continue;

    const pos = posicaoDe(outra);
    if (pos.slot < 0) continue;        // ejetada, flutuando fora da grade
    if (pos.dia !== para.dia) continue;

    const [i2, f2] = getSlotMinutes(ctx.turnosById.get(pos.turnoId), pos.slot);
    if (!minutesConflitam(ini, fim, i2, f2, pos.turnoId === para.turnoId, para.slot, pos.slot)) continue;

    if (outra.turma_id === aula.turma_id) return { motivo: 'turma_ocupada', culpado: outra };

    if (chave && outra.professor_id && chaveProfessor(outra.professor_id, outra.professor_cpf) === chave) {
      // Não é conflito real se as duas aulas pertencem à mesma aula coletiva.
      if (
        aula.aula_compartilhada_id &&
        outra.aula_compartilhada_id &&
        aula.aula_compartilhada_id === outra.aula_compartilhada_id
      ) continue;
      return { motivo: 'professor_ocupado', culpado: outra };
    }
  }

  return null;
}

/** O bloqueio em português, com nome próprio de quem barrou. */
export function descreverBloqueio(ctx: ContextoRefino, aula: AulaRefino, b: Bloqueio): string {
  const ondeCulpado = (c: AulaRefino) => {
    const turno = ctx.turnosById.get(c.turno_id)?.nome;
    const grade = c.movel === false ? c.horario_nome || 'outra grade' : 'esta grade';
    return `${c.componente_sigla || c.componente_nome} da turma ${c.turma_nome}${turno ? ` (turno ${turno})` : ''}, em ${grade}`;
  };

  switch (b.motivo) {
    case 'aula_fixa':
      return 'Esta aula é fixa no modelo da série e não pode ser movida pelo refino. Para alterá-la, edite a fixação na série e gere o horário de novo.';
    case 'somente_leitura':
      return `Esta aula pertence a ${aula.horario_nome || 'outra grade'}, que aqui é só referência de conflito. Abra aquela grade para editá-la.`;
    case 'slot_inexistente':
      return 'O turno de destino não tem este dia ou esta aula na grade dele.';
    case 'horario_desconhecido':
      return 'O turno de destino não está entre os turnos carregados.';
    case 'professor_restrito':
      return `${aula.professor_nome} marcou este horário como "${b.restricao ? rotuloImpedimento(b.restricao) : 'indisponível'}".`;
    case 'turma_ocupada':
      return b.culpado
        ? `A turma ${aula.turma_nome} já tem aula neste instante: ${ondeCulpado(b.culpado)}.`
        : `A turma ${aula.turma_nome} já tem aula neste instante.`;
    case 'professor_ocupado':
      return b.culpado
        ? `${aula.professor_nome} já está em sala neste instante: ${ondeCulpado(b.culpado)}.`
        : `${aula.professor_nome} já está em sala neste instante.`;
  }
}

/** Impedimento que nenhuma cadeia de remanejamento resolve. */
function bloqueioDefinitivo(b: Bloqueio): boolean {
  if (b.motivo === 'turma_ocupada' || b.motivo === 'professor_ocupado') {
    // Ocupante imóvel: a cadeia não tem como tirá-lo de lá.
    return !!b.culpado && (b.culpado.movel === false || !!b.culpado.aula_fixa_id);
  }
  return true;
}

// ============================================
// BFS Solver Graph Engine
// ============================================

type SlotAddress = { dia: string; slot: number; turnoId: string };

type SolverState = {
  moves: Move[];
  openTargetSlots: SlotAddress[];
  displacedLessons: AulaRefino[];
  simulatedAssignments: Map<string, string>; // aulaId -> JSON
  depth: number;
};

// Max DFS/BFS limits to prevent UI freezing
const MAX_DEPTH = 3;
const MAX_TIME_MS = 2000;
const MAX_SOLUTIONS = 5;

function hashState(moves: Move[]): string {
  // Sort moves by aulaId to ensure identical final configurations hash identically
  const sorted = [...moves].sort((a, b) => a.aulaId.localeCompare(b.aulaId));
  return sorted.map(m => `${m.aulaId}:${m.novoDia}:${m.novoSlot}`).join('|');
}

export function analisarMovimento(
  ctx: ContextoRefino,
  alvo: { aulaId: string; dia: string; slot: number; turnoId: string },
  runDeepSearch: boolean = false,
): ImpactoAnalise {
  const startMs = Date.now();
  const { aulaId, dia: diaDestino, slot: slotDestino, turnoId: turnoDestinoId } = alvo;
  const todasAulas = gradeCompleta(ctx);
  const turnosById = ctx.turnosById;

  const aulaOrigem = acharAula(ctx, aulaId);
  if (!aulaOrigem) {
    return { status: 'bloqueado', mensagem: 'Aula origem não encontrada.', mudancasNecessarias: [] };
  }

  const au_turmaId = aulaOrigem.turma_id;
  const destino: Endereco = { dia: diaDestino, slot: slotDestino, turnoId: turnoDestinoId };

  if (diaDestino === aulaOrigem.dia_semana && slotDestino === aulaOrigem.aula_index && turnoDestinoId === aulaOrigem.turno_id) {
    return { status: 'livre', mensagem: 'A aula já encontra-se neste slot.', mudancasNecessarias: [] };
  }

  const bloqueioNaRaiz = motivoNaoAceita(ctx, aulaOrigem, destino, enderecoDe, SEM_IGNORADOS);

  if (bloqueioNaRaiz && bloqueioDefinitivo(bloqueioNaRaiz)) {
    return {
      status: 'bloqueado',
      mensagem: descreverBloqueio(ctx, aulaOrigem, bloqueioNaRaiz),
      mudancasNecessarias: [],
    };
  }

  if (!runDeepSearch) {
    return {
      status: 'atencao',
      mensagem: bloqueioNaRaiz
        ? `${descreverBloqueio(ctx, aulaOrigem, bloqueioNaRaiz)} Calcule as possibilidades para ver se existe uma cadeia de remanejamentos que resolva.`
        : 'O destino está livre. No entanto, mover esta aula criará um buraco na origem e não é permitido deixar lacunas indevidas.',
      mudancasNecessarias: [],
    };
  }

  // ============================================
  // DFS SOLVER EXECUTION
  // ============================================
  const solutions: SolverState[] = [];
  const visited = new Set<string>();

  /** Onde cada aula está, considerando o diff da simulação. */
  const posicaoNoEstado = (state: SolverState) => (a: AulaRefino): Endereco => {
    const s = state.simulatedAssignments.get(a.id);
    if (!s) return enderecoDe(a);
    const [d, sl, t] = s.split('|');
    return { dia: d, slot: parseInt(sl, 10), turnoId: t };
  };

  function isSlotValid(aula: AulaRefino, dia: string, slot: number, turnoId: string, state: SolverState): boolean {
    return motivoNaoAceita(ctx, aula, { dia, slot, turnoId }, posicaoNoEstado(state), SEM_IGNORADOS) === null;
  }

  // Prepara o estado inicial
  const initialState: SolverState = {
    moves: [],
    openTargetSlots: [{ dia: aulaOrigem.dia_semana, slot: aulaOrigem.aula_index, turnoId: aulaOrigem.turno_id }],
    displacedLessons: [],
    simulatedAssignments: new Map(),
    depth: 0,
  };

  initialState.moves.push({ aulaId: aulaOrigem.id, novoDia: diaDestino, novoSlot: slotDestino, novoTurnoId: turnoDestinoId });
  initialState.simulatedAssignments.set(aulaId, `${diaDestino}|${slotDestino}|${turnoDestinoId}`);

  // Quem estava lá? É o mesmo ocupante que a checagem da raiz já encontrou.
  const displacedInit = bloqueioNaRaiz?.culpado ?? null;

  if (displacedInit) {
    initialState.displacedLessons.push(displacedInit);
    initialState.simulatedAssignments.set(displacedInit.id, `floating|-1|floating`);
  }

  visited.add(hashState(initialState.moves));

  // DFS recursivo simulando o Graph
  function dfs(currentState: SolverState) {
    if (Date.now() - startMs > MAX_TIME_MS) return;
    if (solutions.length >= MAX_SOLUTIONS) return;

    // Estado está limpo? Se não há aulas flutuando e TODOS os openSlots de origem foram fechados
    if (currentState.displacedLessons.length === 0 && currentState.openTargetSlots.length === 0) {
      solutions.push(currentState);
      return;
    }

    // Evita loops hiper-profundos
    if (currentState.depth >= MAX_DEPTH) return;

    if (currentState.displacedLessons.length > 0) {
      const lesson = currentState.displacedLessons[0];

      // Tenta colocar essa lesson num dos openTargetSlots
      for (let i = 0; i < currentState.openTargetSlots.length; i++) {
        const target = currentState.openTargetSlots[i];
        if (isSlotValid(lesson, target.dia, target.slot, target.turnoId, currentState)) {
          const newState = cloneState(currentState);
          newState.depth++;
          newState.displacedLessons.shift();
          newState.openTargetSlots.splice(i, 1);
          newState.moves.push({ aulaId: lesson.id, novoDia: target.dia, novoSlot: target.slot, novoTurnoId: target.turnoId });
          newState.simulatedAssignments.set(lesson.id, `${target.dia}|${target.slot}|${target.turnoId}`);

          const hash = hashState(newState.moves);
          if (!visited.has(hash)) {
            visited.add(hash);
            dfs(newState);
          }
        }
      }

      // Ou então, tenta empurrar ALGUEM pra ejetar ALGUEM (extensão de cadeia).
      const diasTurno = turnosById.get(lesson.turno_id)?.dias_semana || [];
      const slotsTurno = turnosById.get(lesson.turno_id)?.aulas_por_dia || 0;

      for (const d of diasTurno) {
        for (let s = 0; s < slotsTurno; s++) {
          const turnoLesson = turnosById.get(lesson.turno_id);
          const [iX, fX] = getSlotMinutes(turnoLesson, s);

          // Só aula da grade em edição pode ser ejetada: referência não se move.
          const targetAula = ctx.aulasMoveis.find(a =>
            a.id !== lesson.id &&
            a.turma_id === lesson.turma_id &&
            (() => {
              const sA = currentState.simulatedAssignments.get(a.id);
              let cdia = a.dia_semana, cslot = a.aula_index, ct = a.turno_id;
              if (sA) {
                if (sA.includes('floating')) return false;
                const prts = sA.split('|'); cdia = prts[0]; cslot = parseInt(prts[1], 10); ct = prts[2];
              }
              if (cdia !== d) return false;
              const [iaa, faa] = getSlotMinutes(turnosById.get(ct), cslot);
              return minutesConflitam(iX, fX, iaa, faa, ct === lesson.turno_id, s, cslot);
            })()
          );

          if (targetAula) {
            const curAssign = currentState.simulatedAssignments.get(targetAula.id);
            currentState.simulatedAssignments.set(targetAula.id, 'floating|-1|x');
            const valid = isSlotValid(lesson, d, s, lesson.turno_id, currentState);
            if (curAssign) currentState.simulatedAssignments.set(targetAula.id, curAssign);
            else currentState.simulatedAssignments.delete(targetAula.id);

            if (valid) {
              const nState = cloneState(currentState);
              nState.depth++;
              nState.displacedLessons.shift();
              nState.displacedLessons.push(targetAula);
              nState.moves.push({ aulaId: lesson.id, novoDia: d, novoSlot: s, novoTurnoId: lesson.turno_id });
              nState.simulatedAssignments.set(lesson.id, `${d}|${s}|${lesson.turno_id}`);
              nState.simulatedAssignments.set(targetAula.id, 'floating|-1|x');

              const hsh = hashState(nState.moves);
              if (!visited.has(hsh)) {
                visited.add(hsh);
                dfs(nState);
              }
            }
          }
        }
      }

    } else if (currentState.openTargetSlots.length > 0) {
      const target = currentState.openTargetSlots[0];

      const turmaCandidates = ctx.aulasMoveis.filter(a =>
        a.id !== aulaId && a.turma_id === au_turmaId &&
        !currentState.simulatedAssignments.has(a.id)
      ).sort((a, b) => b.aula_index - a.aula_index);

      for (const cand of turmaCandidates) {
        if (isSlotValid(cand, target.dia, target.slot, target.turnoId, currentState)) {
          const nState = cloneState(currentState);
          nState.depth++;
          nState.openTargetSlots.shift();
          nState.moves.push({ aulaId: cand.id, novoDia: target.dia, novoSlot: target.slot, novoTurnoId: target.turnoId });
          nState.simulatedAssignments.set(cand.id, `${target.dia}|${target.slot}|${target.turnoId}`);

          const hsh = hashState(nState.moves);
          if (!visited.has(hsh)) {
            visited.add(hsh);
            dfs(nState);
          }
        }
      }
    }
  }

  function cloneState(s: SolverState): SolverState {
    return {
      moves: [...s.moves],
      openTargetSlots: [...s.openTargetSlots],
      displacedLessons: [...s.displacedLessons],
      simulatedAssignments: new Map(s.simulatedAssignments),
      depth: s.depth,
    };
  }

  // Desperta a fera
  dfs(initialState);

  if (solutions.length === 0) {
    return {
      status: 'bloqueado',
      mensagem: 'Não foi encontrada uma sequência de remanejamentos viável (sem causar lacunas ou conflitos cronológicos reais) dentro dos limites de cálculo do sistema.',
      mudancasNecessarias: [],
    };
  }

  // Filtragem e Ranking das soluções
  const sortedSolutions = solutions.sort((a, b) => {
    if (a.moves.length !== b.moves.length) return a.moves.length - b.moves.length;
    return 0;
  });

  const topSols = sortedSolutions.slice(0, MAX_SOLUTIONS);

  const possibilidadesRender: Possibilidade[] = topSols.map((sol, index) => {
    const impactosProf = new Set<string>();
    const impactosTurm = new Set<string>();
    const passosDetalhados: PassoDetalhado[] = [];

    sol.moves.forEach((m, mIdx) => {
      const aula = todasAulas.find(a => a.id === m.aulaId);
      if (!aula) return;

      const turnoNome = turnosById.get(m.novoTurnoId)?.nome || turnosById.get(aula.turno_id)?.nome || '';

      impactosTurm.add(aula.turma_nome);
      if (aula.professor_nome) impactosProf.add(aula.professor_nome);

      passosDetalhados.push({
        aulaId: m.aulaId,
        isPrincipal: mIdx === 0, // first move is always the user's requested move
        componente_sigla: aula.componente_sigla,
        componente_nome: aula.componente_nome,
        turma_nome: aula.turma_nome,
        professor_nome: aula.professor_nome,
        turno_nome: turnoNome,
        tipo: aula.tipo,
        origemDia: aula.dia_semana,
        origemSlot: aula.aula_index,
        destinoDia: m.novoDia,
        destinoSlot: m.novoSlot,
        destinoTurnoId: m.novoTurnoId,
      });
    });

    return {
      id: `opt_${index}`,
      moves: sol.moves,
      impactoTurmas: impactosTurm.size,
      impactoProfessores: impactosProf.size,
      qtdMovimentos: sol.moves.length,
      passos: passosDetalhados,
    };
  });

  return {
    status: 'possibilidades',
    mensagem: `Motor analisou toda a linha cronológica e encontrou ${possibilidadesRender.length} rota(s) sem buracos. Selecione uma opção e clique em Aplicar.`,
    mudancasNecessarias: [],
    possibilidades: possibilidadesRender,
  };
}

// ============================================
// Troca de duas aulas
// ============================================

export type LadoDaTroca = {
  aulaId: string;
  origem: Endereco;
  destino: Endereco;
  /** Descrição curta da aula, para a tela montar a frase sem procurar de novo. */
  rotulo: string;
  impedimento: ImpedimentoRefino | null;
  /** Explicação em português quando `impedimento` não é nulo. */
  texto: string | null;
};

export type ResultadoTroca = {
  status: 'ok' | 'bloqueado';
  mensagem: string;
  /** Sempre os dois lados, mesmo bloqueado: a tela precisa dizer qual pé travou. */
  lados: [LadoDaTroca, LadoDaTroca];
  /** Vazio quando bloqueado; exatamente dois quando ok. */
  moves: Move[];
  /** Restrições MOLES atropeladas (planejamento, personalizado). Não bloqueiam. */
  avisos: string[];
};

function rotuloDaAula(ctx: ContextoRefino, a: AulaRefino): string {
  const turno = ctx.turnosById.get(a.turno_id)?.nome;
  return `${a.componente_sigla || a.componente_nome} · ${a.turma_nome} · ${a.professor_nome}${turno ? ` · ${turno}` : ''}`;
}

/**
 * Trocar duas aulas de lugar.
 *
 * É função à parte, e não um modo de `analisarMovimento`, porque o problema é
 * outro: lá a busca existe para não deixar buraco na origem, e o sucesso é
 * "nenhuma aula flutuando"; aqui as duas pontas se preenchem mutuamente, não há
 * o que buscar, e a resposta útil não é "achei N rotas" e sim **qual dos dois
 * pés travou e por quê**. O precedente é `liberarProfessor` em
 * `preencher-vagas.ts`, que pela mesma razão fez a transposição por fora da
 * busca principal.
 *
 * O que a troca tem e o movimento não é o `ignorar`: cada aula deixa de contar
 * como ocupante da outra, porque as duas se movem no mesmo instante. É isso que
 * viabiliza os dois casos de uso, sem regra especial para nenhum:
 *
 * - duas aulas da MESMA turma trocando de horário — o que precisa valer é cada
 *   professor estar livre no horário novo;
 * - duas aulas do MESMO professor em turmas (e turnos) diferentes — o que
 *   precisa valer é cada turma estar livre no horário novo. Mover uma delas
 *   sozinha sempre reprovaria, porque quem ocupa o professor no destino é
 *   justamente a outra.
 */
export function analisarTroca(ctx: ContextoRefino, aulaAId: string, aulaBId: string): ResultadoTroca {
  const A = acharAula(ctx, aulaAId);
  const B = acharAula(ctx, aulaBId);

  const vazio = (msg: string): ResultadoTroca => ({
    status: 'bloqueado',
    mensagem: msg,
    lados: [
      { aulaId: aulaAId, origem: { dia: '', slot: -1, turnoId: '' }, destino: { dia: '', slot: -1, turnoId: '' }, rotulo: '', impedimento: null, texto: null },
      { aulaId: aulaBId, origem: { dia: '', slot: -1, turnoId: '' }, destino: { dia: '', slot: -1, turnoId: '' }, rotulo: '', impedimento: null, texto: null },
    ],
    moves: [],
    avisos: [],
  });

  if (!A || !B) return vazio('Uma das aulas da troca não foi encontrada na grade carregada.');
  if (A.id === B.id) return vazio('Selecione duas aulas diferentes para trocar.');

  const posA = enderecoDe(A);
  const posB = enderecoDe(B);

  const mesmoEndereco = posA.dia === posB.dia && posA.slot === posB.slot && posA.turnoId === posB.turnoId;
  if (mesmoEndereco) return vazio('As duas aulas ocupam o mesmo horário; não há o que trocar.');

  // Onde cada uma vai parar. O resto da grade não se mexe.
  const destinos = new Map<string, Endereco>([[A.id, posB], [B.id, posA]]);
  const posicaoDe = (a: AulaRefino): Endereco => destinos.get(a.id) ?? enderecoDe(a);
  const ignorar: ReadonlySet<string> = new Set([A.id, B.id]);

  const bloqA = motivoNaoAceita(ctx, A, posB, posicaoDe, ignorar);
  const bloqB = motivoNaoAceita(ctx, B, posA, posicaoDe, ignorar);

  /**
   * As duas contra elas mesmas.
   *
   * `ignorar` tira uma do caminho da outra — o que é correto para o resto da
   * grade e cego para o par: se as duas dividem turma ou professor e os dois
   * endereços se sobrepõem no relógio (turnos diferentes que correm juntos), a
   * troca devolveria "ok" para uma grade que continua com a pessoa em dois
   * lugares. Isso já era verdade antes da troca, e é por isso que a resposta é
   * recusar em vez de gravar.
   */
  let bloqPar: Bloqueio | null = null;
  const mesmaTurma = A.turma_id === B.turma_id;
  const chaveA = chaveProfessor(A.professor_id, A.professor_cpf);
  const mesmoProf = !!chaveA && chaveA === chaveProfessor(B.professor_id, B.professor_cpf);

  if (posA.dia === posB.dia && (mesmaTurma || mesmoProf)) {
    const [iA, fA] = getSlotMinutes(ctx.turnosById.get(posA.turnoId), posA.slot);
    const [iB, fB] = getSlotMinutes(ctx.turnosById.get(posB.turnoId), posB.slot);
    if (minutesConflitam(iA, fA, iB, fB, posA.turnoId === posB.turnoId, posA.slot, posB.slot)) {
      const compartilham =
        !!A.aula_compartilhada_id && A.aula_compartilhada_id === B.aula_compartilhada_id;
      if (!compartilham) {
        bloqPar = { motivo: mesmaTurma ? 'turma_ocupada' : 'professor_ocupado', culpado: B };
      }
    }
  }

  const ladoA: LadoDaTroca = {
    aulaId: A.id, origem: posA, destino: posB, rotulo: rotuloDaAula(ctx, A),
    impedimento: (bloqA ?? bloqPar)?.motivo ?? null,
    texto: (bloqA ?? bloqPar) ? descreverBloqueio(ctx, A, (bloqA ?? bloqPar)!) : null,
  };
  const ladoB: LadoDaTroca = {
    aulaId: B.id, origem: posB, destino: posA, rotulo: rotuloDaAula(ctx, B),
    impedimento: bloqB?.motivo ?? null,
    texto: bloqB ? descreverBloqueio(ctx, B, bloqB) : null,
  };

  if (bloqA || bloqB || bloqPar) {
    const travas = [ladoA.texto, ladoB.texto].filter(Boolean) as string[];
    return {
      status: 'bloqueado',
      mensagem: travas.join(' '),
      lados: [ladoA, ladoB],
      moves: [],
      avisos: [],
    };
  }

  // Restrições moles: não impedem, mas o coordenador precisa saber que gastou.
  const avisos: string[] = [];
  for (const [aula, destino] of [[A, posB], [B, posA]] as [AulaRefino, Endereco][]) {
    if (!aula.professor_id || !ctx.professoresById) continue;
    const { mole } = restricaoDoSlot(
      ctx.professoresById.get(aula.professor_id),
      ctx.turnosById.get(destino.turnoId), destino.dia, destino.slot,
    );
    if (mole) avisos.push(`${aula.professor_nome}: o novo horário estava marcado como "${mole}".`);
  }

  return {
    status: 'ok',
    mensagem: 'A troca é válida: as duas aulas cabem no horário uma da outra, sem choque de turma nem de professor.',
    lados: [ladoA, ladoB],
    moves: [
      { aulaId: A.id, novoDia: posB.dia, novoSlot: posB.slot, novoTurnoId: posB.turnoId },
      { aulaId: B.id, novoDia: posA.dia, novoSlot: posA.slot, novoTurnoId: posA.turnoId },
    ],
    avisos,
  };
}
