import { type Turno, type TurmaComDados, type ProfessorComDados, type HorarioAulaGerada, type ConfiguracaoGerminacao, type LivreDocenciaItem, type LivreDocenciaPeriodo } from './types';

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

/**
 * Gera uma chave única para identificar o professor globalmente (por CPF) ou localmente (por ID).
 */
function getTeacherKey(p: { id: string; cpf?: string | null }): string {
  if (p.cpf && p.cpf.trim().length >= 11) {
    return `cpf:${p.cpf.replace(/\D/g, '')}`;
  }
  return `id:${p.id}`;
}

/**
 * Heurística para determinar o período de uma aula baseada no turno e no horário.
 */
function getPeriodoDaAula(turno: Turno, aulaIdx: number): LivreDocenciaPeriodo {
    const nome = turno.nome.toLowerCase();
    if (nome.includes('matutino')) return 'matutino';
    if (nome.includes('vespertino')) return 'vespertino';
    if (nome.includes('noturno')) return 'noturno';
    
    const h = turno.horarios?.[aulaIdx];
    if (h?.inicio) {
        const hora = parseInt(h.inicio.split(':')[0]);
        if (hora < 13) return 'matutino';
        if (hora < 18) return 'vespertino';
        return 'noturno';
    }
    
    return aulaIdx < 5 ? 'matutino' : 'vespertino';
}

/**
 * Verifica se dois slots de tempos em turnos diferentes conflitam (sobrepõem) em tempo real.
 */
function slotsConflitam(
    turnoA: Turno, indexA: number,
    turnoB: Turno, indexB: number
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

    if ((nomeA.includes('matutino') && nomeB.includes('vespertino')) || 
        (nomeA.includes('vespertino') && nomeB.includes('matutino'))) return false;

    return indexA === indexB;
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

/**
 * Algoritmo de Timetabling com Prevenção de Choque Global entre Turnos e Contraturno.
 */
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
    aulas: Omit<HorarioAulaGerada, 'id' | 'horario_id'>[]; 
    error?: string;
    attemptsMade: number;
} {
  
  const teacherKeyMap = new Map<string, string>();
  const professorWorkloadMap = new Map<string, number>();

  professores.forEach(p => {
      const key = getTeacherKey(p);
      teacherKeyMap.set(p.id, key);
      
      // Cálculo de dificuldade: Ocupações já publicadas + Aulas a alocar nesta geração
      const publishedCount = ocupacoesExistentes.filter(o => {
          const occKey = getTeacherKey({ id: o.professor_id, cpf: o.professor?.cpf });
          return occKey === key;
      }).length;

      let currentAllocationCount = 0;
      turmas.forEach(t => {
          t.professores.forEach(tp => {
              if (tp.professor_id === p.id) {
                  const comp = t.serie.componentes.find(c => c.componente_id === tp.componente_id);
                  if (comp) currentAllocationCount += (comp.aulas_presenciais || 0) + (comp.aulas_nao_presenciais || 0);
              }
          });
      });

      professorWorkloadMap.set(key, publishedCount + currentAllocationCount);
  });

  const getTurnosDisponiveisParaNP = (baseTurno: Turno) => {
      const n = baseTurno.nome.toLowerCase();
      const outros = todosTurnos.filter(t => t.id !== baseTurno.id);
      outros.sort((a, b) => {
          const aNome = a.nome.toLowerCase();
          const bNome = b.nome.toLowerCase();
          if (n.includes('matutino') && aNome.includes('vespertino')) return -1;
          if (n.includes('vespertino') && aNome.includes('matutino')) return -1;
          return 0;
      });
      return outros;
  };

  const getRealTurnoForOccupation = (o: any) => {
      if (o.tipo === 'presencial') return o.horario.turno;
      const base = o.horario.turno;
      const n = base.nome.toLowerCase();
      const oposto = todosTurnos.find(t => t.escola_id === o.horario.escola_id && (
          (n.includes('matutino') && t.nome.toLowerCase().includes('vespertino')) ||
          (n.includes('vespertino') && t.nome.toLowerCase().includes('matutino'))
      ));
      return oposto || base;
  };

  const criarBlocos = (total: number, compId: string, forcarIndividuais: boolean = false) => {
    if (forcarIndividuais) return Array(total).fill(1);
    const config = configGerminacao.find(cfg => cfg.componente_id === compId);
    if (!config || !config.geminar || config.tamanho_bloco <= 1) return Array(total).fill(1); 
    const blocos: number[] = [];
    let restante = total;
    while (restante > 0) {
        if (restante >= config.tamanho_bloco) { blocos.push(config.tamanho_bloco); restante -= config.tamanho_bloco; }
        else { blocos.push(restante); restante = 0; }
    }
    return blocos;
  };

  const executarTentativa = (permitirUsoPlanejamento: boolean, ignorarLivreDocencia: boolean, forcarIndividuais: boolean) => {
    const aulasGeradas: Omit<HorarioAulaGerada, 'id' | 'horario_id'>[] = [];
    const ocupacaoProfessoresRealTime = new Map<string, Set<string>>(); 
    const ocupacaoTurmas = new Set<string>();

    const turnosParaNP = getTurnosDisponiveisParaNP(turno);
    let todosOsBlocos: any[] = [];

    turmas.forEach(t => {
      t.serie.componentes.forEach(c => {
        const profInfo = t.professores.find(p => p.componente_id === c.componente_id);
        const profId = profInfo?.professor_id || null;
        const profKey = profId ? teacherKeyMap.get(profId) : null;
        const profNome = profInfo?.professor?.nome_horario || 'Sem Professor';
        const workload = profKey ? (professorWorkloadMap.get(profKey) || 0) : 0;
        
        // Presenciais
        criarBlocos(c.aulas_presenciais || 0, c.componente_id, forcarIndividuais).forEach(size => {
            todosOsBlocos.push({ 
                tipo: 'presencial',
                turma_id: t.id, turma_nome: t.nome, componente_id: c.componente_id, componente_nome: (c as any).componente?.nome || 'Disciplina',
                professor_id: profId, professor_key: profKey, professor_nome: profNome,
                size, serie_restricoes: t.serie.restricoes, workload, priority: 1
            });
        });
        
        // Não Presenciais (NP)
        criarBlocos(c.aulas_nao_presenciais || 0, c.componente_id, forcarIndividuais).forEach(size => {
            todosOsBlocos.push({ 
                tipo: 'nao_presencial',
                turma_id: t.id, turma_nome: t.nome, componente_id: c.componente_id, componente_nome: (c as any).componente?.nome || 'Disciplina',
                professor_id: profId, professor_key: profKey, professor_nome: profNome,
                size, workload, priority: 2 
            });
        });
      });
    });

    // ORDENAÇÃO CRÍTICA: Prioriza quem está mais ocupado globalmente (workload), depois por tipo de aula
    todosOsBlocos.sort((a, b) => {
        if (b.workload !== a.workload) return b.workload - a.workload;
        if (a.priority !== b.priority) return a.priority - b.priority;
        return b.size - a.size;
    });

    for (const b of todosOsBlocos) {
        let alocado = false;
        let turnosParaTestar = b.tipo === 'presencial' ? [turno] : turnosParaNP;
        
        // Se não houver outros turnos, permite NP no próprio turno em slots vazios (fallback de segurança)
        if (turnosParaTestar.length === 0 && b.tipo === 'nao_presencial') turnosParaTestar = [turno];

        for (const targetTurno of turnosParaTestar) {
            if (alocado) break;

            const dias = [...targetTurno.dias_semana].sort(() => Math.random() - 0.5);
            const slots = [];
            
            for(const d of dias) {
                for(let i=0; i <= targetTurno.aulas_por_dia - b.size; i++) {
                    let weight = Math.random() * 100;
                    
                    if (b.professor_id) {
                        const prof = professores.find(pr => pr.id === b.professor_id);
                        if (!ignorarLivreDocencia && prof?.sem_preferencia_livre_docencia === false) {
                            for (let k = 0; k < b.size; k++) {
                                if (prof.livre_docencia?.some(ld => ld.dia === d && ld.periodo === getPeriodoDaAula(targetTurno, i + k))) {
                                    weight += 10000; break;
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
                if (slot.weight >= 5000 && !ignorarLivreDocencia && !permitirUsoPlanejamento) continue; 
                const { d, i } = slot;
                let livre = true;

                for (let k = 0; k < b.size; k++) {
                    const idx = i + k;
                    
                    // 1. Conflito de Turma (Turma não pode ter 2 aulas no mesmo horário, mesmo que uma seja NP)
                    // Verificamos se em QUALQUER turno já alocamos algo para esta turma neste dia/horário exato
                    const conflitoTurma = aulasGeradas.find(a => {
                        if (a.turma_id !== b.turma_id || a.dia_semana !== d) return false;
                        // Pegamos o turno onde a aula anterior foi alocada
                        const aTurno = a.tipo === 'presencial' ? turno : turnosParaNP.find(tnp => tnpsPossuemAula(tnp, a, d));
                        if (!aTurno) return false;
                        return slotsConflitam(targetTurno, idx, aTurno, a.aula_index);
                    });
                    
                    if (conflitoTurma) { livre = false; break; }

                    if (b.tipo === 'presencial') {
                        if (b.serie_restricoes?.[d]?.[idx] === 'proibido') { livre = false; break; }
                    }
                    
                    if (b.professor_key) {
                        // 2. Conflito Global (Já publicado em outras escolas/turnos)
                        const conflitoGlobal = ocupacoesExistentes.find(o => {
                            const occKey = getTeacherKey({ id: o.professor_id, cpf: o.professor?.cpf });
                            if (occKey !== b.professor_key || o.dia_semana !== d) return false;
                            const oRealTurno = getRealTurnoForOccupation(o);
                            return slotsConflitam(targetTurno, idx, oRealTurno, o.aula_index);
                        });
                        if (conflitoGlobal) { livre = false; break; }

                        // 3. Conflito Local (Mesma geração)
                        const ocupacoesDesteProfessor = ocupacaoProfessoresRealTime.get(b.professor_key);
                        if (ocupacoesDesteProfessor) {
                            for (const val of ocupacoesDesteProfessor) {
                                const [vTurnoId, vd, vIdx] = val.split('|');
                                if (vd === d) {
                                    const vTurnoInfo = todosTurnos.find(tt => tt.id === vTurnoId);
                                    if (vTurnoInfo && slotsConflitam(targetTurno, idx, vTurnoInfo, parseInt(vIdx))) {
                                        livre = false; break;
                                    }
                                }
                            }
                        }
                        if (!livre) break;

                        const prof = professores.find(pr => pr.id === b.professor_id);
                        const restricao = prof?.restricoes?.[targetTurno.id]?.[d]?.[idx];
                        if (restricao === 'indisponivel') { livre = false; break; }
                        if (restricao === 'planejamento' && !permitirUsoPlanejamento) { livre = false; break; }
                    }
                }

                if (livre) {
                    for (let k = 0; k < b.size; k++) {
                        const idx = i + k;
                        aulasGeradas.push({ 
                            turma_id: b.turma_id, 
                            componente_id: b.componente_id, 
                            professor_id: b.professor_id, 
                            dia_semana: d, 
                            aula_index: idx, 
                            tipo: b.tipo 
                        });
                        
                        if (b.professor_key) {
                            if (!ocupacaoProfessoresRealTime.has(b.professor_key)) {
                                ocupacaoProfessoresRealTime.set(b.professor_key, new Set());
                            }
                            ocupacaoProfessoresRealTime.get(b.professor_key)!.add(`${targetTurno.id}|${d}|${idx}`);
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
    return { success: pendentes.length === 0, aulas: aulasGeradas, pendentes };
  };

  // Helper local para verificar se um turno possui uma aula específica
  function tnpsPossuemAula(tnp: Turno, a: any, d: string) {
      // Simplificação: se a aula foi gerada para este turno, ela é deste turno
      return a.dia_semana === d;
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const currentProgress = globalProgress + (attempt / maxAttempts);
    
    // RELAXAMENTO PROGRESSIVO MAIS AGRESSIVO
    let permitirUsoPlanejamento = currentProgress > 0.10; // Permite usar planejamento após 10%
    let ignorarLivreDocencia = currentProgress > 0.35;    // Ignora folgas após 35%
    let forcarIndividuais = currentProgress > 0.65;      // Quebra blocos após 65%

    const res = executarTentativa(permitirUsoPlanejamento, ignorarLivreDocencia, forcarIndividuais);
    if (res.success) return { success: true, aulas: res.aulas, attemptsMade: attempt + 1 };
  }

  const resFalha = executarTentativa(true, true, true);
  let errorMsg = "Capacidade Esgotada: ";
  
  if (resFalha.pendentes.length > 0) {
      const p = resFalha.pendentes[0];
      errorMsg += `O professor ${p.professor_nome} (${p.componente_nome}) está sem horários livres no contraturno para a aula ${p.tipo}. `;
      errorMsg += "Isso acontece quando o docente já tem todas as janelas ocupadas por aulas presenciais em outros turnos.";
  }

  return { 
      success: false, 
      aulas: resFalha.aulas, 
      attemptsMade: maxAttempts,
      error: errorMsg
  };
}