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
  
  type SlotOcupado = {
    turno_id: string;
    aula_index: number;
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
    placed?: boolean;
  };
  
  type OcupacaoExistenteNormalizada = {
    professor_key: string;
    dia_semana: string;
    aula_index: number;
    turno_id: string;
  };
  
  function getTeacherKey(p: { id: string; cpf?: string | null }): string {
    if (p.cpf && p.cpf.trim().length >= 11) {
      return `cpf:${p.cpf.replace(/\D/g, '')}`;
    }
    return `id:${p.id}`;
  }
  
  function getPeriodoDaAula(turno: Turno, aulaIdx: number): LivreDocenciaPeriodo {
    const nome = turno.nome.toLowerCase();
  
    if (nome.includes('matutino')) return 'matutino';
    if (nome.includes('vespertino')) return 'vespertino';
    if (nome.includes('noturno')) return 'noturno';
  
    const h = turno.horarios?.[aulaIdx];
    if (h?.inicio) {
      const hora = parseInt(h.inicio.split(':')[0], 10);
      if (hora < 13) return 'matutino';
      if (hora < 18) return 'vespertino';
      return 'noturno';
    }
  
    return aulaIdx < 5 ? 'matutino' : 'vespertino';
  }
  
  function checkIntegralOverlap(idxInt: number, nomeParcial: string, idxParcial: number): boolean {
    if (nomeParcial.includes('matutino')) {
      return idxInt === idxParcial;
    }
    if (nomeParcial.includes('vespertino')) {
      return idxInt === (idxParcial + 5);
    }
    return false;
  }
  
  function slotsConflitam(
    turnoA: Turno,
    indexA: number,
    turnoB: Turno,
    indexB: number
  ): boolean {
    const hA = turnoA.horarios?.[indexA];
    const hB = turnoB.horarios?.[indexB];
  
    if (hA?.inicio && hA?.fim && hB?.inicio && hB?.fim) {
      return hA.inicio < hB.fim && hA.fim > hB.inicio;
    }
  
    const nomeA = turnoA.nome.toLowerCase();
    const nomeB = turnoB.nome.toLowerCase();
  
    if (nomeA === nomeB) return indexA === indexB;
  
    const isAInt = nomeA.includes('integral');
    const isBInt = nomeB.includes('integral');
  
    if (isAInt && !isBInt) return checkIntegralOverlap(indexA, nomeB, indexB);
    if (!isAInt && isBInt) return checkIntegralOverlap(indexB, nomeA, indexA);
  
    if (
      (nomeA.includes('matutino') && nomeB.includes('vespertino')) ||
      (nomeA.includes('vespertino') && nomeB.includes('matutino'))
    ) {
      return false;
    }
  
    return indexA === indexB;
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
    const professorWorkloadMap = new Map<string, number>();
  
    professores.forEach(p => {
      teacherKeyMap.set(p.id, getTeacherKey(p));
    });
  
    const getTurnosDisponiveisParaNP = (baseTurno: Turno) => {
      const n = baseTurno.nome.toLowerCase();
  
      const outros = todosTurnos
        .filter(t => t.id !== baseTurno.id)
        .sort((a, b) => {
          const aNome = a.nome.toLowerCase();
          const bNome = b.nome.toLowerCase();
  
          if (n.includes('matutino') && aNome.includes('vespertino') && !bNome.includes('vespertino')) return -1;
          if (n.includes('vespertino') && aNome.includes('matutino') && !bNome.includes('matutino')) return -1;
  
          return 0;
        });
  
      return outros;
    };
  
    const turnosParaNPBase = getTurnosDisponiveisParaNP(turno);
  
    const getRealTurnoForOccupation = (o: any): Turno | undefined => {
      if (o.turno_id && turnosById.has(o.turno_id)) {
        return turnosById.get(o.turno_id);
      }
  
      if (o.tipo === 'presencial' && o.horario?.turno?.id) {
        return turnosById.get(o.horario.turno.id) || o.horario.turno;
      }
  
      const base = o.horario?.turno;
      if (!base) return undefined;
  
      if (o.tipo === 'presencial') return base;
  
      const n = base.nome.toLowerCase();
      const oposto = todosTurnos.find(t =>
        t.escola_id === o.horario.escola_id &&
        (
          (n.includes('matutino') && t.nome.toLowerCase().includes('vespertino')) ||
          (n.includes('vespertino') && t.nome.toLowerCase().includes('matutino'))
        )
      );
  
      return oposto || base;
    };
  
    const ocupacoesExistentesNormalizadas: OcupacaoExistenteNormalizada[] = [];
    const ocupacoesExistentesPorProfessorDia = new Map<string, OcupacaoExistenteNormalizada[]>();
    const ocupacoesPublicadasCountPorProfessor = new Map<string, number>();
  
    for (const o of ocupacoesExistentes) {
      const professor_id = o.professor_id;
      const professorCpf = o.professor?.cpf;
      const professor_key = getTeacherKey({ id: professor_id, cpf: professorCpf });
      const realTurno = getRealTurnoForOccupation(o);
  
      if (!realTurno) continue;
  
      const normalizada: OcupacaoExistenteNormalizada = {
        professor_key,
        dia_semana: o.dia_semana,
        aula_index: o.aula_index,
        turno_id: realTurno.id,
      };
  
      ocupacoesExistentesNormalizadas.push(normalizada);
  
      const mapKey = `${professor_key}|${o.dia_semana}`;
      pushMapArray(ocupacoesExistentesPorProfessorDia, mapKey, normalizada);
  
      ocupacoesPublicadasCountPorProfessor.set(
        professor_key,
        (ocupacoesPublicadasCountPorProfessor.get(professor_key) || 0) + 1
      );
    }
  
    for (const p of professores) {
      const key = teacherKeyMap.get(p.id)!;
      let currentAllocationCount = 0;
  
      for (const t of turmas) {
        for (const tp of t.professores) {
          if (tp.professor_id !== p.id) continue;
  
          const comp = t.serie.componentes.find(c => c.componente_id === tp.componente_id);
          if (comp) {
            currentAllocationCount += (comp.aulas_presenciais || 0) + (comp.aulas_nao_presenciais || 0);
          }
        }
      }
  
      professorWorkloadMap.set(
        key,
        (ocupacoesPublicadasCountPorProfessor.get(key) || 0) + currentAllocationCount
      );
    }
  
    const construirTodosOsBlocos = (forcarIndividuais: boolean): BlocoGeracao[] => {
      const blocos: BlocoGeracao[] = [];
  
      for (const t of turmas) {
        for (const c of t.serie.componentes) {
          const profInfo = t.professores.find(p => p.componente_id === c.componente_id);
          const profId = profInfo?.professor_id || null;
          const profKey = profId ? teacherKeyMap.get(profId) || null : null;
          const profNome = profInfo?.professor?.nome_horario || 'Sem Professor';
          const workload = profKey ? (professorWorkloadMap.get(profKey) || 0) : 0;
  
          const presenciais = criarBlocos(
            c.aulas_presenciais || 0,
            c.componente_id,
            configGerminacao,
            forcarIndividuais
          );
  
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
              workload,
              priority: 1,
            });
          }
  
          const naoPresenciais = criarBlocos(
            c.aulas_nao_presenciais || 0,
            c.componente_id,
            configGerminacao,
            forcarIndividuais
          );
  
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
              workload,
              priority: 2,
            });
          }
        }
      }
  
      blocos.sort((a, b) => {
        if (b.workload !== a.workload) return b.workload - a.workload;
        if (a.priority !== b.priority) return a.priority - b.priority;
        return b.size - a.size;
      });
  
      return blocos;
    };
  
    const executarTentativa = (
      permitirUsoPlanejamento: boolean,
      ignorarLivreDocencia: boolean,
      forcarIndividuais: boolean
    ) => {
      const aulasGeradas: HorarioAulaGeradaAlgoritmo[] = [];
  
      // professor_key|dia -> [{ turno_id, aula_index }]
      const ocupacaoProfessoresPorDia = new Map<string, SlotOcupado[]>();
  
      // turma_id|dia -> [{ turno_id, aula_index }]
      const ocupacaoTurmasPorDia = new Map<string, SlotOcupado[]>();
  
      // índice exato para conflito idêntico e consulta rápida
      const ocupacaoTurmas = new Set<string>();
  
      const todosOsBlocos = construirTodosOsBlocos(forcarIndividuais);
  
      for (const b of todosOsBlocos) {
        let alocado = false;
        let turnosParaTestar = b.tipo === 'presencial' ? [turno] : turnosParaNPBase;
  
        if (turnosParaTestar.length === 0 && b.tipo === 'nao_presencial') {
          turnosParaTestar = [turno];
        }
  
        for (const targetTurno of turnosParaTestar) {
          if (alocado) break;
  
          const dias = [...(targetTurno.dias_semana || [])].sort(() => Math.random() - 0.5);
          const slots: Array<{ d: string; i: number; weight: number }> = [];
  
          for (const d of dias) {
            for (let i = 0; i <= targetTurno.aulas_por_dia - b.size; i++) {
              let weight = Math.random() * 100;
  
              if (b.professor_id) {
                const prof = professoresById.get(b.professor_id);
  
                if (!ignorarLivreDocencia && prof?.sem_preferencia_livre_docencia === false) {
                  for (let k = 0; k < b.size; k++) {
                    const periodo = getPeriodoDaAula(targetTurno, i + k);
                    const bateLivreDocencia = prof.livre_docencia?.some(
                      ld => ld.dia === d && ld.periodo === periodo
                    );
                    if (bateLivreDocencia) {
                      weight += 10000;
                      break;
                    }
                  }
                }
  
                for (let k = 0; k < b.size; k++) {
                  const res = prof?.restricoes?.[targetTurno.id]?.[d]?.[i + k];
                  if (res === 'planejamento') {
                    weight += permitirUsoPlanejamento ? 10 : 5000;
                  }
                }
              }
  
              slots.push({ d, i, weight });
            }
          }
  
          slots.sort((a, b) => a.weight - b.weight);
  
          for (const slot of slots) {
            if (slot.weight >= 5000 && !ignorarLivreDocencia && !permitirUsoPlanejamento) {
              continue;
            }
  
            const { d, i } = slot;
            let livre = true;
  
            for (let k = 0; k < b.size; k++) {
              const idx = i + k;
  
              // 1) Conflito exato de turma no mesmo turno/slot
              const turmaSlotKey = `${b.turma_id}|${targetTurno.id}|${d}|${idx}`;
              if (ocupacaoTurmas.has(turmaSlotKey)) {
                livre = false;
                break;
              }
  
              // 2) Conflito de turma por sobreposição entre turnos
              const turmaDiaKey = `${b.turma_id}|${d}`;
              const ocupacoesTurmaNoDia = ocupacaoTurmasPorDia.get(turmaDiaKey) || [];
  
              const conflitoTurma = ocupacoesTurmaNoDia.some(occ => {
                const occTurno = turnosById.get(occ.turno_id);
                return !!occTurno && slotsConflitam(targetTurno, idx, occTurno, occ.aula_index);
              });
  
              if (conflitoTurma) {
                livre = false;
                break;
              }
  
              // 3) Restrição da série
              if (b.tipo === 'presencial') {
                if (b.serie_restricoes?.[d]?.[idx] === 'proibido') {
                  livre = false;
                  break;
                }
              }
  
              // 4) Conflitos e restrições do professor
              if (b.professor_key) {
                const professorDiaKey = `${b.professor_key}|${d}`;
  
                // 4.1 conflito global já publicado
                const ocupacoesExistentesNoDia = ocupacoesExistentesPorProfessorDia.get(professorDiaKey) || [];
                const conflitoGlobal = ocupacoesExistentesNoDia.some(occ => {
                  const occTurno = turnosById.get(occ.turno_id);
                  return !!occTurno && slotsConflitam(targetTurno, idx, occTurno, occ.aula_index);
                });
  
                if (conflitoGlobal) {
                  livre = false;
                  break;
                }
  
                // 4.2 conflito local da mesma geração
                const ocupacoesProfessorNoDia = ocupacaoProfessoresPorDia.get(professorDiaKey) || [];
                const conflitoLocalProfessor = ocupacoesProfessorNoDia.some(occ => {
                  const occTurno = turnosById.get(occ.turno_id);
                  return !!occTurno && slotsConflitam(targetTurno, idx, occTurno, occ.aula_index);
                });
  
                if (conflitoLocalProfessor) {
                  livre = false;
                  break;
                }
  
                // 4.3 restrições individuais
                const prof = professoresById.get(b.professor_id!);
                const restricao = prof?.restricoes?.[targetTurno.id]?.[d]?.[idx];
  
                if (restricao === 'indisponivel') {
                  livre = false;
                  break;
                }
  
                if (restricao === 'planejamento' && !permitirUsoPlanejamento) {
                  livre = false;
                  break;
                }
              }
            }
  
            if (livre) {
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
  
                const turmaSlotKey = `${b.turma_id}|${targetTurno.id}|${d}|${idx}`;
                ocupacaoTurmas.add(turmaSlotKey);
  
                const turmaDiaKey = `${b.turma_id}|${d}`;
                pushMapArray(ocupacaoTurmasPorDia, turmaDiaKey, {
                  turno_id: targetTurno.id,
                  aula_index: idx,
                });
  
                if (b.professor_key) {
                  const professorDiaKey = `${b.professor_key}|${d}`;
                  pushMapArray(ocupacaoProfessoresPorDia, professorDiaKey, {
                    turno_id: targetTurno.id,
                    aula_index: idx,
                  });
                }
              }
  
              alocado = true;
              break;
            }
          }
        }
  
        if (alocado) b.placed = true;
      }
  
      const pendentes = todosOsBlocos.filter(b => !b.placed);
  
      return {
        success: pendentes.length === 0,
        aulas: aulasGeradas,
        pendentes,
      };
    };
  
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const currentProgress = globalProgress + (attempt / maxAttempts);
  
      const permitirUsoPlanejamento = force || currentProgress > 0.10;
      const ignorarLivreDocencia = force || currentProgress > 0.35;
      const forcarIndividuais = force || currentProgress > 0.65;
  
      const res = executarTentativa(
        permitirUsoPlanejamento,
        ignorarLivreDocencia,
        forcarIndividuais
      );
  
      if (res.success) {
        return {
          success: true,
          aulas: res.aulas,
          attemptsMade: attempt + 1,
        };
      }
    }
  
    const resFalha = executarTentativa(true, true, true);
  
    let errorMsg = 'Capacidade Esgotada: ';
    if (resFalha.pendentes.length > 0) {
      const p = resFalha.pendentes[0];
      errorMsg += `O professor ${p.professor_nome} (${p.componente_nome}) está sem horários livres no contraturno para a aula ${p.tipo}. `;
      errorMsg += 'Isso acontece quando o docente já tem todas as janelas ocupadas por aulas presenciais em outros turnos.';
    }
  
    return {
      success: false,
      aulas: resFalha.aulas,
      attemptsMade: maxAttempts,
      error: errorMsg,
    };
  }