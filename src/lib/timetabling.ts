
import {
    type Turno,
    type TurmaComDados,
    type ProfessorComDados,
    type HorarioAulaGerada,
    type ConfiguracaoGerminacao,
    type LivreDocenciaPeriodo,
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
    return prof?.restricoes?.[turnoId]?.[dia]?.[idx] === 'indisponivel';
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
    const periodo = getPeriodoDaAula(turno, idx);
    return prof.livre_docencia?.some(ld => ld.dia === dia && ld.periodo === periodo) ?? false;
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
    globalProgress: number = 0
  ): {
    success: boolean;
    aulas: HorarioAulaGeradaAlgoritmo[];
    error?: string;
    attemptsMade: number;
  } {
    const turnosById = new Map<string, Turno>(todosTurnos.map(t => [t.id, t]));
    const professoresById = new Map<string, ProfessorComDados>(professores.map(p => [p.id, p]));
  
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
    const construirTodosOsBlocos = (forcarIndividuais: boolean): BlocoGeracao[] => {
      const blocos: BlocoGeracao[] = [];
  
      for (const t of turmas) {
        for (const c of t.serie.componentes) {
          const profInfo = t.professores.find(p => p.componente_id === c.componente_id);
          const profId = profInfo?.professor_id || null;
          const profKey = profId ? teacherKeyMap.get(profId) || null : null;
          const profNome = (profInfo as any)?.professor?.nome_horario || 'Sem Professor';
  
          // Presenciais — no turno principal
          const nPresenciais = c.aulas_presenciais || 0;
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
          const nNP = c.aulas_nao_presenciais || 0;
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
      ignorarDiasPreferidos: boolean = false
    ) => {
      const aulasGeradas: HorarioAulaGeradaAlgoritmo[] = [];
  
      /**
       * Mapa de ocupação de professores nesta tentativa.
       * Chave: `${professor_key}|${dia}` → lista de SlotOcupado com minutos reais
       */
      const ocupacaoProfessoresPorDia = new Map<string, SlotOcupado[]>();
  
      /** Conjuntos de slots de turma já ocupados: `turmaId|turnoId|dia|idx` */
      const ocupacaoTurmas = new Set<string>();
  
      const todosOsBlocos = construirTodosOsBlocos(forcarIndividuais);
  
      for (const b of todosOsBlocos) {
        let alocado = false;
  
        // Determinar turnos a testar para este bloco
        const turnosParaTestar: Turno[] =
          b.tipo === 'presencial'
            ? [turno]
            : [turnosById.get(b.turno_np_id!) || turnoNP];
  
        for (const targetTurno of turnosParaTestar) {
          if (alocado) break;

          const diasDisponiveis = [...(targetTurno.dias_semana || [])];

          // Soft constraint: ordenar dias preferidos do professor primeiro
          let dias: string[];
          if (!ignorarDiasPreferidos && b.professor_id) {
            const prof = professoresById.get(b.professor_id);
            const preferidos = prof?.dias_preferidos?.filter(d => diasDisponiveis.includes(d)) || [];
            const restantes = diasDisponiveis.filter(d => !preferidos.includes(d));

            // Para dias não-preferidos: priorizar os que o professor já usa
            // (concentra em menos dias em vez de espalhar em todos)
            const profKey = b.professor_key;
            const getDiaLoad = (dia: string): number => {
              if (!profKey) return 0;
              const local  = (ocupacaoProfessoresPorDia.get(`${profKey}|${dia}`) || []).length;
              const global = (ocupacoesExistentesPorProfessorDia.get(`${profKey}|${dia}`) || []).length;
              return local + global;
            };

            dias = [
              ...preferidos.sort(() => Math.random() - 0.5),           // preferidos: aleatório entre si
              ...restantes.sort((da, db) => getDiaLoad(db) - getDiaLoad(da)), // não-preferidos: mais carregado primeiro
            ];
          } else {
            dias = diasDisponiveis.sort(() => Math.random() - 0.5);
          }
  
          for (const d of dias) {
            if (alocado) break;
  
            const maxStart = targetTurno.aulas_por_dia - b.size;
            const startSlots = Array.from({ length: maxStart + 1 }, (_, k) => k).sort(() => Math.random() - 0.5);
  
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
  
        if (alocado) b.placed = true;
      }
  
      const pendentes = todosOsBlocos.filter(b => !b.placed);
      return { success: pendentes.length === 0, aulas: aulasGeradas, pendentes };
    };
  
    // ── Loop de tentativas ───────────────────────────────────────────────────
    //
    // Relaxamento progressivo:
    //   • permitirUsoPlanejamento: relaxa após 15% (SOFT — planejamento pode ser usado)
    //   • forcarIndividuais:       relaxa após 75% (desfaz geminação)
    //   • ignorarDiasPreferidos:   relaxa após 70% (ignora preferência de concentração de dias)
    //
    // O que NUNCA é relaxado:
    //   • BAN (indisponivel)     → hard constraint permanente
    //   • FOLGA (livre docência) → hard constraint permanente
    //   • conflitos de professor → hard constraint permanente
    //   • conflitos de turma     → hard constraint permanente
    //   • restrições de série    → hard constraint permanente
    //
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const curProg = globalProgress + (attempt / maxAttempts);
      const permitirPlan    = force || curProg > 0.15;
      const forcarIndiv     = force || curProg > 0.75;
      const ignorarDiasPref = force || curProg > 0.70;
  
      const res = executarTentativa(permitirPlan, forcarIndiv, ignorarDiasPref);
      if (res.success) return { success: true, aulas: res.aulas, attemptsMade: attempt + 1 };
    }
  
    // Tentativa final de fallback — relaxa tudo que é SOFT, mas mantém HARD constraints
    const finalFail = executarTentativa(true, true, true);
    return {
      success: false,
      aulas: finalFail.aulas,
      attemptsMade: maxAttempts,
      error: 'Algumas aulas não puderam ser alocadas devido a conflitos de professores ou restrições de horários.',
    };
  }
