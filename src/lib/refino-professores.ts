/**
 * Preencher uma aula vaga trocando professores em cadeia.
 *
 * Quando a geração deixa 7 aulas de fora, ficaram 7 aulas de professores sem
 * turma — é a mesma conta vista dos dois lados. Este módulo resolve o outro
 * lado: acha quem PODE dar a aula que ficou vaga, e devolve ao professor que
 * ficou sem carga uma aula equivalente, por uma cadeia de trocas.
 *
 * IRMÃO DO REFINO, NÃO O MESMO. `refino-horario.ts` move aulas entre slots — o
 * movimento dele é `{ aulaId, novoDia, novoSlot }`. Aqui a aula não sai do
 * lugar: quem muda é o professor dentro dela. São dois grafos diferentes sobre
 * a mesma grade, e juntá-los num só produziria uma busca que não sabe explicar
 * o que está fazendo. O que é igual de propósito: os limites da busca, o
 * ranqueamento por número de movimentos e o formato do resultado, para que a
 * tela seja a mesma experiência.
 *
 * A CADEIA, e por que ela é um ciclo. Chame de P o professor que ficou sem a
 * aula e de P' quem vai assumir a vaga. Depois de P' assumir, P continua
 * devendo uma aula e P' passou a ter uma a mais. O equilíbrio só volta se P
 * tomar uma aula de P' — ou tomar de X, e X tomar de P'. Isto é: um caminho de
 * P até P' no grafo "A pode assumir uma aula de B". Fechado o ciclo, cada
 * professor termina com a carga que tinha, e só P termina com a aula que era
 * dele desde o começo.
 */
import { motivoImpedimento } from './geracao/certificado';
import type { ProfessorComDados, Turno } from './types';

/**
 * Empresta o professor à assinatura que `motivoImpedimento` espera.
 *
 * A função é do certificado e fala a língua do motor (`ProfessorComDados`); ela
 * lê três campos, e são exatamente os três que este módulo carrega. O molde
 * evita duplicar a regra de bloqueio só por causa da forma do objeto.
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

export type AulaAlocacao = {
  id: string;
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
  aula_fixa_id?: string | null;
};

export type ProfessorAlocacao = {
  id: string;
  nome: string;
  cpf?: string | null;
  /** `componente_id`s que este professor pode lecionar. */
  componentes: string[];
  /** JSONB de `professores.restricoes`: turno → dia → índice → estado. */
  restricoes: Record<string, Record<string, Record<string, string>>> | null;
  /**
   * Livre docência declarada por período do dia, fora de `restricoes`.
   *
   * Sem estes dois campos a checagem de bloqueio enxerga só metade da agenda: a
   * folga do professor mora aqui e não numa célula, e uma alocação que a ignora
   * marca aula justamente no dia que ele não vem.
   */
  livre_docencia?: { dia: string; periodo: string }[] | null;
  sem_preferencia_livre_docencia?: boolean | null;
  aulas_disponiveis: number;
  aulas_planejamento: number;
};

export type Vaga = {
  turma_id: string;
  turma_nome: string;
  componente_id: string;
  componente_nome: string;
  componente_sigla: string;
  /** Quem o cadastro diz que daria esta aula e não coube. Pode não existir. */
  professor_id: string | null;
  professor_nome: string;
  tipo: 'presencial' | 'nao_presencial';
  turno_id: string;
  dia_semana: string;
  aula_index: number;
  /** Regra do dia daquela turma/disciplina, calculada por quem chama. */
  limiteRun: number;
  tetoDoDia: number;
};

export type PassoAlocacao = {
  /** true = a aula que estava vaga sendo preenchida; false = troca de apoio. */
  isPrincipal: boolean;
  componente_sigla: string;
  componente_nome: string;
  turma_nome: string;
  dia_semana: string;
  aula_index: number;
  turno_nome: string;
  tipo: 'presencial' | 'nao_presencial';
  /** Vazio no passo principal: a aula não tinha professor nenhum. */
  professorDe: string;
  professorPara: string;
};

export type MovimentoAlocacao =
  | {
      tipo: 'criar';
      turma_id: string;
      componente_id: string;
      professor_id: string;
      dia_semana: string;
      aula_index: number;
      tipo_aula: 'presencial' | 'nao_presencial';
      turno_id: string;
    }
  | { tipo: 'reatribuir'; aulaId: string; professor_id: string };

export type OpcaoAlocacao = {
  id: string;
  movimentos: MovimentoAlocacao[];
  passos: PassoAlocacao[];
  qtdMovimentos: number;
  professoresEnvolvidos: number;
  turmasEnvolvidas: number;
};

export type ResultadoAlocacao = {
  status: 'opcoes' | 'bloqueado';
  mensagem: string;
  opcoes: OpcaoAlocacao[];
};

/** Mesmos limites do refino: a tela não pode congelar esperando a busca. */
const MAX_PROFUNDIDADE = 3;
const MAX_TEMPO_MS = 2000;
const MAX_SOLUCOES = 5;

// ─── Tempo e conflito ───────────────────────────────────────────────────────

function timeToMinutes(hhmm: string | undefined | null): number {
  if (!hhmm) return -1;
  const [h, m] = hhmm.split(':');
  const hh = parseInt(h, 10);
  const mm = parseInt(m, 10);
  if (isNaN(hh) || isNaN(mm)) return -1;
  return hh * 60 + mm;
}

function minutosDoSlot(turno: Turno | undefined, idx: number): [number, number] {
  const h = turno?.horarios?.[idx];
  if (!h) return [-1, -1];
  return [timeToMinutes(h.inicio), timeToMinutes(h.fim)];
}

function sobrepoe(a1: number, a2: number, b1: number, b2: number): boolean {
  if (a1 < 0 || a2 < 0 || b1 < 0 || b2 < 0) return false;
  return a1 < b2 && b1 < a2;
}

/**
 * Identidade do professor é o CPF, não o cadastro.
 *
 * Desde que nome e CPF podem repetir na mesma escola, dois cadastros de mesmo
 * CPF são a mesma pessoa física — e uma pessoa não dá duas aulas ao mesmo
 * tempo, tenha um cadastro ou três. Mesma regra de `refino-horario.ts`.
 */
export function chaveProfessor(id: string | null, cpf?: string | null): string | null {
  if (!id) return null;
  const so = (cpf || '').replace(/\D/g, '');
  return so.length >= 11 ? `cpf:${so}` : `id:${id}`;
}

// ─── Motor ──────────────────────────────────────────────────────────────────

export function calcularAlocacaoComTrocas(
  aulas: AulaAlocacao[],
  professores: ProfessorAlocacao[],
  turnosById: Map<string, Turno>,
  vaga: Vaga,
): ResultadoAlocacao {
  const inicioMs = Date.now();
  const profPorId = new Map(professores.map(p => [p.id, p]));

  /**
   * Quem está lecionando cada aula NESTE momento da simulação.
   *
   * A busca não altera `aulas`: ela mantém um mapa de sobreposições. Sem isso
   * seria preciso clonar a grade inteira a cada ramo, e a grade de uma escola
   * integral tem 400 linhas.
   */
  type Estado = {
    /** `aulaId` → `professor_id` que a assumiu. */
    trocas: Map<string, string>;
    /** Professor que assumiu a vaga, quando já decidido. */
    professorDaVaga: string | null;
  };

  const professorDaAula = (a: AulaAlocacao, estado: Estado): string | null =>
    estado.trocas.get(a.id) ?? a.professor_id;

  /**
   * O slot está vedado a este professor?
   *
   * Delega para `motivoImpedimento`, a mesma função que o certificado de
   * inviabilidade usa. A versão anterior daqui lia só duas marcas na célula e
   * deixava passar `reuniao_fluxo` e — pior — a livre docência declarada por
   * período, que não fica em célula nenhuma: era possível alocar o professor
   * exatamente no dia de folga dele.
   */
  const bloqueadoPorRestricao = (p: ProfessorAlocacao, turnoId: string, dia: string, idx: number): boolean => {
    const turno = turnosById.get(turnoId);
    if (!turno) return false;
    return motivoImpedimento(paraCertificado(p), turno, dia, idx) !== null;
  };

  /**
   * O professor está livre naquele horário, na grade simulada?
   *
   * Compara por minutos reais, não por índice de aula: turnos de escolas
   * diferentes não começam na mesma hora, e a 1ª aula de um pode cair dentro
   * da 3ª de outro. Comparar índice deixaria passar choque de verdade.
   */
  const estaLivre = (
    p: ProfessorAlocacao, dia: string, turnoId: string, idx: number,
    estado: Estado, ignorarAulaId?: string,
  ): boolean => {
    const chave = chaveProfessor(p.id, p.cpf);
    if (!chave) return false;
    const [ini, fim] = minutosDoSlot(turnosById.get(turnoId), idx);

    if (estado.professorDaVaga === p.id && !(vaga.dia_semana === dia && vaga.aula_index === idx && vaga.turno_id === turnoId)) {
      const [iv, fv] = minutosDoSlot(turnosById.get(vaga.turno_id), vaga.aula_index);
      if (vaga.dia_semana === dia && sobrepoe(ini, fim, iv, fv)) return false;
    }

    for (const outra of aulas) {
      if (outra.id === ignorarAulaId) continue;
      if (outra.dia_semana !== dia) continue;
      const donoId = professorDaAula(outra, estado);
      if (!donoId) continue;
      const donoCpf = donoId === outra.professor_id ? outra.professor_cpf : profPorId.get(donoId)?.cpf;
      if (chaveProfessor(donoId, donoCpf) !== chave) continue;
      const [i2, f2] = minutosDoSlot(turnosById.get(outra.turno_id), outra.aula_index);
      if (sobrepoe(ini, fim, i2, f2)) return false;
    }
    return true;
  };

  /** A turma já tem alguma aula naquele horário? A vaga precisa estar mesmo vaga. */
  const turmaOcupada = (turmaId: string, dia: string, turnoId: string, idx: number): boolean => {
    const [ini, fim] = minutosDoSlot(turnosById.get(turnoId), idx);
    return aulas.some(a => {
      if (a.turma_id !== turmaId || a.dia_semana !== dia) return false;
      const [i2, f2] = minutosDoSlot(turnosById.get(a.turno_id), a.aula_index);
      return sobrepoe(ini, fim, i2, f2);
    });
  };

  /**
   * A regra do dia, para a aula que vai NASCER.
   *
   * De nada adianta preencher a vaga criando exatamente o amontoado que o motor
   * de geração recusa: a mesma disciplina emendada, ou dois grupos dela colados
   * no dia. A regra é reimplementada aqui e não importada de `timetabling.ts`
   * porque este módulo roda na fronteira do servidor e não deve arrastar o motor
   * inteiro junto — mas ela é a mesma decisão, e o cenário 6 de
   * `verificar-geminacao.js` é quem garante que a original não mude sozinha.
   */
  const regraDoDiaAceita = (): boolean => {
    const indices = aulas
      .filter(a =>
        a.turma_id === vaga.turma_id &&
        a.componente_id === vaga.componente_id &&
        a.tipo === vaga.tipo &&
        a.turno_id === vaga.turno_id &&
        a.dia_semana === vaga.dia_semana)
      .map(a => a.aula_index);
    indices.push(vaga.aula_index);

    const ord = [...new Set(indices)].sort((a, b) => a - b);
    if (ord.length > vaga.tetoDoDia) return false;

    const corridas: { ini: number; fim: number; tam: number }[] = [];
    let i = 0;
    while (i < ord.length) {
      let fim = i;
      while (fim + 1 < ord.length && ord[fim + 1] === ord[fim] + 1) fim++;
      corridas.push({ ini: ord[i], fim: ord[fim], tam: fim - i + 1 });
      i = fim + 1;
    }
    if (corridas.some(c => c.tam > vaga.limiteRun)) return false;
    for (let k = 1; k < corridas.length; k++) {
      const vao = corridas[k].ini - corridas[k - 1].fim - 1;
      const minimo = corridas[k - 1].tam >= 2 || corridas[k].tam >= 2 ? 2 : 1;
      if (vao < minimo) return false;
    }
    return true;
  };

  // ── Recusas que não dependem de busca ────────────────────────────────────
  if (turmaOcupada(vaga.turma_id, vaga.dia_semana, vaga.turno_id, vaga.aula_index)) {
    return {
      status: 'bloqueado',
      opcoes: [],
      mensagem: 'Este horário da turma não está mais vago — a grade mudou desde que a tela foi carregada. Recarregue e tente de novo.',
    };
  }
  if (!regraDoDiaAceita()) {
    return {
      status: 'bloqueado',
      opcoes: [],
      mensagem:
        `Colocar ${vaga.componente_sigla || vaga.componente_nome} neste horário deixaria a turma com aulas ` +
        'demais da mesma disciplina no dia, ou com elas emendadas. Escolha outro horário vago desta turma.',
    };
  }

  const devedor = vaga.professor_id ? profPorId.get(vaga.professor_id) ?? null : null;

  /** Carga já atribuída a cada professor na grade de hoje. */
  const cargaAtual = new Map<string, number>();
  for (const a of aulas) {
    if (!a.professor_id) continue;
    cargaAtual.set(a.professor_id, (cargaAtual.get(a.professor_id) ?? 0) + 1);
  }
  const temFolga = (p: ProfessorAlocacao): boolean =>
    (cargaAtual.get(p.id) ?? 0) < Math.max(0, p.aulas_disponiveis - p.aulas_planejamento);

  const habilitado = (p: ProfessorAlocacao, componenteId: string) => p.componentes.includes(componenteId);

  const estadoBase: Estado = { trocas: new Map(), professorDaVaga: null };

  /** Quem pode assumir a vaga: habilitado, livre no horário e sem bloqueio. */
  const candidatos = professores.filter(p =>
    habilitado(p, vaga.componente_id) &&
    !bloqueadoPorRestricao(p, vaga.turno_id, vaga.dia_semana, vaga.aula_index) &&
    estaLivre(p, vaga.dia_semana, vaga.turno_id, vaga.aula_index, estadoBase));

  if (candidatos.length === 0) {
    return {
      status: 'bloqueado',
      opcoes: [],
      mensagem:
        `Nenhum professor habilitado em ${vaga.componente_nome} está livre neste horário. ` +
        'Sem alguém para dar a aula não há troca possível — este é um problema de cadastro, não de arrumação.',
    };
  }

  const solucoes: MovimentoAlocacao[][] = [];

  const movimentoCriar = (professorId: string): MovimentoAlocacao => ({
    tipo: 'criar',
    turma_id: vaga.turma_id,
    componente_id: vaga.componente_id,
    professor_id: professorId,
    dia_semana: vaga.dia_semana,
    aula_index: vaga.aula_index,
    tipo_aula: vaga.tipo,
    turno_id: vaga.turno_id,
  });

  /**
   * Caminho de `de` até `alvo` no grafo "A assume uma aula de B".
   *
   * Cada aresta consome uma aula concreta, então o caminho já é a lista de
   * reatribuições. Profundidade limitada porque cada passo é um professor a
   * mais mexido, e cadeia longa demais ninguém confere na tela.
   */
  const buscarCaminho = (
    deId: string, alvoId: string, estado: Estado, visitados: Set<string>, passos: MovimentoAlocacao[],
  ) => {
    if (Date.now() - inicioMs > MAX_TEMPO_MS) return;
    if (solucoes.length >= MAX_SOLUCOES) return;
    if (passos.length >= MAX_PROFUNDIDADE) return;

    const de = profPorId.get(deId);
    if (!de) return;

    for (const aula of aulas) {
      if (aula.aula_fixa_id) continue;
      const dono = professorDaAula(aula, estado);
      if (!dono || dono === deId) continue;
      if (!habilitado(de, aula.componente_id)) continue;
      if (bloqueadoPorRestricao(de, aula.turno_id, aula.dia_semana, aula.aula_index)) continue;
      if (!estaLivre(de, aula.dia_semana, aula.turno_id, aula.aula_index, estado, aula.id)) continue;

      const novoEstado: Estado = {
        trocas: new Map(estado.trocas),
        professorDaVaga: estado.professorDaVaga,
      };
      novoEstado.trocas.set(aula.id, deId);
      const novosPassos = [...passos, { tipo: 'reatribuir' as const, aulaId: aula.id, professor_id: deId }];

      if (dono === alvoId) {
        solucoes.push([movimentoCriar(alvoId), ...novosPassos]);
        if (solucoes.length >= MAX_SOLUCOES) return;
        continue;
      }

      if (visitados.has(dono)) continue;
      visitados.add(dono);
      buscarCaminho(dono, alvoId, novoEstado, visitados, novosPassos);
      visitados.delete(dono);
    }
  };

  for (const cand of candidatos) {
    if (solucoes.length >= MAX_SOLUCOES) break;
    if (Date.now() - inicioMs > MAX_TEMPO_MS) break;

    // O melhor desfecho: quem devia dar a aula pode dar. Zero trocas.
    if (devedor && cand.id === devedor.id) {
      solucoes.unshift([movimentoCriar(cand.id)]);
      continue;
    }

    // Sem professor devedor (aula sem professor no cadastro) não há dívida a
    // devolver: basta alguém habilitado assumir.
    if (!devedor) {
      if (temFolga(cand)) solucoes.push([movimentoCriar(cand.id)]);
      continue;
    }

    const estado: Estado = { trocas: new Map(), professorDaVaga: cand.id };
    buscarCaminho(devedor.id, cand.id, estado, new Set([devedor.id]), []);
  }

  if (solucoes.length === 0) {
    return {
      status: 'bloqueado',
      opcoes: [],
      mensagem:
        'Há professor livre para dar esta aula, mas não foi encontrada uma cadeia que devolva a carga a ' +
        `${vaga.professor_nome} sem criar outro conflito. Tente outro horário vago desta turma.`,
    };
  }

  const aulaPorId = new Map(aulas.map(a => [a.id, a]));
  const nomeDe = (id: string) => profPorId.get(id)?.nome ?? '—';

  // Menos movimentos primeiro: cada movimento é um professor a mais mexido, e
  // é isso que a escola sente.
  const ordenadas = solucoes
    .sort((a, b) => a.length - b.length)
    .slice(0, MAX_SOLUCOES);

  const opcoes: OpcaoAlocacao[] = ordenadas.map((movs, idx) => {
    const passos: PassoAlocacao[] = [];
    const profs = new Set<string>();
    const turmas = new Set<string>();

    for (const m of movs) {
      if (m.tipo === 'criar') {
        profs.add(m.professor_id);
        turmas.add(vaga.turma_nome);
        passos.push({
          isPrincipal: true,
          componente_sigla: vaga.componente_sigla,
          componente_nome: vaga.componente_nome,
          turma_nome: vaga.turma_nome,
          dia_semana: vaga.dia_semana,
          aula_index: vaga.aula_index,
          turno_nome: turnosById.get(vaga.turno_id)?.nome ?? '',
          tipo: vaga.tipo,
          professorDe: '',
          professorPara: nomeDe(m.professor_id),
        });
      } else {
        const aula = aulaPorId.get(m.aulaId);
        if (!aula) continue;
        profs.add(m.professor_id);
        if (aula.professor_id) profs.add(aula.professor_id);
        turmas.add(aula.turma_nome);
        passos.push({
          isPrincipal: false,
          componente_sigla: aula.componente_sigla,
          componente_nome: aula.componente_nome,
          turma_nome: aula.turma_nome,
          dia_semana: aula.dia_semana,
          aula_index: aula.aula_index,
          turno_nome: turnosById.get(aula.turno_id)?.nome ?? '',
          tipo: aula.tipo,
          professorDe: aula.professor_nome,
          professorPara: nomeDe(m.professor_id),
        });
      }
    }

    return {
      id: `aloc_${idx}`,
      movimentos: movs,
      passos,
      qtdMovimentos: movs.length,
      professoresEnvolvidos: profs.size,
      turmasEnvolvidas: turmas.size,
    };
  });

  return {
    status: 'opcoes',
    mensagem:
      `${opcoes.length} rota(s) encontrada(s) para preencher esta aula sem criar conflito. ` +
      'Escolha uma e confirme.',
    opcoes,
  };
}
