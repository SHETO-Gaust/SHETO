
import {
  type Turno,
  type TurmaComDados,
  type ProfessorComDados,
  type HorarioAulaGerada,
  type ConfiguracaoGerminacao,
  type LivreDocenciaPeriodo,
  type DiagnosticoFalha,
  type PendenciaDetalhada,
  type TurmaAulaFixa
} from './types';

export type SugestaoRealocacao = {
  horario_id: string;
  aula_id: string;
  professor_nome: string;
  turma_nome: string;
  disciplina_nome: string;
  dia_antigo: string;
  aula_idx_antigo: number;
  dia_novo: string;
  aula_idx_novo: number;
};

type HorarioAulaGeradaAlgoritmo = Omit<HorarioAulaGerada, 'id' | 'horario_id'> & {
  turno_id: string;
  /** Aponta para o travamento (`turmas_aulas_fixas`) que originou esta aula. */
  aula_fixa_id?: string | null;
  /**
   * Espelham colunas de `horario_aulas` que só existem para as grades geradas
   * antes da migração 20260812, quando havia "aula coletiva". O motor sempre
   * grava `false`/`null` — o refino continua lendo os grupos históricos.
   */
  compartilhada?: boolean;
  aula_compartilhada_id?: string | null;
};

/** Slot já ocupado por um professor — armazena minutos reais para evitar re-lookup de turno */
type SlotOcupado = {
  turno_id: string;
  aula_index: number;
  inicio_min: number; // minutos desde meia-noite
  fim_min: number;
};

type BlocoGeracao = {
  tipo: 'presencial' | 'nao_presencial';
  turma_id: string;
  turma_nome: string;
  componente_id: string;
  componente_nome: string;
  /** Só para casar com os padrões agregados da rede, que são por sigla. */
  componente_sigla?: string;
  professor_id: string | null;
  professor_key: string | null;
  professor_nome: string;
  size: number;
  /**
   * Domínio do bloco: quantas posições (dia, slot) são viáveis olhando apenas as
   * restrições fixas. Quanto menor, mais apertado — e mais cedo ele deve entrar.
   */
  workload: number;
  priority: number;
  serie_restricoes?: Record<string, Record<number, string>>;
  turno_np_id?: string | null; // turno NP pré-determinado para este bloco
  placed?: boolean;
};

type OcupacaoExistenteNormalizada = {
  professor_key: string;
  dia_semana: string;
  aula_index: number;
  turno_id: string;
  inicio_min: number;
  fim_min: number;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function getTeacherKey(p: { id: string; cpf?: string | null }): string {
  if (p.cpf && p.cpf.trim().length >= 11) {
    return `cpf:${p.cpf.replace(/\D/g, '')}`;
  }
  return `id:${p.id}`;
}

/** Converte "HH:mm" → minutos desde meia-noite. Retorna -1 se inválido. */
function timeToMinutes(hhmm: string | undefined | null): number {
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
function getSlotMinutes(turno: Turno | undefined, aulaIdx: number): [number, number] {
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
function minutesConflitam(
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

function getPeriodoDaAula(turno: Turno, aulaIdx: number): LivreDocenciaPeriodo {
  const nome = turno.nome.toLowerCase();
  if (nome.includes('matutino') || nome.includes('manhã')) return 'matutino';
  if (nome.includes('vespertino') || nome.includes('tarde')) return 'vespertino';
  if (nome.includes('noturno') || nome.includes('noite')) return 'noturno';

  const h = turno.horarios?.[aulaIdx];
  if (h?.inicio) {
    const hora = parseInt(h.inicio.split(':')[0], 10);
    if (hora < 13) return 'matutino';
    if (hora < 18) return 'vespertino';
    return 'noturno';
  }
  return aulaIdx < 5 ? 'matutino' : 'vespertino';
}

function pushMapArray<T>(map: Map<string, T[]>, key: string, value: T) {
  if (!map.has(key)) map.set(key, []);
  map.get(key)!.push(value);
}

function criarBlocos(
  total: number,
  compId: string,
  configGerminacao: ConfiguracaoGerminacao[],
  forcarIndividuais: boolean = false
): number[] {
  if (total <= 0) return [];
  if (forcarIndividuais) return Array(total).fill(1);

  const config = configGerminacao.find(cfg => cfg.componente_id === compId);
  if (!config || !config.geminar || config.tamanho_bloco <= 1) {
    return Array(total).fill(1);
  }

  const blocos: number[] = [];
  let restante = total;
  while (restante > 0) {
    if (restante >= config.tamanho_bloco) {
      blocos.push(config.tamanho_bloco);
      restante -= config.tamanho_bloco;
    } else {
      blocos.push(restante);
      restante = 0;
    }
  }
  return blocos;
}

/**
 * Determina o turno NP para cada turma:
 * - prefere o turno oposto (pelo nome: matutino↔vespertino, etc.)
 * - se não encontrar, usa qualquer turno diferente do turno principal
 * - se não houver nenhum, volta para o próprio turno (edge case)
 */
function resolverTurnoNP(turno: Turno, todosTurnos: Turno[]): Turno {
  const nome = turno.nome.toLowerCase();
  const outros = todosTurnos.filter(t => t.id !== turno.id);

  const oposto = outros.find(t => {
    const n = t.nome.toLowerCase();
    if (nome.includes('matutino') || nome.includes('manhã'))
      return n.includes('vespertino') || n.includes('tarde');
    if (nome.includes('vespertino') || nome.includes('tarde'))
      return n.includes('matutino') || n.includes('manhã');
    if (nome.includes('noturno') || nome.includes('noite'))
      return n.includes('matutino') || n.includes('manhã') || n.includes('vespertino');
    return false;
  });

  return oposto || outros[0] || turno;
}

// ─── PRNG por tentativa ──────────────────────────────────────────────────────

function makeRng(seed: number): () => number {
  let s = (seed ^ 0xDEADBEEF) >>> 0;
  if (s === 0) s = 1; // xorshift não pode partir do zero
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 0xFFFFFFFF;
  };
}

// ─── Helpers de constraint por slot ─────────────────────────────────────────

/**
 * HARD CONSTRAINT — BAN (indisponivel)
 * Retorna true se o professor está marcado como "indisponivel" naquele slot.
 * Jamais pode ser violado. Não afetado por nenhum relaxamento progressivo.
 */
function isBanHardBlocked(
  prof: ProfessorComDados | undefined,
  turnoId: string,
  dia: string,
  idx: number,
): boolean {
  const status = prof?.restricoes?.[turnoId]?.[dia]?.[idx];
  return status === 'indisponivel';
}

/**
 * HARD CONSTRAINT — FOLGA (livre docência)
 * Retorna true se o período daquele slot está marcado como livre docência
 * para o professor. Jamais pode ser violado. Não afetado por nenhum
 * relaxamento progressivo.
 *
 * Condição ativa somente quando sem_preferencia_livre_docencia === false,
 * o que indica que o professor TEM preferência de livre docência definida.
 */
function isFolgaHardBlocked(
  prof: ProfessorComDados | undefined,
  turno: Turno,
  dia: string,
  idx: number,
): boolean {
  // Se o professor marcou "sem preferência" (checkbox de dispensa), não bloquear
  if (!prof || prof.sem_preferencia_livre_docencia !== false) return false;
  // Modo personalizado: célula individual marcada como livre_docencia
  if (prof?.restricoes?.[turno.id]?.[dia]?.[idx] === 'livre_docencia') return true;
  // Modo padrão: período inteiro bloqueado
  const periodo = getPeriodoDaAula(turno, idx);
  return prof.livre_docencia?.some(ld => ld.dia === dia && ld.periodo === periodo) ?? false;
}

/**
 * HARD CONSTRAINT — REUNIÃO DE FLUXO (reuniao_fluxo)
 * Retorna true se o slot está marcado como reunião de fluxo.
 * Tratado como indisponível: jamais pode receber aula.
 * Não afetado por nenhum relaxamento progressivo.
 */
function isReuniaoFluxoHardBlocked(
  prof: ProfessorComDados | undefined,
  turnoId: string,
  dia: string,
  idx: number,
): boolean {
  return prof?.restricoes?.[turnoId]?.[dia]?.[idx] === 'reuniao_fluxo';
}

/**
 * SOFT CONSTRAINT — PLANEJAMENTO (plan)
 * Retorna true se o slot está marcado como "planejamento".
 * Pode ser usado como último recurso quando permitirUsoPlanejamento = true.
 */
function isPlanejamentoSoftBlocked(
  prof: ProfessorComDados | undefined,
  turnoId: string,
  dia: string,
  idx: number,
): boolean {
  return prof?.restricoes?.[turnoId]?.[dia]?.[idx] === 'planejamento';
}

/**
 * SOFT CONSTRAINT — PERSONALIZADO
 * Retorna true se o slot está marcado com valor "personalizado*".
 * Pode ser usado como último recurso quando permitirUsoPersonalizado = true (após 15% das tentativas).
 */
function isPersonalizadoSoftBlocked(
  prof: ProfessorComDados | undefined,
  turnoId: string,
  dia: string,
  idx: number,
): boolean {
  const status = prof?.restricoes?.[turnoId]?.[dia]?.[idx];
  return typeof status === 'string' && status.startsWith('personalizado');
}


/**
 * Ordena os dias com preferência progressiva:
 * - no início da busca, favorece dias preferidos
 * - no meio, reduz esse peso
 * - no fim, quase neutraliza a preferência
 * - quando ignorarDiasPreferidos=true, volta para aleatório puro
 *
 * Também considera levemente a carga já existente do professor no dia,
 * mas sempre com ruído aleatório para evitar repetição determinística
 * de tentativas ruins.
 */
function ordenarDiasComPreferenciaProgressiva(
  diasDisponiveis: string[],
  prof: ProfessorComDados | undefined,
  profKey: string | null | undefined,
  ocupacaoProfessoresPorDia: Map<string, SlotOcupado[]>,
  ocupacoesExistentesPorProfessorDia: Map<string, SlotOcupado[]>,
  ignorarDiasPreferidos: boolean,
  curProgLocal: number,
  // Quando true, não penaliza dias onde o professor já tem aulas:
  // isso permite que o mesmo prof ministre disciplinas diferentes na mesma turma/dia.
  ignorarCargaProfessorNoDia: boolean = false,
  rng: () => number = Math.random,
): string[] {
  const dias = [...diasDisponiveis];

  if (ignorarDiasPreferidos || !prof) {
    return dias.sort(() => rng() - 0.5);
  }

  const preferidos = new Set(prof.dias_preferidos || []);

  const getDiaLoad = (dia: string): number => {
    if (!profKey || ignorarCargaProfessorNoDia) return 0; // flag ativa: ignora carga
    const local = (ocupacaoProfessoresPorDia.get(`${profKey}|${dia}`) || []).length;
    const global = (ocupacoesExistentesPorProfessorDia.get(`${profKey}|${dia}`) || []).length;
    return local + global;
  };

  const intensidadePreferencia = Math.max(0.15, 1 - curProgLocal);

  return dias
    .map((dia) => {
      const ehPreferido = preferidos.has(dia) ? 1 : 0;
      const carga = getDiaLoad(dia);
      const score =
        (ehPreferido * 10 * intensidadePreferencia) +
        (carga * 0.8) +
        (rng() * 4);
      return { dia, score };
    })
    .sort((a, b) => b.score - a.score)
    .map(x => x.dia);
}

// ─── Motor principal ─────────────────────────────────────────────────────────

export function gerarHorarioAlgoritmico(
  turno: Turno,
  turmas: TurmaComDados[],
  professores: ProfessorComDados[],
  todosTurnos: Turno[],
  configGerminacao: ConfiguracaoGerminacao[] = [],
  force: boolean = false,
  ocupacoesExistentes: any[] = [],
  /** Quantas tentativas executar nesta chamada (o "pedaço" despachado a esta thread). */
  chunk: number = 100000,
  /**
   * Índice GLOBAL da primeira tentativa deste pedaço dentro do orçamento total.
   *
   * Substituiu o antigo `globalProgress` (uma fração 0–1) porque com o orçamento
   * repartido entre várias threads o motor precisa saber sua posição absoluta:
   * é dela que saem a semente (única em toda a geração) e a fase de relaxamento.
   */
  offsetTentativa: number = 0,
  aulasFixas: TurmaAulaFixa[] = [],
  permitirMesmoProfDisciplinasMesmoDia: boolean = false,
  /** Orçamento total da geração, sobre o qual a rampa de relaxamento é medida. */
  totalTentativas: number = 100000,
  /**
   * O diagnóstico custa uma análise por bloco pendente. Ele só interessa quando
   * a geração vai desistir — calculá-lo em todo pedaço (era o que acontecia) é
   * trabalho jogado fora centenas de vezes.
   */
  computarDiagnostico: boolean = true,
  /**
   * Grade herdada — a melhor solução conhecida até agora, vinda de outra thread
   * ou de uma rodada anterior. Quando presente, a busca parte dela em vez do
   * zero: é a diferença entre quarenta mil recomeços e quarenta mil melhorias.
   */
  gradeHerdada?: HorarioAulaGeradaAlgoritmo[] | null,
  /** Pesos acumulados por outras threads/rodadas. Ver `pesos` adiante. */
  pesosIniciais?: Record<string, number> | null,
  /**
   * Quantos blocos faltavam em `gradeHerdada`. Sem este número a grade herdada
   * entraria com custo desconhecido e a primeira tentativa do pedaço a
   * substituiria mesmo sendo pior — jogando fora o que veio da memória ou de
   * outra thread.
   */
  pendentesHerdados: number = Number.POSITIVE_INFINITY,
  /**
   * Distribuição histórica agregada da rede: para cada `comp=SIGLA|dia=X|aula=N`,
   * a fatia das aulas daquele componente que costuma cair ali, entre 0 e 1.
   *
   * Entra só como desempate na escolha do slot, depois de todas as restrições —
   * nunca bloqueia nem força nada. Vazio quando desligado por
   * `SHETO_USAR_PADROES_GLOBAIS=0`, e aí a escolha volta a ser sorteio puro.
   */
  padroes: Record<string, number> = {},
): {
  success: boolean;
  aulas: HorarioAulaGeradaAlgoritmo[];
  error?: string;
  attemptsMade: number;
  /** Menor número de blocos não alocados visto neste pedaço. Alimenta a parada por estagnação. */
  melhorPendentes: number;
  /** Índice global da tentativa que produziu `aulas`, só para o log. */
  melhorIndice: number;
  /** Pesos ao fim do pedaço, para o orquestrador somar e redistribuir. */
  pesos: Record<string, number>;
  diagnostico?: DiagnosticoFalha;
} {
  const turnosById = new Map<string, Turno>(todosTurnos.map(t => [t.id, t]));
  const professoresById = new Map<string, ProfessorComDados>(professores.map(p => [p.id, p]));
  const turmasById = new Map<string, TurmaComDados>(turmas.map(t => [t.id, t]));

  const teacherKeyMap = new Map<string, string>();
  professores.forEach(p => teacherKeyMap.set(p.id, getTeacherKey(p)));

  // Turno NP global (único, determinístico) para este horário
  const turnoNP = resolverTurnoNP(turno, todosTurnos);

  // ── Normalizar ocupações externas (publicadas) com minutos reais ──
  const ocupacoesExistentesPorProfessorDia = new Map<string, OcupacaoExistenteNormalizada[]>();

  for (const o of ocupacoesExistentes) {
    const pKey = getTeacherKey({ id: o.professor_id, cpf: o.professor?.cpf });

    // ATENÇÃO: para aulas NP do contraturno, `o.turno_id` é o turno FÍSICO (ex: Vespertino)
    // enquanto `o.horario.turno_id` é o turno do HORÁRIO (ex: Matutino).
    // Devemos usar o turno FÍSICO para calcular os minutos reais.
    const fisicaTurnoId = o.turno_id || o.horario?.turno_id;
    const turnoOcc = turnosById.get(fisicaTurnoId);
    const [ini, fim] = turnoOcc ? getSlotMinutes(turnoOcc, o.aula_index) : [-1, -1];

    const mapKey = `${pKey}|${o.dia_semana}`;
    pushMapArray(ocupacoesExistentesPorProfessorDia, mapKey, {
      professor_key: pKey,
      dia_semana: o.dia_semana,
      aula_index: o.aula_index,
      turno_id: fisicaTurnoId,
      inicio_min: ini,
      fim_min: fim,
    });
  }

  // ── Aprendizado da busca ─────────────────────────────────────────────────

  /** Identidade de um bloco entre tentativas — é por ela que o peso persiste. */
  const chaveBloco = (b: BlocoGeracao) => `${b.turma_id}|${b.componente_id}|${b.tipo}`;

  /**
   * Peso por bloco: quantas vezes ele já terminou uma tentativa sem ser alocado.
   *
   * É a memória da busca. Bloco que falha repetidamente sobe na ordem até ser
   * colocado antes de tudo, e a grade passa a se organizar EM VOLTA dele em vez
   * de deixá-lo para o fim — que é a razão de ele nunca caber. Sem isto o motor
   * refazia quarenta mil vezes o mesmo caminho e esbarrava sempre na mesma aula.
   */
  const pesos = new Map<string, number>(Object.entries(pesosIniciais ?? {}));

  /**
   * Domínio de um bloco: quantas posições (dia, slot inicial) são viáveis olhando
   * apenas o que NÃO muda durante uma tentativa — BAN, folga e reunião de fluxo do
   * professor, restrições da série, slots já travados na turma e as grades
   * publicadas de outros turnos.
   *
   * É a medida de "quão apertado" o bloco é. Colocar primeiro quem tem menos
   * saídas é a heurística do mais restrito primeiro: enquanto a grade está vazia,
   * o professor com 12 bloqueios ainda tem onde caber; deixado para o fim, não tem.
   *
   * Cacheado por forma do bloco — não depende do andamento da tentativa.
   */
  const dominioCache = new Map<string, number>();
  const calcularDominio = (b: BlocoGeracao): number => {
    const chave = `${b.turma_id}|${b.componente_id}|${b.tipo}|${b.size}`;
    const emCache = dominioCache.get(chave);
    if (emCache !== undefined) return emCache;

    const alvo = b.tipo === 'presencial' ? turno : turnoNP;
    const prof = b.professor_id ? professoresById.get(b.professor_id) : undefined;
    const travadosDaTurma = new Set(
      aulasFixas
        .filter(f => f.turma_id === b.turma_id)
        .map(f => `${f.tipo_aula}|${f.dia_semana}|${f.aula_index}`)
    );

    let n = 0;
    for (const d of alvo.dias_semana || []) {
      const maxStart = (alvo.aulas_por_dia || 0) - b.size;
      for (let i = 0; i <= maxStart; i++) {
        let viavel = true;
        for (let k = 0; k < b.size; k++) {
          const idx = i + k;
          if (travadosDaTurma.has(`${b.tipo}|${d}|${idx}`)) { viavel = false; break; }
          if (b.tipo === 'presencial' && b.serie_restricoes?.[d]?.[idx] === 'proibido') { viavel = false; break; }
          if (prof) {
            if (isBanHardBlocked(prof, alvo.id, d, idx)) { viavel = false; break; }
            if (isReuniaoFluxoHardBlocked(prof, alvo.id, d, idx)) { viavel = false; break; }
            if (isFolgaHardBlocked(prof, alvo, d, idx)) { viavel = false; break; }
          }
          if (b.professor_key) {
            const [ini, fim] = getSlotMinutes(alvo, idx);
            const ocupadoAlhures = (ocupacoesExistentesPorProfessorDia.get(`${b.professor_key}|${d}`) || [])
              .some(occ => minutesConflitam(ini, fim, occ.inicio_min, occ.fim_min, alvo.id === occ.turno_id, idx, occ.aula_index));
            if (ocupadoAlhures) { viavel = false; break; }
          }
        }
        if (viavel) n++;
      }
    }

    dominioCache.set(chave, n);
    return n;
  };

  const temPadroes = Object.keys(padroes).length > 0;

  /**
   * Ordem em que os slots de um dia são tentados.
   *
   * Sem padrões históricos é sorteio puro, como sempre foi. Com eles, os slots
   * onde aquele componente costuma cair na rede vêm primeiro — mas com ruído
   * aleatório suficiente para nunca virar regra: é desempate, não restrição.
   *
   * O formato da chave repete o de `chavePadrao` em `geracao/memoria.ts`. Repetir
   * é feio, mas obrigatório: este arquivo é compilado à parte pelo worker e não
   * pode importar valor de lugar nenhum. Mudou lá, muda aqui.
   */
  const ordenarSlots = (b: BlocoGeracao, dia: string, maxStart: number, rng: () => number): number[] => {
    const slots = Array.from({ length: maxStart + 1 }, (_, k) => k);
    if (!temPadroes || !b.componente_sigla) return slots.sort(() => rng() - 0.5);

    return slots
      .map(i => {
        // Média do histórico sobre os slots que o bloco vai ocupar.
        let soma = 0;
        for (let k = 0; k < b.size; k++) {
          soma += padroes[`comp=${b.componente_sigla}|dia=${dia}|aula=${i + k}`] ?? 0;
        }
        // O ruído domina o histórico de propósito: o sinal agregado entre escolas
        // é fraco, e deixá-lo mandar sozinho engessaria a busca.
        return { i, score: (soma / b.size) * 0.6 + rng() };
      })
      .sort((x, y) => y.score - x.score)
      .map(x => x.i);
  };

  // ── Construção dos blocos ────────────────────────────────────────────────
  /**
   * @param larguraBucket agrupa domínios parecidos antes de embaralhar. Na fase de
   *   exploração convém um valor alto (mais diversidade entre tentativas); na
   *   intensificação, 1, para respeitar a ordem à risca.
   */
  const construirTodosOsBlocos = (
    forcarIndividuais: boolean,
    rng: () => number = Math.random,
    larguraBucket: number = 4,
  ): BlocoGeracao[] => {
    const blocos: BlocoGeracao[] = [];

    for (const t of turmas) {
      for (const c of t.serie.componentes) {
        const profInfo = t.professores.find(p => p.componente_id === c.componente_id);
        const profId = profInfo?.professor_id || null;
        const profKey = profId ? teacherKeyMap.get(profId) || null : null;
        const profNome = (profInfo as any)?.professor?.nome_horario || 'Sem Professor';

        // Subtrair aulas fixas: Fase 0 pré-aloca esses slots, então o loop
        // principal não deve criar blocos duplicados para os mesmos slots.
        //
        // O filtro é por TURMA (não por série): desde a migração 20260812 cada
        // turma tem os seus travamentos. Filtrar por série aqui geraria aula a
        // mais ou a menos por turma, sem erro visível em lugar nenhum.
        const nFixaPresencial = aulasFixas.filter(af =>
          af.turma_id === t.id && af.componente_id === c.componente_id && af.tipo_aula === 'presencial'
        ).length;
        const nFixaNP = aulasFixas.filter(af =>
          af.turma_id === t.id && af.componente_id === c.componente_id && af.tipo_aula === 'nao_presencial'
        ).length;

        // Presenciais — no turno principal
        const nPresenciais = Math.max(0, (c.aulas_presenciais || 0) - nFixaPresencial);
        if (nPresenciais > 0) {
          const presenciais = criarBlocos(nPresenciais, c.componente_id, configGerminacao, forcarIndividuais);
          for (const size of presenciais) {
            blocos.push({
              tipo: 'presencial',
              turma_id: t.id,
              turma_nome: t.nome,
              componente_id: c.componente_id,
              componente_nome: (c as any).componente?.nome || 'Disciplina',
              componente_sigla: (c as any).componente?.sigla || undefined,
              professor_id: profId,
              professor_key: profKey,
              professor_nome: profNome,
              size,
              serie_restricoes: t.serie.restricoes,
              workload: 0,
              priority: 2, // presencial = prioridade mais baixa
            });
          }
        }

        // NP — no turno oposto determinístico
        const nNP = Math.max(0, (c.aulas_nao_presenciais || 0) - nFixaNP);
        if (nNP > 0) {
          const naoPresenciais = criarBlocos(nNP, c.componente_id, configGerminacao, forcarIndividuais);
          for (const size of naoPresenciais) {
            blocos.push({
              tipo: 'nao_presencial',
              turma_id: t.id,
              turma_nome: t.nome,
              componente_id: c.componente_id,
              componente_nome: (c as any).componente?.nome || 'Disciplina',
              componente_sigla: (c as any).componente?.sigla || undefined,
              professor_id: profId,
              professor_key: profKey,
              professor_nome: profNome,
              size,
              workload: 0,
              priority: 1, // NP tem prioridade alta (menor número = alocado antes)
              turno_np_id: turnoNP.id,
            });
          }
        }
      }
    }

    // `workload` era um campo morto, sempre zero. Agora carrega o domínio, que é
    // o que diz quão apertado o bloco é.
    for (const b of blocos) b.workload = calcularDominio(b);

    /**
     * Ordem de colocação — o coração da mudança.
     *
     * Antes era só prioridade e tamanho, com tudo embaralhado dentro do grupo:
     * um professor com 12 bloqueios disputava slot em pé de igualdade com um sem
     * nenhum, e quem chegava por último ficava sem lugar. Agora:
     *
     *   1. NP antes de presencial (inalterado — o contraturno é mais escasso)
     *   2. maior peso primeiro       → o que já falhou vem antes
     *   3. menor domínio primeiro    → o mais restrito vem antes
     *   4. bloco maior primeiro      → geminação precisa de espaço contíguo
     */
    blocos.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      const pa = pesos.get(chaveBloco(a)) ?? 0;
      const pb = pesos.get(chaveBloco(b)) ?? 0;
      if (pa !== pb) return pb - pa;
      if (a.workload !== b.workload) return a.workload - b.workload;
      return b.size - a.size;
    });

    /**
     * Shuffle Fisher-Yates entre blocos de dificuldade equivalente.
     *
     * Embaralhar o grupo de prioridade inteiro (era o que se fazia) desfazia
     * qualquer ordenação por dificuldade. Embaralhar só os empates preservaria a
     * ordem mas deixaria todas as tentativas quase idênticas — sem diversidade
     * não há o que explorar. O balde de largura `larguraBucket` é o meio-termo:
     * varia a ordem entre blocos igualmente difíceis, mantém a ordem entre os
     * diferentes.
     */
    const largura = Math.max(1, larguraBucket);
    const baldes = new Map<string, number[]>();
    blocos.forEach((b, i) => {
      const peso = pesos.get(chaveBloco(b)) ?? 0;
      const chave = `${b.priority}|${peso}|${Math.floor(b.workload / largura)}`;
      if (!baldes.has(chave)) baldes.set(chave, []);
      baldes.get(chave)!.push(i);
    });
    for (const indices of baldes.values()) {
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [blocos[indices[i]], blocos[indices[j]]] = [blocos[indices[j]], blocos[indices[i]]];
      }
    }

    return blocos;
  };

  // ── Tentativa de alocação ────────────────────────────────────────────────
  /**
   * Parâmetros de relaxamento progressivo:
   *
   * - permitirUsoPlanejamento: quando true, slots de "planejamento" (SOFT)
   *   podem ser usados. Começa false, relaxa cedo (>15% das tentativas).
   *
   * - forcarIndividuais: quando true, desativa geminação para maximizar
   *   chances de encaixe. Relaxa perto do fim (>75%).
   *
   * - ignorarDiasPreferidos: quando true, ignora a preferência de
   *   concentração de dias do professor. Relaxa perto do fim (>70%).
   *
   * NOTA: NÃO existe mais parâmetro `ignorarLivreDocencia`.
   * BAN (indisponivel) e FOLGA (livre docência) são SEMPRE hard constraints
   * e NUNCA são afetados por relaxamento progressivo.
   */
  const executarTentativa = (
    permitirUsoPlanejamento: boolean,
    forcarIndividuais: boolean,
    ignorarDiasPreferidos: boolean = false,
    curProgLocal: number = 0,
    permitirUsoPersonalizado: boolean = false,
    rng: () => number = Math.random,
    /** Grade de partida. Presente = intensificação (ruína e recriação sobre ela). */
    gradeBase: HorarioAulaGeradaAlgoritmo[] | null = null,
    larguraBucket: number = 4,
    /** Semeia a grade mas não a desmonta — usado para diagnosticar a grade final. */
    preservarBase: boolean = false,
  ) => {
    const aulasGeradas: HorarioAulaGeradaAlgoritmo[] = [];
    const ocupacaoProfessoresPorDia = new Map<string, SlotOcupado[]>();
    const ocupacaoTurmas = new Set<string>();

    const todosOsBlocos = construirTodosOsBlocos(forcarIndividuais, rng, larguraBucket);

    // ╔═══════════════════════════════════════════════════════════════════
    // FASE 0 — Pré-alocação de aulas travadas
    // As fixas entram ANTES do loop aleatório e marcam seus slots como
    // ocupados, de modo que o loop não tenta reocupá-los.
    //
    // O travamento é por turma desde a migração 20260812. Antes valia para a
    // série inteira e havia o conceito de "aula coletiva" (uma turma junto da
    // outra, com um professor só) — removido: quando as turmas tinham
    // professores diferentes e nenhum responsável definido, a aula era gravada
    // sem professor nenhum.
    // ╚═══════════════════════════════════════════════════════════════════
    for (const aulaFixa of aulasFixas) {
      const turma = turmas.find(t => t.id === aulaFixa.turma_id);
      if (!turma) continue; // turma de outro turno

      const { dia_semana: dia, aula_index: idx, tipo_aula } = aulaFixa;
      const targetTurno = tipo_aula === 'presencial' ? turno : (resolverTurnoNP(turno, todosTurnos));
      const [ini, fim] = getSlotMinutes(targetTurno, idx);
      const slotKey = `${turma.id}|${targetTurno.id}|${dia}|${idx}`;

      // Verificar conflito de turma
      if (ocupacaoTurmas.has(slotKey)) {
        console.warn(`[FIXAS] Conflito de turma na pré-alocação: ${turma.nome} | ${dia}-${idx}`);
        continue; // Não interrompe a tentativa; a garantia abaixo resolve
      }

      const profInfo = turma.professores.find(p => p.componente_id === aulaFixa.componente_id);
      const profId = profInfo?.professor_id || null;
      const profObj = profId ? professoresById.get(profId) : undefined;
      const profKey = profObj ? getTeacherKey(profObj) : (profId ? `id:${profId}` : null);

      aulasGeradas.push({
        turma_id: turma.id,
        componente_id: aulaFixa.componente_id,
        professor_id: profId,
        dia_semana: dia,
        aula_index: idx,
        tipo: tipo_aula,
        turno_id: targetTurno.id,
        aula_fixa_id: aulaFixa.id,
        compartilhada: false,
        aula_compartilhada_id: null,
      });

      ocupacaoTurmas.add(slotKey);

      if (profKey) {
        pushMapArray(ocupacaoProfessoresPorDia, `${profKey}|${dia}`, {
          turno_id: targetTurno.id,
          aula_index: idx,
          inicio_min: ini,
          fim_min: fim,
        });
      }
    }

    // ── FIM da Fase 0 ─────────────────────────────────────────────────────────────

    // ── GARANTIA PÓS-FASE-0 ──────────────────────────────────────────────────────
    // A Fase 0 tem uma saída silenciosa: se ocupacaoTurmas.has(slotKey) for true
    // ao processar uma fixação, ela faz `continue` sem registrar a aula nem proteger
    // o slot. Este passo force-registra qualquer fixação que tenha sido ignorada.
    for (const aulaFixa of aulasFixas) {
      const turma = turmas.find(t => t.id === aulaFixa.turma_id);
      if (!turma) continue;

      const jaRegistrada = aulasGeradas.some(
        a => a.aula_fixa_id === aulaFixa.id && a.turma_id === turma.id
      );
      if (jaRegistrada) continue;

      const targetTurnoGarantia = aulaFixa.tipo_aula === 'presencial'
        ? turno
        : (resolverTurnoNP(turno, todosTurnos));
      const [iniG, fimG] = getSlotMinutes(targetTurnoGarantia, aulaFixa.aula_index);
      const slotKeyG = `${turma.id}|${targetTurnoGarantia.id}|${aulaFixa.dia_semana}|${aulaFixa.aula_index}`;

      console.warn(
        `[FIXAS] Garantia ativada — travamento não registrado pela Fase 0:`,
        `turma=${turma.nome} | dia=${aulaFixa.dia_semana} | idx=${aulaFixa.aula_index} | slotKey=${slotKeyG}`
      );

      // Remover qualquer aula não-fixa que ocupe ilegitimamente este slot
      if (ocupacaoTurmas.has(slotKeyG)) {
        const intruso = aulasGeradas.find(
          a => a.turma_id === turma.id
            && a.turno_id === targetTurnoGarantia.id
            && a.dia_semana === aulaFixa.dia_semana
            && a.aula_index === aulaFixa.aula_index
            && !a.aula_fixa_id
        );
        if (intruso) {
          const idxArr = aulasGeradas.indexOf(intruso);
          if (idxArr >= 0) aulasGeradas.splice(idxArr, 1);
          ocupacaoTurmas.delete(slotKeyG);
          if (intruso.professor_id) {
            const pKey = teacherKeyMap.get(intruso.professor_id);
            if (pKey) {
              const mapKey = `${pKey}|${intruso.dia_semana}`;
              const arr = ocupacaoProfessoresPorDia.get(mapKey) || [];
              const filtered = arr.filter(o => !(o.aula_index === intruso.aula_index && o.turno_id === intruso.turno_id));
              if (filtered.length > 0) ocupacaoProfessoresPorDia.set(mapKey, filtered);
              else ocupacaoProfessoresPorDia.delete(mapKey);
            }
          }
        }
      }

      const profInfoG = turma.professores.find(p => p.componente_id === aulaFixa.componente_id);
      const profIdG = profInfoG?.professor_id || null;
      const profObjG = profIdG ? professoresById.get(profIdG) : undefined;
      const profKeyG = profObjG ? getTeacherKey(profObjG) : (profIdG ? `id:${profIdG}` : null);

      aulasGeradas.push({
        turma_id: turma.id,
        componente_id: aulaFixa.componente_id,
        professor_id: profIdG,
        dia_semana: aulaFixa.dia_semana,
        aula_index: aulaFixa.aula_index,
        tipo: aulaFixa.tipo_aula,
        turno_id: targetTurnoGarantia.id,
        aula_fixa_id: aulaFixa.id,
        compartilhada: false,
        aula_compartilhada_id: null,
      });

      ocupacaoTurmas.add(slotKeyG);

      if (profKeyG) {
        pushMapArray(ocupacaoProfessoresPorDia, `${profKeyG}|${aulaFixa.dia_semana}`, {
          turno_id: targetTurnoGarantia.id,
          aula_index: aulaFixa.aula_index,
          inicio_min: iniG,
          fim_min: fimG,
        });
      }
    }
    // ── FIM DA GARANTIA ──────────────────────────────────────────────────────────

    const slotKeyOf = (turmaId: string, turnoId: string, dia: string, idx: number) =>
      `${turmaId}|${turnoId}|${dia}|${idx}`;

    const aulaKeyOf = (a: HorarioAulaGeradaAlgoritmo) =>
      `${a.turma_id}|${a.turno_id}|${a.dia_semana}|${a.aula_index}|${a.professor_id}|${a.componente_id}|${a.tipo}`;

    const getMetaFromAula = (a: HorarioAulaGeradaAlgoritmo): BlocoGeracao | null => {
      const turmaData = turmasById.get(a.turma_id);
      if (!turmaData) return null;
      const profInfo = turmaData.professores.find(p => p.componente_id === a.componente_id);
      const profId = a.professor_id || profInfo?.professor_id || null;
      const profKey = profId ? (teacherKeyMap.get(profId) || null) : null;
      const profNome =
        (profInfo as any)?.professor?.nome_horario ||
        (professoresById.get(profId || '') as any)?.nome_horario ||
        'Sem Professor';

      return {
        tipo: a.tipo,
        turma_id: a.turma_id,
        turma_nome: turmaData.nome,
        componente_id: a.componente_id,
        componente_nome:
          ((turmaData.serie.componentes.find(c => c.componente_id === a.componente_id) as any)?.componente?.nome) ||
          'Disciplina',
        professor_id: profId,
        professor_key: profKey,
        professor_nome: profNome,
        size: 1,
        workload: 0,
        priority: a.tipo === 'nao_presencial' ? 1 : 2,
        serie_restricoes: turmaData.serie.restricoes,
        turno_np_id: a.tipo === 'nao_presencial' ? a.turno_id : undefined,
      };
    };

    const removeAulaState = (a: HorarioAulaGeradaAlgoritmo) => {
      const idxArr = aulasGeradas.findIndex(x => aulaKeyOf(x) === aulaKeyOf(a));
      if (idxArr >= 0) aulasGeradas.splice(idxArr, 1);

      ocupacaoTurmas.delete(slotKeyOf(a.turma_id, a.turno_id, a.dia_semana, a.aula_index));

      const profKey = a.professor_id ? (teacherKeyMap.get(a.professor_id) || null) : null;
      if (profKey) {
        const mapKey = `${profKey}|${a.dia_semana}`;
        const arr = ocupacaoProfessoresPorDia.get(mapKey) || [];
        const novo = arr.filter(occ => !(occ.turno_id === a.turno_id && occ.aula_index === a.aula_index));
        if (novo.length > 0) ocupacaoProfessoresPorDia.set(mapKey, novo);
        else ocupacaoProfessoresPorDia.delete(mapKey);
      }
    };

    const addAulaState = (meta: BlocoGeracao, targetTurno: Turno, dia: string, idx: number) => {
      const nova: HorarioAulaGeradaAlgoritmo = {
        turma_id: meta.turma_id,
        componente_id: meta.componente_id,
        professor_id: meta.professor_id!,
        dia_semana: dia,
        aula_index: idx,
        tipo: meta.tipo,
        turno_id: targetTurno.id,
      };
      aulasGeradas.push(nova);
      ocupacaoTurmas.add(slotKeyOf(meta.turma_id, targetTurno.id, dia, idx));
      if (meta.professor_key) {
        const [ini, fim] = getSlotMinutes(targetTurno, idx);
        pushMapArray(ocupacaoProfessoresPorDia, `${meta.professor_key}|${dia}`, {
          turno_id: targetTurno.id,
          aula_index: idx,
          inicio_min: ini,
          fim_min: fim,
        });
      }
      return nova;
    };

    const podeAlocarMetaEmSlot = (meta: BlocoGeracao, targetTurno: Turno, dia: string, idx: number): boolean => {
      const slotKey = slotKeyOf(meta.turma_id, targetTurno.id, dia, idx);
      if (ocupacaoTurmas.has(slotKey)) return false;

      if (meta.tipo === 'presencial' && meta.serie_restricoes?.[dia]?.[idx] === 'proibido') {
        return false;
      }

      if (meta.professor_key) {
        const profDiaKey = `${meta.professor_key}|${dia}`;
        const [iniCand, fimCand] = getSlotMinutes(targetTurno, idx);

        const localOcc = ocupacaoProfessoresPorDia.get(profDiaKey) || [];
        if (localOcc.some(occ => minutesConflitam(
          iniCand, fimCand,
          occ.inicio_min, occ.fim_min,
          targetTurno.id === occ.turno_id,
          idx, occ.aula_index,
        ))) return false;

        const globalOcc = ocupacoesExistentesPorProfessorDia.get(profDiaKey) || [];
        if (globalOcc.some(occ =>
          minutesConflitam(
            iniCand, fimCand,
            occ.inicio_min, occ.fim_min,
            targetTurno.id === occ.turno_id,
            idx, occ.aula_index,
          )
        )) return false;

        const prof = meta.professor_id ? professoresById.get(meta.professor_id) : undefined;
        if (isBanHardBlocked(prof, targetTurno.id, dia, idx)) return false;
        if (isReuniaoFluxoHardBlocked(prof, targetTurno.id, dia, idx)) return false;
        if (isFolgaHardBlocked(prof, targetTurno, dia, idx)) return false;
        if (isPlanejamentoSoftBlocked(prof, targetTurno.id, dia, idx) && !permitirUsoPlanejamento) return false;
        if (isPersonalizadoSoftBlocked(prof, targetTurno.id, dia, idx) && !permitirUsoPersonalizado) return false;
      }

      return true;
    };

    const tentarReposicionarAula = (
      aula: HorarioAulaGeradaAlgoritmo,
      opts?: { excluirDia?: string; excluirIdx?: number; excluirTurnoId?: string }
    ): { moved: boolean; novoDia?: string; novoIdx?: number; novoTurnoId?: string } => {
      const meta = getMetaFromAula(aula);
      const currentTurno = turnosById.get(aula.turno_id);
      if (!meta || !currentTurno) return { moved: false };
      if (aula.aula_fixa_id) return { moved: false };

      const dias = [...(currentTurno.dias_semana || [])].sort(() => rng() - 0.5);
      for (const d of dias) {
        const maxStart = currentTurno.aulas_por_dia - 1;
        const slots = Array.from({ length: maxStart + 1 }, (_, k) => k).sort(() => rng() - 0.5);
        for (const idx of slots) {
          if (d === aula.dia_semana && idx === aula.aula_index) continue;
          if (opts?.excluirTurnoId === currentTurno.id && opts?.excluirDia === d && opts?.excluirIdx === idx) continue;
          if (!podeAlocarMetaEmSlot(meta, currentTurno, d, idx)) continue;
          addAulaState(meta, currentTurno, d, idx);
          return { moved: true, novoDia: d, novoIdx: idx, novoTurnoId: currentTurno.id };
        }
      }

      return { moved: false };
    };

    const tentarRepairPendencias = () => {
      const pendentesAtuais = todosOsBlocos.filter(b => !b.placed);
      if (pendentesAtuais.length === 0) return;

      for (const b of pendentesAtuais) {
        if (b.placed || b.size !== 1) continue;
        const targetTurno = b.tipo === 'presencial' ? turno : (turnosById.get(b.turno_np_id!) || turnoNP);

        // Estratégia A: mover uma aula da mesma turma para liberar um slot melhor para a pendência.
        const aulasMesmaTurma = aulasGeradas
          .filter(a => a.turma_id === b.turma_id && a.turno_id === targetTurno.id && a.tipo === b.tipo && !a.aula_fixa_id)
          .sort(() => rng() - 0.5);

        let resolveu = false;
        for (const aulaOcupante of aulasMesmaTurma) {
          if (resolveu) break;
          const metaOcupante = getMetaFromAula(aulaOcupante);
          if (!metaOcupante) continue;

          removeAulaState(aulaOcupante);

          const pendenteCabeNoSlotLiberado = podeAlocarMetaEmSlot(
            b,
            targetTurno,
            aulaOcupante.dia_semana,
            aulaOcupante.aula_index
          );

          if (pendenteCabeNoSlotLiberado) {
            const mov = tentarReposicionarAula(aulaOcupante, {
              excluirTurnoId: targetTurno.id,
              excluirDia: aulaOcupante.dia_semana,
              excluirIdx: aulaOcupante.aula_index,
            });

            if (mov.moved) {
              addAulaState(b, targetTurno, aulaOcupante.dia_semana, aulaOcupante.aula_index);
              if (typeof process !== 'undefined' && (process.env.NODE_ENV !== 'production' || process.env.TIMETABLE_DEBUG === '1')) {
                console.log(`[REPAIR] Swap na mesma turma resolveu pendência: ${b.turma_nome} | ${b.componente_nome} | slot liberado ${aulaOcupante.dia_semana}-${aulaOcupante.aula_index}`);
              }
              b.placed = true;
              resolveu = true;
              break;
            }
          }

          addAulaState(metaOcupante, targetTurno, aulaOcupante.dia_semana, aulaOcupante.aula_index);
        }

        if (resolveu) continue;

        // Estratégia B: usar um slot vazio da turma e deslocar a aula conflitante do professor.
        const dias = [...(targetTurno.dias_semana || [])].sort(() => rng() - 0.5);
        for (const d of dias) {
          if (resolveu) break;
          const slots = Array.from({ length: targetTurno.aulas_por_dia }, (_, k) => k).sort(() => rng() - 0.5);
          for (const idx of slots) {
            if (resolveu) break;
            const slotKey = slotKeyOf(b.turma_id, targetTurno.id, d, idx);
            if (ocupacaoTurmas.has(slotKey)) continue;
            if (b.tipo === 'presencial' && b.serie_restricoes?.[d]?.[idx] === 'proibido') continue;

            const prof = b.professor_id ? professoresById.get(b.professor_id) : undefined;
            if (isBanHardBlocked(prof, targetTurno.id, d, idx)) continue;
            if (isReuniaoFluxoHardBlocked(prof, targetTurno.id, d, idx)) continue;
            if (isFolgaHardBlocked(prof, targetTurno, d, idx)) continue;
            if (isPlanejamentoSoftBlocked(prof, targetTurno.id, d, idx) && !permitirUsoPlanejamento) continue;
            if (isPersonalizadoSoftBlocked(prof, targetTurno.id, d, idx) && !permitirUsoPersonalizado) continue;

            if (!b.professor_key) {
              addAulaState(b, targetTurno, d, idx);
              b.placed = true;
              resolveu = true;
              break;
            }

            const profDiaKey = `${b.professor_key}|${d}`;
            const [iniCand, fimCand] = getSlotMinutes(targetTurno, idx);
            const conflitosLocais = aulasGeradas.filter(a => {
              if (!a.professor_id) return false;
              const profKeyA = teacherKeyMap.get(a.professor_id);
              if (profKeyA !== b.professor_key || a.dia_semana !== d) return false;
              const turnoA = turnosById.get(a.turno_id);
              if (!turnoA) return false;
              const [iniA, fimA] = getSlotMinutes(turnoA, a.aula_index);
              return minutesConflitam(
                iniCand, fimCand,
                iniA, fimA,
                targetTurno.id === a.turno_id,
                idx, a.aula_index
              );
            });

            if (conflitosLocais.length === 0) {
              // Sem conflito local — verificar conflito global e alocar diretamente se possível.
              // Isso ocorre quando Strategy A liberou um slot de turma que o loop principal
              // não conseguiu usar porque a ordem de busca já havia passado por aqui.
              const globalOcc = ocupacoesExistentesPorProfessorDia.get(profDiaKey) || [];
              const conflitaGlobal = globalOcc.some(occ =>
                minutesConflitam(iniCand, fimCand, occ.inicio_min, occ.fim_min,
                  targetTurno.id === occ.turno_id, idx, occ.aula_index)
              );
              if (!conflitaGlobal) {
                addAulaState(b, targetTurno, d, idx);
                b.placed = true;
                resolveu = true;
                break;
              }
              continue;
            }

            for (const conflito of conflitosLocais) {
              if (conflito.aula_fixa_id) continue;
              const metaConflito = getMetaFromAula(conflito);
              if (!metaConflito) continue;

              removeAulaState(conflito);
              const mov = tentarReposicionarAula(conflito, {
                excluirTurnoId: targetTurno.id,
                excluirDia: d,
                excluirIdx: idx,
              });

              if (mov.moved && podeAlocarMetaEmSlot(b, targetTurno, d, idx)) {
                addAulaState(b, targetTurno, d, idx);
                if (typeof process !== 'undefined' && (process.env.NODE_ENV !== 'production' || process.env.TIMETABLE_DEBUG === '1')) {
                  console.log(`[REPAIR] Realocação de conflito do professor resolveu pendência: ${b.turma_nome} | ${b.componente_nome} | slot ${d}-${idx}`);
                }
                b.placed = true;
                resolveu = true;
                break;
              }

              addAulaState(metaConflito, turnosById.get(conflito.turno_id)!, conflito.dia_semana, conflito.aula_index);
            }
          }
        }
      }
    };

    /**
     * Recalcula quais blocos estão colocados, contando as aulas presentes.
     *
     * O vínculo bloco↔aula é frouxo de propósito: o reparo move aulas de lugar
     * chamando `addAulaState` com metas reconstruídas, sem tocar no `placed` do
     * bloco original. Contar as aulas é a única leitura confiável do estado, e é
     * dela que a ruína depende para saber o que precisa ser recolocado.
     */
    const recomputarColocados = () => {
      const disponivel = new Map<string, number>();
      for (const a of aulasGeradas) {
        if (a.aula_fixa_id) continue; // travamento não pertence a bloco nenhum
        const k = `${a.turma_id}|${a.componente_id}|${a.tipo}`;
        disponivel.set(k, (disponivel.get(k) ?? 0) + 1);
      }
      // Blocos maiores primeiro: um trecho de 2 aulas satisfaz um bloco geminado
      // ou dois individuais, e consumi-lo pelo individual desmontaria a geminação.
      for (const b of [...todosOsBlocos].sort((x, y) => y.size - x.size)) {
        const k = `${b.turma_id}|${b.componente_id}|${b.tipo}`;
        const n = disponivel.get(k) ?? 0;
        if (n >= b.size) {
          b.placed = true;
          disponivel.set(k, n - b.size);
        } else {
          b.placed = false;
        }
      }
    };

    /**
     * Semeia a tentativa com uma grade já pronta (a melhor conhecida até agora).
     *
     * Cada aula herdada é revalidada contra as restrições atuais antes de entrar —
     * a grade pode vir de uma rodada anterior, e uma restrição de professor pode
     * ter mudado no meio do caminho. O que não passa simplesmente não entra e vira
     * pendência, que a busca recoloca.
     */
    const semearDaGrade = (base: HorarioAulaGeradaAlgoritmo[]) => {
      const porChave = new Map<string, BlocoGeracao[]>();
      for (const b of todosOsBlocos) {
        if (b.placed) continue;
        const k = `${b.turma_id}|${b.componente_id}|${b.tipo}`;
        const lista = porChave.get(k);
        if (lista) lista.push(b); else porChave.set(k, [b]);
      }
      for (const lista of porChave.values()) lista.sort((x, y) => y.size - x.size);

      // Aulas herdadas agrupadas por turma/componente/dia — é assim que um bloco
      // geminado se apresenta numa grade já montada: aulas consecutivas.
      const grupos = new Map<string, HorarioAulaGeradaAlgoritmo[]>();
      for (const a of base) {
        if (a.aula_fixa_id) continue; // a Fase 0 já recolocou os travamentos
        const k = `${a.turma_id}|${a.componente_id}|${a.tipo}|${a.turno_id}|${a.dia_semana}`;
        const lista = grupos.get(k);
        if (lista) lista.push(a); else grupos.set(k, [a]);
      }

      for (const [k, aulas] of grupos) {
        const [turmaId, componenteId, tipo, turnoId] = k.split('|');
        const alvo = turnosById.get(turnoId);
        if (!alvo) continue;
        const chave = `${turmaId}|${componenteId}|${tipo}`;
        aulas.sort((x, y) => x.aula_index - y.aula_index);

        let i = 0;
        while (i < aulas.length) {
          // Trecho de índices consecutivos
          let fim = i;
          while (fim + 1 < aulas.length && aulas[fim + 1].aula_index === aulas[fim].aula_index + 1) fim++;

          let inicio = i;
          while (inicio <= fim) {
            const restante = fim - inicio + 1;
            const bloco = (porChave.get(chave) || []).find(b => !b.placed && b.size <= restante);
            if (!bloco) break;

            const trecho = Array.from({ length: bloco.size }, (_, n) => aulas[inicio + n]);
            const cabe = trecho.every(a => podeAlocarMetaEmSlot(bloco, alvo, a.dia_semana, a.aula_index));
            if (!cabe) break; // restrição mudou desde que a grade foi gerada

            for (const a of trecho) addAulaState(bloco, alvo, a.dia_semana, a.aula_index);
            bloco.placed = true;
            inicio += bloco.size;
          }
          i = fim + 1;
        }
      }
    };

    /**
     * Ruína: desmonta a parte da grade que está em volta do problema.
     *
     * Sem isto a intensificação não sai do lugar — a grade herdada já é um ótimo
     * local, e recolocar só as pendências nos buracos que sobraram falha pelo
     * mesmo motivo que falhou antes. Desmontar as turmas e os professores
     * envolvidos abre espaço para uma arrumação diferente das MESMAS aulas.
     */
    const ruinar = () => {
      const pendentes = todosOsBlocos.filter(b => !b.placed);
      if (pendentes.length === 0) return;

      const turmasAlvo = new Set(pendentes.map(b => b.turma_id));
      const profsAlvo = new Set(pendentes.map(b => b.professor_key).filter(Boolean) as string[]);

      const modo = rng();
      const aRemover: HorarioAulaGeradaAlgoritmo[] = [];
      for (const a of aulasGeradas) {
        if (a.aula_fixa_id) continue; // travamento é do usuário, não se mexe
        if (modo < 0.4) {
          if (turmasAlvo.has(a.turma_id)) aRemover.push(a);
        } else if (modo < 0.8) {
          const pk = a.professor_id ? teacherKeyMap.get(a.professor_id) : null;
          if (pk && profsAlvo.has(pk)) aRemover.push(a);
        } else if (rng() < 0.15) {
          aRemover.push(a); // ruído: às vezes o gargalo está longe da pendência
        }
      }

      for (const a of aRemover) removeAulaState(a);
      recomputarColocados();
    };

    if (gradeBase && gradeBase.length > 0) {
      semearDaGrade(gradeBase);
      recomputarColocados();
      // `preservarBase` é o modo do diagnóstico: semeia a grade e analisa o que
      // faltou NELA. Ruinar ali produziria um arranjo diferente do que o usuário
      // vê na tela, e as pendências listadas voltariam a não bater com as células
      // vazias — que foi exatamente o defeito corrigido antes desta mudança.
      if (!preservarBase) ruinar();
    }

    for (const b of todosOsBlocos) {
      if (b.placed) continue; // já colocado pela Fase 0, pela semeadura ou por um bloco anterior
      let alocado = false;

      // Determinar turnos a testar para este bloco
      const turnosParaTestar: Turno[] =
        b.tipo === 'presencial'
          ? [turno]
          : [turnosById.get(b.turno_np_id!) || turnoNP];

      for (const targetTurno of turnosParaTestar) {
        if (alocado) break;

        const diasDisponiveis = [...(targetTurno.dias_semana || [])];
        const prof = b.professor_id ? professoresById.get(b.professor_id) : undefined;

        const dias = ordenarDiasComPreferenciaProgressiva(
          diasDisponiveis,
          prof,
          b.professor_key,
          ocupacaoProfessoresPorDia,
          ocupacoesExistentesPorProfessorDia,
          ignorarDiasPreferidos,
          curProgLocal,
          permitirMesmoProfDisciplinasMesmoDia,
          rng,
        );

        for (const d of dias) {
          if (alocado) break;

          const maxStart = targetTurno.aulas_por_dia - b.size;
          const startSlots = ordenarSlots(b, d, maxStart, rng);

          for (const i of startSlots) {
            let livre = true;

            for (let k = 0; k < b.size; k++) {
              const idx = i + k;
              const slotKey = `${b.turma_id}|${targetTurno.id}|${d}|${idx}`;

              // ── HARD CONSTRAINT 1: slot da turma já ocupado ──────────────
              if (ocupacaoTurmas.has(slotKey)) { livre = false; break; }

              // ── HARD CONSTRAINT 2: restrição proibida da série ───────────
              if (b.tipo === 'presencial' && b.serie_restricoes?.[d]?.[idx] === 'proibido') {
                livre = false; break;
              }

              // ── Verificações de professor ────────────────────────────────
              if (b.professor_key) {
                const profKey = b.professor_key;
                const profDiaKey = `${profKey}|${d}`;

                // Minutos do slot candidato
                const [iniCand, fimCand] = getSlotMinutes(targetTurno, idx);

                // ── HARD CONSTRAINT 3a: conflito contra aulas já alocadas NESTA tentativa ──
                const localOcc = ocupacaoProfessoresPorDia.get(profDiaKey) || [];
                const conflitaLocal = localOcc.some(occ =>
                  minutesConflitam(
                    iniCand, fimCand,
                    occ.inicio_min, occ.fim_min,
                    targetTurno.id === occ.turno_id,
                    idx, occ.aula_index,
                  )
                );
                if (conflitaLocal) { livre = false; break; }

                // ── HARD CONSTRAINT 3b: conflito contra aulas PUBLICADAS de outros turnos ──
                const globalOcc = ocupacoesExistentesPorProfessorDia.get(profDiaKey) || [];
                const conflitaGlobal = globalOcc.some(occ =>
                  minutesConflitam(
                    iniCand, fimCand,
                    occ.inicio_min, occ.fim_min,
                    targetTurno.id === occ.turno_id,
                    idx, occ.aula_index,
                  )
                );
                if (conflitaGlobal) { livre = false; break; }

                const prof = professoresById.get(b.professor_id!);

                // ── HARD CONSTRAINT 3c: BAN (indisponivel) ──────────────────
                // Bloqueio absoluto. Jamais pode receber aula.
                // Não afetado por nenhum parâmetro de relaxamento.
                if (isBanHardBlocked(prof, targetTurno.id, d, idx)) {
                  livre = false; break;
                }

                // ── HARD CONSTRAINT 3c2: REUNIÃO DE FLUXO ───────────────────
                // Bloqueio absoluto. Tratado como indisponível.
                // Não afetado por nenhum parâmetro de relaxamento.
                if (isReuniaoFluxoHardBlocked(prof, targetTurno.id, d, idx)) {
                  livre = false; break;
                }

                // ── HARD CONSTRAINT 3d: FOLGA (livre docência) ──────────────
                // Bloqueio absoluto. Jamais pode receber aula.
                // Não afetado por nenhum parâmetro de relaxamento.
                if (isFolgaHardBlocked(prof, targetTurno, d, idx)) {
                  livre = false; break;
                }

                // ── SOFT CONSTRAINT 3e: PLANEJAMENTO ───────────────────────
                // Bloqueio suave. Pode ser usado como último recurso
                // quando permitirUsoPlanejamento = true (após 15% das tentativas).
                if (isPlanejamentoSoftBlocked(prof, targetTurno.id, d, idx) && !permitirUsoPlanejamento) {
                  livre = false; break;
                }

                // ── SOFT CONSTRAINT 3f: PERSONALIZADO ──────────────────────
                // Bloqueio suave. Pode ser usado como último recurso
                // quando permitirUsoPersonalizado = true (após 15% das tentativas).
                if (isPersonalizadoSoftBlocked(prof, targetTurno.id, d, idx) && !permitirUsoPersonalizado) {
                  livre = false; break;
                }
              }
            }

            if (livre) {
              // Alocar todos os slots do bloco
              for (let k = 0; k < b.size; k++) {
                const idx = i + k;
                aulasGeradas.push({
                  turma_id: b.turma_id,
                  componente_id: b.componente_id,
                  professor_id: b.professor_id!,
                  dia_semana: d,
                  aula_index: idx,
                  tipo: b.tipo,
                  turno_id: targetTurno.id,
                });

                ocupacaoTurmas.add(`${b.turma_id}|${targetTurno.id}|${d}|${idx}`);

                if (b.professor_key) {
                  const [ini, fim] = getSlotMinutes(targetTurno, idx);
                  pushMapArray(ocupacaoProfessoresPorDia, `${b.professor_key}|${d}`, {
                    turno_id: targetTurno.id,
                    aula_index: idx,
                    inicio_min: ini,
                    fim_min: fim,
                  });
                }
              }
              alocado = true;
              break;
            }
          }
        }
      }

      if (alocado) {
        b.placed = true;
        if (
          permitirMesmoProfDisciplinasMesmoDia &&
          b.professor_key &&
          typeof process !== 'undefined' &&
          (process.env.NODE_ENV !== 'production' || process.env.TIMETABLE_DEBUG === '1')
        ) {
          // Encontra a aula recém-alocada para este bloco (a última do array para esta turma/componente)
          const recentAula = [...aulasGeradas].reverse().find(
            a => a.turma_id === b.turma_id && a.componente_id === b.componente_id && a.professor_id === b.professor_id
          );
          if (recentAula) {
            const aulasMesmaTurmaMesmoDia = aulasGeradas.filter(
              a => a.turma_id === b.turma_id &&
                   a.professor_id === b.professor_id &&
                   a.dia_semana === recentAula.dia_semana &&
                   a.componente_id !== b.componente_id
            );
            if (aulasMesmaTurmaMesmoDia.length > 0) {
              console.log(
                `[FLAG:permitirMesmoProfDia] ${b.professor_nome} | ${b.turma_nome} | ${b.componente_nome} ` +
                `alocado em ${recentAula.dia_semana} (mesmo dia que outras disciplinas deste prof na turma)`
              );
            }
          }
        }
      }
    }

    tentarRepairPendencias();

    const pendentes = todosOsBlocos.filter(b => !b.placed);
    return { success: pendentes.length === 0, aulas: aulasGeradas, pendentes, ocupacaoTurmas, ocupacaoProfessoresPorDia, todosOsBlocos };
  };

  // ── Loop de tentativas ───────────────────────────────────────────────────
  //
  // Relaxamento progressivo, medido sobre o ORÇAMENTO TOTAL da geração:
  //   • permitirUsoPlanejamento:  relaxa após 15% (SOFT — planejamento pode ser usado)
  //   • permitirUsoPersonalizado: relaxa após 15% (SOFT — personalizado pode ser usado)
  //   • forcarIndividuais:        relaxa após 25% (desfaz geminação)
  //   • ignorarDiasPreferidos:    relaxa após 70% (ignora preferência de concentração de dias)
  //
  // ATENÇÃO ao denominador. Até 08/2026 isto era `globalProgress + attempt /
  // maxAttempts`, com `maxAttempts` valendo o tamanho do LOTE (100) — de modo que
  // `curProg` varria 0→0,99 DENTRO DE CADA LOTE. Na prática as 100.000 tentativas
  // eram 1.000 repetições desta mesma rampa, só com sementes diferentes: o motor
  // nunca escalava a busca, e rodar três horas não procurava mais fundo do que
  // rodar três minutos. Por isso a posição agora é absoluta (`offsetTentativa`) e
  // o denominador é o orçamento inteiro.
  //
  // O que NUNCA é relaxado:
  //   • BAN (indisponivel)     → hard constraint permanente
  //   • FOLGA (livre docência) → hard constraint permanente
  //   • REUNIÃO DE FLUXO      → hard constraint permanente
  //   • conflitos de professor → hard constraint permanente
  //   • conflitos de turma     → hard constraint permanente
  //   • restrições de série    → hard constraint permanente
  //
  // Os limiares são ajustáveis por ambiente: comprimir a rampa (ex. 5/10/20)
  // faz a geração chegar mais cedo à busca totalmente relaxada, o que encurta
  // muito o tempo até desistir de uma grade inviável.
  const LIMIAR_PLAN = Number(process.env.SHETO_RELAX_PLAN) || 0.15;
  const LIMIAR_INDIV = Number(process.env.SHETO_RELAX_INDIV) || 0.25;
  const LIMIAR_DIAS = Number(process.env.SHETO_RELAX_DIAS) || 0.70;

  /**
   * Fração do orçamento gasta em reinícios do zero antes de a busca passar a
   * melhorar a melhor grade encontrada. Baixo demais e ela se agarra cedo a um
   * ótimo local ruim; alto demais e desperdiça o orçamento repetindo partidas.
   */
  const FASE_EXPLORACAO = Number(process.env.SHETO_FASE_EXPLORACAO) || 0.20;

  const orcamento = totalTentativas > 0 ? totalTentativas : chunk;

  /**
   * Chamada de diagnóstico: uma única tentativa sobre uma grade já escolhida, só
   * para descrever o que faltou nela. Não explora, não desmonta nada.
   */
  const modoDiagnostico = computarDiagnostico && chunk === 1 && !!gradeHerdada && gradeHerdada.length > 0;

  // Melhor tentativa do pedaço: serve para a parada por estagnação e para a
  // grade parcial oferecida ao usuário quando a geração falha.
  // A grade herdada já é a incumbente, com o custo que ela custa. Só é
  // substituída por algo igual ou melhor.
  const herdou = !!gradeHerdada && gradeHerdada.length > 0;
  let melhorPendentes = herdou ? pendentesHerdados : Number.POSITIVE_INFINITY;
  let melhorAulas: HorarioAulaGeradaAlgoritmo[] =
    herdou && Number.isFinite(pendentesHerdados) ? gradeHerdada! : [];
  let melhorIndice = offsetTentativa;
  /**
   * Estado completo da melhor tentativa, guardado para o diagnóstico.
   *
   * Antes o diagnóstico rodava uma tentativa de descarte à parte (semente fora
   * do orçamento, todas as relaxações forçadas) e descrevia *aquela* — enquanto
   * a grade mostrada ao usuário era a melhor tentativa. As duas discordavam:
   * numa geração real, 9 células vazias na grade contra 18 pendências listadas,
   * algumas em turmas cujo horário tinha fechado. Agora é a mesma tentativa.
   */
  let melhorEstado: ReturnType<typeof executarTentativa> | null = null;

  for (let attempt = 0; attempt < chunk; attempt++) {
    const indiceGlobal = offsetTentativa + attempt;
    const curProg = indiceGlobal / orcamento;
    const permitirPlan = force || curProg > LIMIAR_PLAN;
    const permitirPersonalizado = force || curProg > LIMIAR_PLAN;
    const forcarIndiv = force || curProg > LIMIAR_INDIV;
    const ignorarDiasPref = force || curProg > LIMIAR_DIAS;

    // Semente = índice global: única em toda a geração, inclusive entre as
    // threads que processam pedaços diferentes ao mesmo tempo.
    const rng = makeRng(indiceGlobal);

    /**
     * Exploração vira intensificação.
     *
     * Na primeira fatia do orçamento a busca parte do zero, para varrer regiões
     * distintas e achar um bom ponto de apoio. Passado esse ponto ela para de
     * recomeçar e passa a trabalhar EM CIMA da melhor grade conhecida: desmonta o
     * pedaço problemático e remonta. Cada tentativa parte de 396 aulas prontas
     * em vez de zero — é a diferença entre repetir quarenta mil vezes o mesmo
     * esforço e acumulá-lo.
     */
    const base = melhorAulas.length > 0 ? melhorAulas : (gradeHerdada ?? []);
    /**
     * Grade recebida de fora (memória da escola ou outra thread) já entra em
     * intensificação na primeira tentativa: a fase de exploração existe para
     * encontrar um ponto de apoio, e aqui ele já veio pronto. Esperar 20% do
     * orçamento para usá-lo desperdiçaria justamente o que a memória economiza.
     */
    const intensificar = base.length > 0 && (herdou || modoDiagnostico || curProg > FASE_EXPLORACAO);

    const res = executarTentativa(
      permitirPlan, forcarIndiv, ignorarDiasPref, curProg, permitirPersonalizado, rng,
      intensificar ? base : null,
      // Na intensificação a ordem por dificuldade é seguida à risca; na exploração
      // ela é afrouxada para as tentativas não saírem todas iguais.
      intensificar ? 1 : 4,
      modoDiagnostico,
    );

    // Aprendizado: todo bloco que ficou de fora fica mais pesado e será tentado
    // antes na próxima vez. É o que faz a busca convergir para o gargalo real.
    for (const b of res.pendentes) {
      const k = chaveBloco(b);
      pesos.set(k, (pesos.get(k) ?? 0) + 1);
    }

    if (res.success) {
      return {
        success: true, aulas: res.aulas, attemptsMade: attempt + 1,
        melhorPendentes: 0, melhorIndice: indiceGlobal,
        pesos: Object.fromEntries(pesos),
      };
    }

    /**
     * `<=` e não `<`: aceitar soluções de custo IGUAL é o que permite atravessar
     * platô. Com `<` a busca congela na primeira boa solução e passa o resto do
     * orçamento desmontando e remontando exatamente a mesma grade.
     */
    if (res.pendentes.length <= melhorPendentes) {
      melhorPendentes = res.pendentes.length;
      melhorAulas = res.aulas;
      melhorIndice = indiceGlobal;
      melhorEstado = res;
    }
  }

  const semDiagnostico = {
    success: false,
    aulas: melhorAulas,
    attemptsMade: chunk,
    melhorPendentes: melhorPendentes === Number.POSITIVE_INFINITY ? 0 : melhorPendentes,
    melhorIndice,
    pesos: Object.fromEntries(pesos),
    error: 'Algumas aulas não puderam ser alocadas devido a conflitos de professores ou restrições de horários.',
  };

  if (!computarDiagnostico || !melhorEstado) return semDiagnostico;

  /**
   * ── MOTOR DE DIAGNÓSTICO ────────────────────────────────────────────────────
   *
   * Descreve a MELHOR tentativa — a mesma cuja grade é devolvida em `aulas`.
   * Cada pendência listada corresponde a uma célula vazia da grade que o usuário
   * vê, e vice-versa.
   *
   * IMPORTANTE: Não usamos o `ocupacaoTurmas` da tentativa (que é um estado
   * aleatório), pois ele causa falsos positivos de "turma lotada".
   *
   * Em vez disso, para cada bloco pendente:
   * 1. Usamos um fresh set APENAS com as aulas que a tentativa *conseguiu* alocar
   *    (isso representa o estado mais preenchido possível sem aquele bloco).
   * 2. Testamos a sequência de `b.size` slots consecutivos reais (não individuais).
   * 3. Registramos o motivo real da primeira rejeição em cada sequência.
   */
  const diagnosticarFalhas = (
    pendentes: BlocoGeracao[],
    aulasAlocadas: HorarioAulaGeradaAlgoritmo[],
    finalProfessores: Map<string, SlotOcupado[]>,
    todosOsBlocos: BlocoGeracao[]
  ): DiagnosticoFalha => {

    // Reconstrói o set de turma apenas com aulas efetivamente alocadas
    const turmasAlocadasSet = new Set<string>();
    for (const a of aulasAlocadas) {
      turmasAlocadasSet.add(`${a.turma_id}|${a.turno_id}|${a.dia_semana}|${a.aula_index}`);
    }

    const motivosCounter = new Map<string, {
      tipo: 'excess_ban' | 'excess_folga' | 'choque_turno_oposto' | 'choque_turno_local' | 'falta_slot_turma' | 'geminacao_impossivel' | 'restricao_serie' | 'sem_professor' | 'heuristica_busca';
      professores: Set<string>;
      turmas: Set<string>;
      count: number;
    }>();

    const pendenciasDetalhadas: PendenciaDetalhada[] = [];

    const reasonTranslate: Record<string, string> = {
      'excess_ban': 'Bloqueado por Banimento (BAN)',
      'excess_folga': 'Bloqueado por Folga/Livre Docência',
      'choque_turno_oposto': 'Choque com professor em outro turno publicado',
      'choque_turno_local': 'Conflito de carga com o professor nesta grade',
      'falta_slot_turma': 'Turma sem sequência livre para alocação',
      'geminacao_impossivel': 'Sem blocos consecutivos livres (problema de geminação)',
      'restricao_serie': 'Restrição da série bloqueia este formato de aula',
      'sem_professor': 'Bloco sem professor definido',
      'heuristica_busca': 'Havia slot possível, mas a ordem da busca não conseguiu concluir a alocação',
    };

    for (const b of pendentes) {
      if (!b.professor_key && !b.professor_id) {
        // Bloco sem professor — sem professor não conflita por professor, apenas por turma
        const mKey = 'sem_professor';
        if (!motivosCounter.has(mKey)) motivosCounter.set(mKey, { tipo: mKey as any, professores: new Set(), turmas: new Set(), count: 0 });
        const ct = motivosCounter.get(mKey)!;
        ct.count += b.size;
        ct.turmas.add(b.turma_nome);
        pendenciasDetalhadas.push({ turma_nome: b.turma_nome, disciplina_nome: b.componente_nome, professor_nome: null, tipo_aula: b.tipo, motivo_real: reasonTranslate['sem_professor'] });
        continue;
      }

      const turnosParaTestar = b.tipo === 'presencial' ? [turno] : [turnosById.get(b.turno_np_id!) || turnoNP];

      // Contadores de rejeição por motivo (para este bloco)
      let motivos = {
        excess_ban: 0,
        excess_folga: 0,
        choque_turno_oposto: 0,
        choque_turno_local: 0,
        falta_slot_turma: 0,
        restricao_serie: 0,
      };
      let totalSequenciasTentadas = 0;
      let totalSequenciasLivresParaTurma = 0; // slots que eram livres de turma mas rejeitados por professor

      for (const targetTurno of turnosParaTestar) {
        const dias = targetTurno.dias_semana || [];
        for (const d of dias) {
          const maxStart = targetTurno.aulas_por_dia - b.size;
          // Testa blocos de size consecutivos, como o motor real faz
          for (let i = 0; i <= maxStart; i++) {
            totalSequenciasTentadas++;
            let primeiraMotivoRejeicao: keyof typeof motivos | null = null;
            let turmaLivre = true;

            for (let k = 0; k < b.size; k++) {
              const idx = i + k;
              const slotKey = `${b.turma_id}|${targetTurno.id}|${d}|${idx}`;

              if (turmasAlocadasSet.has(slotKey)) {
                primeiraMotivoRejeicao = 'falta_slot_turma';
                turmaLivre = false;
                break;
              }
              if (b.tipo === 'presencial' && b.serie_restricoes?.[d]?.[idx] === 'proibido') {
                primeiraMotivoRejeicao = 'restricao_serie';
                turmaLivre = false;
                break;
              }
            }

            if (!turmaLivre) {
              // A turma já tem algo nessa posição
              motivos[primeiraMotivoRejeicao!]++;
              continue;
            }

            // Turma está livre nessa sequência; verificar professor
            totalSequenciasLivresParaTurma++;
            for (let k = 0; k < b.size; k++) {
              const idx = i + k;
              const profDiaKey = `${b.professor_key}|${d}`;
              const [iniCand, fimCand] = getSlotMinutes(targetTurno, idx);
              const prof = professoresById.get(b.professor_id!);

              if (isBanHardBlocked(prof, targetTurno.id, d, idx)) {
                primeiraMotivoRejeicao = 'excess_ban'; break;
              }
              if (isReuniaoFluxoHardBlocked(prof, targetTurno.id, d, idx)) {
                primeiraMotivoRejeicao = 'excess_ban'; break;
              }
              if (isFolgaHardBlocked(prof, targetTurno, d, idx)) {
                primeiraMotivoRejeicao = 'excess_folga'; break;
              }

              const globalOcc = ocupacoesExistentesPorProfessorDia.get(profDiaKey) || [];
              if (globalOcc.some(occ => minutesConflitam(iniCand, fimCand, occ.inicio_min, occ.fim_min, targetTurno.id === occ.turno_id, idx, occ.aula_index))) {
                primeiraMotivoRejeicao = 'choque_turno_oposto'; break;
              }

              const localOcc = finalProfessores.get(profDiaKey) || [];
              if (localOcc.some(occ => minutesConflitam(iniCand, fimCand, occ.inicio_min, occ.fim_min, targetTurno.id === occ.turno_id, idx, occ.aula_index))) {
                primeiraMotivoRejeicao = 'choque_turno_local'; break;
              }
            }

            if (primeiraMotivoRejeicao) {
              motivos[primeiraMotivoRejeicao]++;
            }
            // Se primeiraMotivoRejeicao === null aqui, a sequência ESTAVA livre — mas o bloco não foi alocado.
            // Isso aponta para problema de heurística/ordem do motor.
          }
        }
      }

      // ── Determinar causa principal ────────────────────────────────────────
      const totalRejeicoes = Object.values(motivos).reduce((a, c) => a + c, 0);
      const slotsCompletamenteLivres = totalSequenciasTentadas - totalRejeicoes;

      let principalMotivo:
        | keyof typeof motivos
        | 'geminacao_impossivel'
        | 'heuristica_busca' = 'falta_slot_turma';

      const professorBloqueios =
        motivos.excess_ban +
        motivos.excess_folga +
        motivos.choque_turno_oposto +
        motivos.choque_turno_local;

      // Se não existe nenhuma sequência livre para a turma, aí sim é slot/restrição da turma.
      if (totalSequenciasLivresParaTurma === 0) {
        if (motivos.restricao_serie > 0 && motivos.restricao_serie >= motivos.falta_slot_turma) {
          principalMotivo = 'restricao_serie';
        } else {
          principalMotivo = 'falta_slot_turma';
        }
      }
      // Se a turma tinha sequência livre, mas o professor bloqueou, o motivo precisa refletir isso.
      else if (professorBloqueios > 0) {
        const motivosProfessor = {
          excess_ban: motivos.excess_ban,
          excess_folga: motivos.excess_folga,
          choque_turno_oposto: motivos.choque_turno_oposto,
          choque_turno_local: motivos.choque_turno_local,
        };

        let maxCount = -1;
        for (const [m, count] of Object.entries(motivosProfessor)) {
          if (count > maxCount) {
            maxCount = count;
            principalMotivo = m as keyof typeof motivosProfessor;
          }
        }
      }
      // Se havia sequência totalmente livre e mesmo assim não alocou, o problema é heurística.
      else if (slotsCompletamenteLivres > 0) {
        if (b.size > 1) {
          principalMotivo = 'geminacao_impossivel';
        } else {
          principalMotivo = 'heuristica_busca';
        }
      }
      // Fallback genérico
      else {
        let maxCount = -1;
        for (const [m, count] of Object.entries(motivos)) {
          if (count > maxCount) {
            maxCount = count;
            principalMotivo = m as any;
          }
        }
      }

      // ── Log de debug por bloco ───────────────────────────────────────────
      const debugAtivo = typeof process !== 'undefined' && (process.env.NODE_ENV !== 'production' || process.env.TIMETABLE_DEBUG === '1');
      if (debugAtivo) {
        console.log(`[DIAG] Bloco pendente: ${b.turma_nome} | ${b.componente_nome} | ${b.professor_nome} | tipo=${b.tipo} | size=${b.size}`);
        console.log(`  Sequências testadas: ${totalSequenciasTentadas} | Livres de turma: ${totalSequenciasLivresParaTurma} | Completamente livres: ${slotsCompletamenteLivres}`);
        console.log(`  Motivos: BAN=${motivos.excess_ban} | FOLGA=${motivos.excess_folga} | CHOQUE_GLOBAL=${motivos.choque_turno_oposto} | CHOQUE_LOCAL=${motivos.choque_turno_local} | TURMA_CHEIA=${motivos.falta_slot_turma} | SERIE=${motivos.restricao_serie}`);
        console.log(`  → Causa principal: ${principalMotivo}`);
      }

      // ── Acumular nos contadores ───────────────────────────────────────────
      const mKey = principalMotivo as string;
      if (!motivosCounter.has(mKey)) {
        motivosCounter.set(mKey, { tipo: mKey as any, professores: new Set(), turmas: new Set(), count: 0 });
      }
      const ct = motivosCounter.get(mKey)!;
      ct.count += b.size;
      if (b.professor_nome) ct.professores.add(b.professor_nome);
      ct.turmas.add(b.turma_nome);

      pendenciasDetalhadas.push({
        turma_nome: b.turma_nome,
        disciplina_nome: b.componente_nome,
        professor_nome: b.professor_nome,
        tipo_aula: b.tipo,
        motivo_real: reasonTranslate[principalMotivo] || principalMotivo,
      });
    }

    // ── Log de resumo ─────────────────────────────────────────────────────────
    const debugAtivo = typeof process !== 'undefined' && (process.env.NODE_ENV !== 'production' || process.env.TIMETABLE_DEBUG === '1');
    if (debugAtivo) {
      console.log(`[DIAG] ─── RESUMO ───────────────────────────────────────`);
      for (const [tipo, entry] of motivosCounter) {
        console.log(`  ${tipo}: ${entry.count} aulas | profs: ${[...entry.professores].join(', ')} | turmas: ${[...entry.turmas].join(', ')}`);
      }
      console.log(`[DIAG] Ocupações globais (outros turnos): ${ocupacoesExistentesPorProfessorDia.size} entradas prof+dia`);

      // ── RELATÓRIO DE CAPACIDADE ───────────────────────────────────────
      console.log(`[DIAG] ─── AUDITORIA DE CAPACIDADE VS DEMANDA ─────────────`);
      const capacityMap = new Map<string, { nome: string, capacidade: number, demandaPresencial: number, demandaNp: number, alocados: number, componentes: Map<string, number> }>();

      for (const b of todosOsBlocos) {
        if (!capacityMap.has(b.turma_id)) {
          // assume base turno
          let cap = turno.aulas_por_dia * turno.dias_semana.length;
          capacityMap.set(b.turma_id, { nome: b.turma_nome, capacidade: cap, demandaPresencial: 0, demandaNp: 0, alocados: 0, componentes: new Map() });
        }
        const info = capacityMap.get(b.turma_id)!;
        if (b.tipo === 'presencial') info.demandaPresencial += b.size;
        else info.demandaNp += b.size;
        info.componentes.set(b.componente_nome, (info.componentes.get(b.componente_nome) || 0) + b.size);
      }

      for (const a of aulasAlocadas) {
        const info = capacityMap.get(a.turma_id);
        if (info) {
          // Contar alocados para a capacidade base do turno presencial
          if (a.tipo === 'presencial') info.alocados += 1;
        }
      }

      const turmasLotadasReportadas = motivosCounter.get('falta_slot_turma')?.turmas || new Set();

      /**
       * A condição era `demanda > capacidade`, e por isso a seção ficava muda
       * exatamente no caso mais grave: demanda IGUAL à capacidade. Aí a turma não
       * tem uma única folga, e só uma arrumação perfeita fecha a grade — qualquer
       * BAN ou folga de professor num slot que a turma precisa já derruba tudo.
       * É a informação mais acionável do relatório e era a que não saía.
       */
      for (const [turmaId, info] of capacityMap.entries()) {
        if (turmasLotadasReportadas.has(info.nome) || (info.demandaPresencial >= info.capacidade)) {
          const pendentesDaTurma = pendentes.filter(p => p.turma_id === turmaId && p.tipo === 'presencial');

          console.log(`\n  TURMA: ${info.nome}`);
          console.log(`    Capacidade total do turno: ${info.capacidade} slots`);
          console.log(`    Demanda da matriz (presencial): ${info.demandaPresencial} aulas`);
          if (info.demandaNp > 0) console.log(`    Demanda da matriz (não-presencial): ${info.demandaNp} aulas`);

          const diff = info.capacidade - info.demandaPresencial;
          console.log(`    Diferença (Capacidade - Demanda): ${diff > 0 ? '+' + diff : diff} slots ${diff < 0 ? '(EXCESSO DE CARGA!)' : ''}`);
          if (diff === 0) {
            console.log(`    FOLGA ZERO — a turma preenche todos os slots do turno. Só uma arrumação`);
            console.log(`    perfeita fecha: qualquer BAN ou folga de professor num slot de que esta`);
            console.log(`    turma precise torna a grade impossível, não apenas difícil.`);
          }
          console.log(`    Slots já ocupados na grade gerada: ${info.alocados}`);

          const sobraram = info.capacidade - info.alocados;
          console.log(`    Slots vagos restantes na turma: ${sobraram}`);

          if (pendentesDaTurma.length > 0) {
            console.log(`    Blocos que tentaram encaixar nesses ${sobraram} slots vagos e qual foi o bloqueio predominante:`);
            for (const p of pendentesDaTurma) {
              const det = pendenciasDetalhadas.find(pd => pd.turma_nome === info.nome && pd.disciplina_nome === p.componente_nome);
              console.log(`      - [${p.componente_nome}] Prof: ${p.professor_nome} | Faltou alocar: ${p.size} aula(s) | Bloqueio predominante: ${det?.motivo_real || 'Desconhecido'}`);
            }
          }
        }
      }
      console.log(`───────────────────────────────────────────────────────────`);
    }

    /**
     * As descrições dizem o que FOI OBSERVADO na melhor tentativa, não o que está
     * provado. O motor amostra dezenas de milhares de arranjos entre um número de
     * combinações que não cabe em computador nenhum: "impedindo o alocamento" dava
     * a entender que não havia saída, e mandava o operador desfazer restrições que
     * talvez não fossem o gargalo.
     */
    const descSugestoes: Record<string, { d: string, s: string }> = {
      'excess_ban': { d: 'Restrição manual (BAN) foi o bloqueio mais frequente.', s: 'Reduza as restrições manuais (BAN) dos professores afetados, liberando mais dias.' },
      'excess_folga': { d: 'Livre Docência (Folga) foi o bloqueio mais frequente.', s: 'Verifique se as folgas da Livre Docência estão excessivas ou retire-as.' },
      'choque_turno_oposto': { d: 'Choque com outras grades já publicadas (outro turno).', s: 'Verifique se o professor foi publicado em outro turno com o mesmo horário. Isso pode ser falso conflito se uma versão antiga do próprio turno está publicada.' },
      // A sugestão antiga era "a carga total do professor pode exceder os slots
      // disponíveis", e costumava ser falsa: na escola 17032717 o professor
      // apontado tinha 35 aulas para 40 horários livres. O motivo real é outro —
      // ele já está com outra turma nos horários que sobraram nesta.
      'choque_turno_local': { d: 'Professor já está com outra turma nos horários que sobraram.', s: 'Não é excesso de carga: os horários vagos desta turma coincidem com aulas que o professor dá em outras turmas. Distribua as disciplinas dele entre mais professores, ou libere restrições para dar mais alternativas de encaixe.' },
      // Dizia "carga excede a capacidade". Quando a carga é IGUAL à capacidade —
      // o caso mais comum e o mais difícil — nada excede, e ainda assim a turma
      // fica sem espaço: não sobra uma única folga para a busca manobrar.
      'falta_slot_turma': { d: 'Turma sem horário livre para encaixar estas aulas.', s: 'Compare, na Matriz da Série, o total de aulas da turma com aulas por dia × dias da semana. Se forem iguais, a turma não tem nenhuma folga e só um encaixe perfeito fecha a grade — acrescentar uma aula ao dia ou um dia à semana costuma resolver.' },
      'geminacao_impossivel': { d: 'Geminação forçada de aulas não encontrou espaços consecutivos suficientes.', s: 'Desative a Geminação para as disciplinas afetadas ou reduza o tamanho do bloco.' },
      'restricao_serie': { d: 'A série impede alocação de aulas nesse slot.', s: 'Revise as restrições de série no módulo de Refino.' },
      'sem_professor': { d: 'Componente sem professor atribuído na turma.', s: 'Atribua um professor ao componente da turma afetada.' },
      // A sugestão anterior mandava ajustar a heurística e a diversidade da busca:
      // instrução para quem mexe no código, não para quem monta o horário.
      'heuristica_busca': { d: 'Havia lugar livre, mas a busca não chegou a esta combinação.', s: 'Este é o caso em que gerar de novo tem mais chance de resolver: existe espaço para a aula, a busca é que não encontrou o caminho até ele. Se repetir e continuar sobrando, aí o problema está nos dados.' },
    };

    const causasIdentificadas = Array.from(motivosCounter.values()).map(m => ({
      tipo: m.tipo,
      descricao: descSugestoes[m.tipo]?.d || m.tipo,
      sugestao: descSugestoes[m.tipo]?.s || 'Verifique as configurações deste bloco.',
      professoresAfetados: Array.from(m.professores),
      turmasAfetadas: Array.from(m.turmas),
      impacto: m.count,
    })).sort((a, b) => b.impacto - a.impacto);

    return { causasIdentificadas, pendenciasDetalhadas };
  };

  return {
    ...semDiagnostico,
    diagnostico: diagnosticarFalhas(
      melhorEstado.pendentes,
      melhorEstado.aulas,
      melhorEstado.ocupacaoProfessoresPorDia,
      melhorEstado.todosOsBlocos
    ),
  };
}

