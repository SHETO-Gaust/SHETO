/**
 * O professor, do ponto de vista de quem move aula.
 *
 * Duas perguntas, e só estas duas: *quem é* este professor (identidade, que é o
 * CPF e não o cadastro) e *ele pode estar aqui* (restrição declarada). Os dois
 * motores de refino — `refino-horario.ts`, que move aulas entre slots, e
 * `refino-professores.ts`, que troca professores dentro das aulas — respondiam
 * a primeira com funções gêmeas de nomes diferentes, e o comentário de uma
 * delas já avisava que era cópia da outra.
 *
 * Módulo folha de propósito: `refino-horario.ts` roda no navegador, e importar
 * o motor de alocação inteiro só para pegar uma função de quatro linhas põe
 * meia biblioteca no bundle.
 */

import type { ProfessorComDados, Turno } from '@/lib/types';
import { motivoImpedimento, ROTULO_IMPEDIMENTO, type MotivoImpedimento } from '@/lib/restricoes-professor';

/**
 * Identidade do professor é o CPF, não o cadastro.
 *
 * Desde que nome e CPF podem repetir na mesma escola, dois cadastros de mesmo
 * CPF são a mesma pessoa física — e uma pessoa não dá duas aulas ao mesmo
 * tempo, tenha um cadastro ou três.
 */
export function chaveProfessor(id: string | null, cpf?: string | null): string | null {
  if (!id) return null;
  const so = (cpf || '').replace(/\D/g, '');
  return so.length >= 11 ? `cpf:${so}` : `id:${id}`;
}

/**
 * Empresta o professor à assinatura que `motivoImpedimento` espera.
 *
 * A função fala a língua do motor (`ProfessorComDados`); ela lê três campos, e
 * são exatamente os três que os módulos de refino carregam. O molde evita
 * duplicar a regra de bloqueio só por causa da forma do objeto.
 */
export function paraCertificado(p: {
  restricoes?: unknown;
  livre_docencia?: { dia: string; periodo: string }[] | null;
  sem_preferencia_livre_docencia?: boolean | null;
}): ProfessorComDados {
  return {
    restricoes: p.restricoes,
    livre_docencia: p.livre_docencia ?? [],
    sem_preferencia_livre_docencia: p.sem_preferencia_livre_docencia,
  } as unknown as ProfessorComDados;
}

/**
 * O professor, com o que o refino precisa saber dele.
 *
 * Não é `ProfessorAlocacao`: aquele carrega habilitações e carga horária, que
 * importam para decidir QUEM dá a aula e não para decidir ONDE ela cabe.
 */
export type ProfessorRefino = {
  id: string;
  nome: string;
  cpf?: string | null;
  /** JSONB de `professores.restricoes`: turno → dia → índice → estado. */
  restricoes: Record<string, Record<string, Record<string, string>>> | null;
  /** Livre docência por período do dia — mora fora de `restricoes`. */
  livre_docencia?: { dia: string; periodo: string }[] | null;
  sem_preferencia_livre_docencia?: boolean | null;
};

/**
 * O que a restrição declarada diz sobre este slot.
 *
 * Duas famílias, e a distinção é decisão de produto, não de implementação:
 *
 * - **dura** (`indisponivel`, `reuniao_fluxo`, `livre_docencia`): o professor
 *   declarou que não está à disposição da unidade naquele horário. Bloqueia.
 * - **mole** (`planejamento`, `personalizado*`): é preferência, e o motor de
 *   geração já a gasta sob relaxamento. Aqui vira aviso — quem está movendo a
 *   aula é um humano olhando a tela, e ele pode ter um bom motivo.
 */
export function restricaoDoSlot(
  prof: ProfessorRefino | undefined,
  turno: Turno | undefined,
  dia: string,
  slot: number,
): { dura: MotivoImpedimento | null; mole: string | null } {
  if (!prof || !turno) return { dura: null, mole: null };

  const dura = motivoImpedimento(paraCertificado(prof), turno, dia, slot);
  if (dura) return { dura, mole: null };

  const estado = prof.restricoes?.[turno.id]?.[dia]?.[String(slot)];
  if (estado === 'planejamento') return { dura: null, mole: 'Planejamento' };
  if (typeof estado === 'string' && estado.startsWith('personalizado')) {
    return { dura: null, mole: 'Marcação personalizada' };
  }
  return { dura: null, mole: null };
}

/** Texto humano de um impedimento duro, para a tela nomear o que barrou. */
export function rotuloImpedimento(motivo: MotivoImpedimento): string {
  return ROTULO_IMPEDIMENTO[motivo];
}
