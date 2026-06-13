
import {
  type Turno,
  type TurmaComDados,
  type ProfessorComDados,
  type HorarioAulaGerada,
  type ConfiguracaoGerminacao,
  type LivreDocenciaPeriodo,
  type DiagnosticoFalha,
  type PendenciaDetalhada,
  type SerieAulaFixa
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
  // Tracking de aulas fixas/compartilhadas (espelha colunas do DB)
  aula_fixa_id?: string | null;
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
  professor_id: string | null;
  professor_key: string | null;
  professor_nome: string;
  size: number;
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
  maxAttempts: number = 100000,
  globalProgress: number = 0,
  aulasFixas: SerieAulaFixa[] = [],
  permitirMesmoProfDisciplinasMesmoDia: boolean = false
): {
  success: boolean;
  aulas: HorarioAulaGeradaAlgoritmo[];
  error?: string;
  attemptsMade: number;
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

  // ── Construção dos blocos ────────────────────────────────────────────────
  const construirTodosOsBlocos = (forcarIndividuais: boolean, rng: () => number = Math.random): BlocoGeracao[] => {
    const blocos: BlocoGeracao[] = [];

    for (const t of turmas) {
      for (const c of t.serie.componentes) {
        const profInfo = t.professores.find(p => p.componente_id === c.componente_id);
        const profId = profInfo?.professor_id || null;
        const profKey = profId ? teacherKeyMap.get(profId) || null : null;
        const profNome = (profInfo as any)?.professor?.nome_horario || 'Sem Professor';

        // Subtrair aulas fixas: Fase 0 pré-aloca esses slots, então o loop
        // principal não deve criar blocos duplicados para os mesmos slots.
        const nFixaPresencial = aulasFixas.filter(af =>
          af.serie_id === t.serie.id && af.componente_id === c.componente_id && af.tipo_aula === 'presencial'
        ).length;
        const nFixaNP = aulasFixas.filter(af =>
          af.serie_id === t.serie.id && af.componente_id === c.componente_id && af.tipo_aula === 'nao_presencial'
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

    // Ordenar: menor priority primeiro; entre iguais, bloco maior primeiro
    blocos.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return b.size - a.size;
    });

    // Shuffle Fisher-Yates dentro de cada grupo de prioridade.
    // Preserva a ordenação inter-grupos (NP antes de presencial) mas varia
    // qual bloco chega primeiro aos slots — crítico em grades restritas.
    const grupos = new Map<number, number[]>();
    blocos.forEach((b, i) => {
      if (!grupos.has(b.priority)) grupos.set(b.priority, []);
      grupos.get(b.priority)!.push(i);
    });
    for (const indices of grupos.values()) {
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
  // Conjunto de slots de professor que são compartilhados intencionalmente:
  // chave = `${professorKey}|${dia}|${aula_index}` — usada para não rejeitar
  // o professor por já estar ocupado quando a ocupação é uma aula coletiva
  // da mesma série/componente.
  const slotsCompartilhadosProfessor = new Set<string>();

  const executarTentativa = (
    permitirUsoPlanejamento: boolean,
    forcarIndividuais: boolean,
    ignorarDiasPreferidos: boolean = false,
    curProgLocal: number = 0,
    permitirUsoPersonalizado: boolean = false,
    rng: () => number = Math.random
  ) => {
    const aulasGeradas: HorarioAulaGeradaAlgoritmo[] = [];
    const ocupacaoProfessoresPorDia = new Map<string, SlotOcupado[]>();
    const ocupacaoTurmas = new Set<string>();
    slotsCompartilhadosProfessor.clear();

    const todosOsBlocos = construirTodosOsBlocos(forcarIndividuais, rng);

    // ╔═══════════════════════════════════════════════════════════════════
    // FASE 0 — Pré-alocação de aulas fixas
    // As fixas entram ANTES do loop aleatório e marcam seus slots como
    // ocupados, de modo que o loop não tenta reocupá-los.
    // ╚═══════════════════════════════════════════════════════════════════
    for (const aulaFixa of aulasFixas) {
      // Turmas do turno atual que pertencem a esta série
      const turmasDaSerie = turmas.filter(t => t.serie.id === aulaFixa.serie_id);
      if (turmasDaSerie.length === 0) continue;

      const { dia_semana: dia, aula_index: idx, tipo_aula, compartilhada } = aulaFixa;
      const targetTurno = tipo_aula === 'presencial' ? turno : (resolverTurnoNP(turno, todosTurnos));
      const [ini, fim] = getSlotMinutes(targetTurno, idx);

      // Usa o próprio id da aula fixa como agrupador das turmas — já é UUID válido.
      const aulaCompartilhadaId = compartilhada ? aulaFixa.id : null;

      // Resolver professor para aula compartilhada
      let professorCompartilhadoId: string | null = null;
      let professorCompartilhadoKey: string | null = null;
      if (compartilhada) {
        if (aulaFixa.professor_responsavel_id) {
          professorCompartilhadoId = aulaFixa.professor_responsavel_id;
          const p = professoresById.get(professorCompartilhadoId);
          professorCompartilhadoKey = p ? getTeacherKey(p) : `id:${professorCompartilhadoId}`;
        } else {
          // Tentar inferir professor único
          const profIds = new Set(
            turmasDaSerie
              .map(t => t.professores.find(p => p.componente_id === aulaFixa.componente_id)?.professor_id)
              .filter(Boolean) as string[]
          );
          if (profIds.size === 1) {
            professorCompartilhadoId = [...profIds][0];
            const p = professoresById.get(professorCompartilhadoId);
            professorCompartilhadoKey = p ? getTeacherKey(p) : `id:${professorCompartilhadoId}`;
          }
          // Se profIds.size > 1, não registramos professor (já deve ter sido bloqueado na validation)
        }
      }

      // Pré-alocar para cada turma da série
      for (const turma of turmasDaSerie) {
        const slotKey = `${turma.id}|${targetTurno.id}|${dia}|${idx}`;

        // Verificar conflito de turma
        if (ocupacaoTurmas.has(slotKey)) {
          console.warn(`[FIXAS] Conflito de turma na pré-alocação: ${turma.nome} | ${dia}-${idx}`);
          continue; // Não interrompe a tentativa; o diagnosótico pegará
        }

        // Resolver professor para aula individual
        let profId: string | null = null;
        let profKey: string | null = null;
        if (compartilhada) {
          profId = professorCompartilhadoId;
          profKey = professorCompartilhadoKey;
        } else {
          const profInfo = turma.professores.find(p => p.componente_id === aulaFixa.componente_id);
          profId = profInfo?.professor_id || null;
          const profObj = profId ? professoresById.get(profId) : undefined;
          profKey = profObj ? getTeacherKey(profObj) : (profId ? `id:${profId}` : null);
        }

        // Registrar aula
        aulasGeradas.push({
          turma_id: turma.id,
          componente_id: aulaFixa.componente_id,
          professor_id: profId,
          dia_semana: dia,
          aula_index: idx,
          tipo: tipo_aula,
          turno_id: targetTurno.id,
          aula_fixa_id: aulaFixa.id,
          compartilhada,
          aula_compartilhada_id: aulaCompartilhadaId,
        });

        ocupacaoTurmas.add(slotKey);

        // Para aula compartilhada: professor entra UMA única vez (não por turma)
        if (!compartilhada && profKey) {
          pushMapArray(ocupacaoProfessoresPorDia, `${profKey}|${dia}`, {
            turno_id: targetTurno.id,
            aula_index: idx,
            inicio_min: ini,
            fim_min: fim,
          });
        }

      }

      // Professor da aula compartilhada: registrar UMA única vez
      if (compartilhada && professorCompartilhadoKey) {
        const mapKey = `${professorCompartilhadoKey}|${dia}`;
        if (!(ocupacaoProfessoresPorDia.get(mapKey) || []).some(o => o.aula_index === idx && o.turno_id === targetTurno.id)) {
          pushMapArray(ocupacaoProfessoresPorDia, mapKey, {
            turno_id: targetTurno.id,
            aula_index: idx,
            inicio_min: ini,
            fim_min: fim,
          });
        }
        // Marcar slot como compartilhado para não rejeitar outras turmas da mesma aula
        slotsCompartilhadosProfessor.add(`${professorCompartilhadoKey}|${dia}|${idx}`);
      }
    }

    // ── FIM da Fase 0 ─────────────────────────────────────────────────────────────

    // ── GARANTIA PÓS-FASE-0 ──────────────────────────────────────────────────────
    // A Fase 0 tem uma saída silenciosa: se ocupacaoTurmas.has(slotKey) for true
    // ao processar uma fixação, ela faz `continue` sem registrar a aula nem proteger
    // o slot. Este passo force-registra qualquer fixação que tenha sido ignorada.
    for (const aulaFixa of aulasFixas) {
      const turmasDaSerieGarantia = turmas.filter(t => t.serie.id === aulaFixa.serie_id);
      if (turmasDaSerieGarantia.length === 0) continue;

      const targetTurnoGarantia = aulaFixa.tipo_aula === 'presencial'
        ? turno
        : (resolverTurnoNP(turno, todosTurnos));
      const [iniG, fimG] = getSlotMinutes(targetTurnoGarantia, aulaFixa.aula_index);

      for (const turma of turmasDaSerieGarantia) {
        const jaRegistrada = aulasGeradas.some(
          a => a.aula_fixa_id === aulaFixa.id && a.turma_id === turma.id
        );
        if (jaRegistrada) continue;

        const slotKeyG = `${turma.id}|${targetTurnoGarantia.id}|${aulaFixa.dia_semana}|${aulaFixa.aula_index}`;
        console.warn(
          `[FIXAS] Garantia ativada — fixação não registrada pela Fase 0:`,
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
          compartilhada: aulaFixa.compartilhada,
          aula_compartilhada_id: aulaFixa.compartilhada ? aulaFixa.id : null,
        });

        ocupacaoTurmas.add(slotKeyG);

        if (!aulaFixa.compartilhada && profKeyG) {
          pushMapArray(ocupacaoProfessoresPorDia, `${profKeyG}|${aulaFixa.dia_semana}`, {
            turno_id: targetTurnoGarantia.id,
            aula_index: aulaFixa.aula_index,
            inicio_min: iniG,
            fim_min: fimG,
          });
        }
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
        if (localOcc.some(occ => {
          // Ignorar falso conflito se o slot ocupado é uma aula coletiva compartilhada
          // da qual este professor é o responsável (ele só aparece UMA vez no mapa).
          const sharedKey = `${meta.professor_key}|${dia}|${occ.aula_index}`;
          if (slotsCompartilhadosProfessor.has(sharedKey)) return false;
          return minutesConflitam(
            iniCand, fimCand,
            occ.inicio_min, occ.fim_min,
            targetTurno.id === occ.turno_id,
            idx, occ.aula_index,
          );
        })) return false;

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

    for (const b of todosOsBlocos) {
      if (b.placed) continue; // já alocado pela Fase 0 (aulas fixas)
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
          const startSlots = Array.from({ length: maxStart + 1 }, (_, k) => k).sort(() => rng() - 0.5);

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
  // Relaxamento progressivo:
  //   • permitirUsoPlanejamento:  relaxa após 15% (SOFT — planejamento pode ser usado)
  //   • permitirUsoPersonalizado: relaxa após 15% (SOFT — personalizado pode ser usado)
  //   • forcarIndividuais:        relaxa após 25% (desfaz geminação)
  //   • ignorarDiasPreferidos:    relaxa após 70% (ignora preferência de concentração de dias)
  //
  // O que NUNCA é relaxado:
  //   • BAN (indisponivel)     → hard constraint permanente
  //   • FOLGA (livre docência) → hard constraint permanente
  //   • REUNIÃO DE FLUXO      → hard constraint permanente
  //   • conflitos de professor → hard constraint permanente
  //   • conflitos de turma     → hard constraint permanente
  //   • restrições de série    → hard constraint permanente
  //
  const baseAttempt = Math.round(globalProgress * 100000);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const curProg = globalProgress + (attempt / maxAttempts);
    const permitirPlan = force || curProg > 0.15;
    const permitirPersonalizado = force || curProg > 0.15;
    const forcarIndiv = force || curProg > 0.25;
    const ignorarDiasPref = force || curProg > 0.70;

    const seed = baseAttempt + attempt; // inteiro único 0–99.999 por tentativa global
    const rng = makeRng(seed);

    const res = executarTentativa(permitirPlan, forcarIndiv, ignorarDiasPref, curProg, permitirPersonalizado, rng);
    if (res.success) return { success: true, aulas: res.aulas, attemptsMade: attempt + 1 };
  }

  // Tentativa final de fallback — semente 100.000 (fora do range do loop)
  const fallbackRng = makeRng(100000);
  const finalFail = executarTentativa(true, true, true, 1, true, fallbackRng);

  /**
   * ── MOTOR DE DIAGNÓSTICO ────────────────────────────────────────────────────
   * 
   * IMPORTANTE: Não usamos o `ocupacaoTurmas` do finalFail (que é um estado
   * aleatório de uma tentativa), pois ele causa falsos positivos de "turma lotada".
   *
   * Em vez disso, para cada bloco pendente:
   * 1. Usamos um fresh set APENAS com as aulas que o finalFail *conseguiu* alocar
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

      for (const [turmaId, info] of capacityMap.entries()) {
        if (turmasLotadasReportadas.has(info.nome) || (info.demandaPresencial > info.capacidade)) {
          const pendentesDaTurma = pendentes.filter(p => p.turma_id === turmaId && p.tipo === 'presencial');

          console.log(`\n  TURMA: ${info.nome}`);
          console.log(`    Capacidade total do turno: ${info.capacidade} slots`);
          console.log(`    Demanda da matriz (presencial): ${info.demandaPresencial} aulas`);
          if (info.demandaNp > 0) console.log(`    Demanda da matriz (não-presencial): ${info.demandaNp} aulas`);

          const diff = info.capacidade - info.demandaPresencial;
          console.log(`    Diferença (Capacidade - Demanda): ${diff > 0 ? '+' + diff : diff} slots ${diff < 0 ? '(EXCESSO DE CARGA!)' : ''}`);
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

    const descSugestoes: Record<string, { d: string, s: string }> = {
      'excess_ban': { d: 'Restrição manual (BAN) impedindo o alocamento das aulas.', s: 'Reduza as restrições manuais (BAN) dos professores afetados, liberando mais dias.' },
      'excess_folga': { d: 'Livre Docência (Folga) ocupando os slots preferenciais.', s: 'Verifique se as folgas da Livre Docência estão excessivas ou retire-as.' },
      'choque_turno_oposto': { d: 'Choque com outras grades já publicadas (outro turno).', s: 'Verifique se o professor foi publicado em outro turno com o mesmo horário. Isso pode ser falso conflito se uma versão antiga do próprio turno está publicada.' },
      'choque_turno_local': { d: 'Professor sem espaço livre na própria grade sendo gerada.', s: 'A carga total do professor pode exceder o número de slots disponíveis no turno.' },
      'falta_slot_turma': { d: 'Turma sem slots disponíveis — carga excede a capacidade do turno.', s: 'Verifique a Matriz da Série. O total de aulas da turma pode estar excedendo aulas_por_dia × dias_por_semana.' },
      'geminacao_impossivel': { d: 'Geminação forçada de aulas não encontrou espaços consecutivos suficientes.', s: 'Desative a Geminação para as disciplinas afetadas ou reduza o tamanho do bloco.' },
      'restricao_serie': { d: 'A série impede alocação de aulas nesse slot.', s: 'Revise as restrições de série no módulo de Refino.' },
      'sem_professor': { d: 'Componente sem professor atribuído na turma.', s: 'Atribua um professor ao componente da turma afetada.' },
      'heuristica_busca': { d: 'Existiam posições viáveis, mas a ordem de exploração da busca não conseguiu fechar a grade.', s: 'Ajuste a heurística de ordenação dos dias/slots ou aumente a diversidade aleatória da busca.' },
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

  let diagnosticoFunc: DiagnosticoFalha | undefined = undefined;
  if (!finalFail.success && finalFail.pendentes && finalFail.pendentes.length > 0) {
    diagnosticoFunc = diagnosticarFalhas(
      finalFail.pendentes,
      finalFail.aulas,
      finalFail.ocupacaoProfessoresPorDia!,
      finalFail.todosOsBlocos!
    );
  }

  return {
    success: false,
    aulas: finalFail.aulas,
    attemptsMade: maxAttempts,
    error: 'Algumas aulas não puderam ser alocadas devido a conflitos de professores ou restrições de horários.',
    diagnostico: diagnosticoFunc,
  };
}

