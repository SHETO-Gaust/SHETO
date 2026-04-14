
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
  
    // Logica simples de sobreposição para Matutino/Vespertino se não houver horários
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
      return todosTurnos.filter(t => t.id !== baseTurno.id);
    };
  
    const turnosParaNPBase = getTurnosDisponiveisParaNP(turno);
  
    const ocupacoesExistentesPorProfessorDia = new Map<string, OcupacaoExistenteNormalizada[]>();
  
    for (const o of ocupacoesExistentes) {
      const pKey = getTeacherKey({ id: o.professor_id, cpf: o.professor?.cpf });
      const mapKey = `${pKey}|${o.dia_semana}`;
      pushMapArray(ocupacoesExistentesPorProfessorDia, mapKey, {
        professor_key: pKey,
        dia_semana: o.dia_semana,
        aula_index: o.aula_index,
        turno_id: o.horario?.turno_id || o.turno_id
      });
    }
  
    const construirTodosOsBlocos = (forcarIndividuais: boolean): BlocoGeracao[] => {
      const blocos: BlocoGeracao[] = [];
  
      for (const t of turmas) {
        for (const c of t.serie.componentes) {
          const profInfo = t.professores.find(p => p.componente_id === c.componente_id);
          const profId = profInfo?.professor_id || null;
          const profKey = profId ? teacherKeyMap.get(profId) || null : null;
          const profNome = profInfo?.professor?.nome_horario || 'Sem Professor';
  
          const presenciais = criarBlocos(c.aulas_presenciais || 0, c.componente_id, configGerminacao, forcarIndividuais);
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
              workload: profKey ? (professorWorkloadMap.get(profKey) || 0) : 0,
              priority: 1,
            });
          }
  
          const naoPresenciais = criarBlocos(c.aulas_nao_presenciais || 0, c.componente_id, configGerminacao, forcarIndividuais);
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
              workload: profKey ? (professorWorkloadMap.get(profKey) || 0) : 0,
              priority: 0, // Prioridade MÁXIMA para NP (Contraturno)
            });
          }
        }
      }
  
      blocos.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return b.size - a.size;
      });
  
      return blocos;
    };
  
    const executarTentativa = (permitirUsoPlanejamento: boolean, ignorarLivreDocencia: boolean, forcarIndividuais: boolean) => {
      const aulasGeradas: HorarioAulaGeradaAlgoritmo[] = [];
      const ocupacaoProfessoresPorDia = new Map<string, SlotOcupado[]>();
      const ocupacaoTurmas = new Set<string>();
  
      const todosOsBlocos = construirTodosOsBlocos(forcarIndividuais);
  
      for (const b of todosOsBlocos) {
        let alocado = false;
        let turnosParaTestar = b.tipo === 'presencial' ? [turno] : turnosParaNPBase;
        if (turnosParaTestar.length === 0) turnosParaTestar = [turno];
  
        for (const targetTurno of turnosParaTestar) {
          if (alocado) break;
  
          const dias = [...(targetTurno.dias_semana || [])].sort(() => Math.random() - 0.5);
          for (const d of dias) {
            if (alocado) break;
            
            const startSlots = Array.from({ length: targetTurno.aulas_por_dia - b.size + 1 }, (_, k) => k).sort(() => Math.random() - 0.5);
            
            for (const i of startSlots) {
              let livre = true;
              
              for (let k = 0; k < b.size; k++) {
                const idx = i + k;
                const slotKey = `${b.turma_id}|${targetTurno.id}|${d}|${idx}`;
                if (ocupacaoTurmas.has(slotKey)) { livre = false; break; }
                if (b.tipo === 'presencial' && b.serie_restricoes?.[d]?.[idx] === 'proibido') { livre = false; break; }
  
                if (b.professor_key) {
                  const profKey = b.professor_key;
                  const profDiaKey = `${profKey}|${d}`;
                  
                  // Verifica contra ocupações locais desta tentativa
                  const localOcc = ocupacaoProfessoresPorDia.get(profDiaKey) || [];
                  if (localOcc.some(occ => slotsConflitam(targetTurno, idx, turnosById.get(occ.turno_id)!, occ.aula_index))) {
                    livre = false; break;
                  }
  
                  // Verifica contra ocupações publicadas de outros turnos
                  const globalOcc = ocupacoesExistentesPorProfessorDia.get(profDiaKey) || [];
                  if (globalOcc.some(occ => slotsConflitam(targetTurno, idx, turnosById.get(occ.turno_id)!, occ.aula_index))) {
                    livre = false; break;
                  }
  
                  const prof = professoresById.get(b.professor_id!);
                  const rest = prof?.restricoes?.[targetTurno.id]?.[d]?.[idx];
                  if (rest === 'indisponivel') { livre = false; break; }
                  if (rest === 'planejamento' && !permitirUsoPlanejamento) { livre = false; break; }
                  
                  if (!ignorarLivreDocencia && prof?.sem_preferencia_livre_docencia === false) {
                    const periodo = getPeriodoDaAula(targetTurno, idx);
                    if (prof.livre_docencia?.some(ld => ld.dia === d && ld.periodo === periodo)) {
                        livre = false; break;
                    }
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
                  ocupacaoTurmas.add(`${b.turma_id}|${targetTurno.id}|${d}|${idx}`);
                  if (b.professor_key) pushMapArray(ocupacaoProfessoresPorDia, `${b.professor_key}|${d}`, { turno_id: targetTurno.id, aula_index: idx });
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
  
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const curProg = globalProgress + (attempt / maxAttempts);
      const permitirPlan = force || curProg > 0.15;
      const ignorarLD = force || curProg > 0.90;
      const forcarIndiv = force || curProg > 0.70;
  
      const res = executarTentativa(permitirPlan, ignorarLD, forcarIndiv);
      if (res.success) return { success: true, aulas: res.aulas, attemptsMade: attempt + 1 };
    }
  
    const finalFail = executarTentativa(true, true, true);
    return { success: false, aulas: finalFail.aulas, attemptsMade: maxAttempts, error: 'Não foi possível alocar todas as aulas sem conflitos.' };
  }
