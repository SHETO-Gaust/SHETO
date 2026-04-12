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

    // Se temos horários definidos, a comparação é matemática e exata
    if (hA?.inicio && hA?.fim && hB?.inicio && hB?.fim) {
        return hA.inicio < hB.fim && hA.fim > hB.inicio;
    }

    // Fallback para nomes de turno caso horários não estejam configurados
    const nomeA = turnoA.nome.toLowerCase();
    const nomeB = turnoB.nome.toLowerCase();

    if (nomeA === nomeB) return indexA === indexB;

    const isAInt = nomeA.includes('integral');
    const isBInt = nomeB.includes('integral');

    if (isAInt && !isBInt) return checkIntegralOverlap(indexA, nomeB, indexB);
    if (!isAInt && isBInt) return checkIntegralOverlap(indexB, nomeA, indexA);

    // Se um é matutino e outro vespertino, não conflitam por definição de slot (0-4 vs 0-4)
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
  
  const professorCpfMap = new Map<string, string>();
  const professorTightnessMap = new Map<string, number>();

  professores.forEach(p => {
      professorCpfMap.set(p.id, p.cpf);
      const conflicts = ocupacoesExistentes.filter(o => o.professor?.cpf === p.cpf).length;
      professorTightnessMap.set(p.id, conflicts);
  });

  const getTurnoOposto = (baseTurno: Turno) => {
      const n = baseTurno.nome.toLowerCase();
      // Tenta achar o oposto lógico
      const oposto = todosTurnos.find(t => {
          if (n.includes('matutino')) return t.nome.toLowerCase().includes('vespertino');
          if (n.includes('vespertino')) return t.nome.toLowerCase().includes('matutino');
          return false;
      });
      if (oposto) return [oposto];
      
      // Se não achou, retorna todos os outros turnos ativos
      return todosTurnos.filter(t => t.id !== baseTurno.id);
  };

  const getRealTurnoForOccupation = (o: any) => {
      if (o.tipo === 'presencial') return o.horario.turno;
      // Para NP, o turno real é o "outro" turno daquela escola. 
      // Como não sabemos qual era o oposto na época, tentamos inferir.
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
    const ocupacaoProfessoresRealTime = new Map<string, Set<string>>(); // TurnoID -> Set de "Dia-Index-CPF"
    const ocupacaoTurmas = new Set<string>();

    const turnosPotenciaisOpostos = getTurnoOposto(turno);
    let todosOsBlocos: any[] = [];

    turmas.forEach(t => {
      t.serie.componentes.forEach(c => {
        const profInfo = t.professores.find(p => p.componente_id === c.componente_id);
        const profId = profInfo?.professor_id || null;
        const profCpf = profId ? professorCpfMap.get(profId) : null;
        const profNome = profInfo?.professor?.nome_horario || 'Sem Professor';
        const tightness = profId ? (professorTightnessMap.get(profId) || 0) : 0;
        
        // Presenciais
        criarBlocos(c.aulas_presenciais || 0, c.componente_id, forcarIndividuais).forEach(size => {
            todosOsBlocos.push({ 
                tipo: 'presencial',
                turma_id: t.id, turma_nome: t.nome, componente_id: c.componente_id, componente_nome: (c as any).componente?.nome || 'Disciplina',
                professor_id: profId, professor_cpf: profCpf, professor_nome: profNome,
                size, serie_restricoes: t.serie.restricoes, tightness, priority: 1
            });
        });
        
        // Não Presenciais (NP)
        criarBlocos(c.aulas_nao_presenciais || 0, c.componente_id, forcarIndividuais).forEach(size => {
            todosOsBlocos.push({ 
                tipo: 'nao_presencial',
                turma_id: t.id, turma_nome: t.nome, componente_id: c.componente_id, componente_nome: (c as any).componente?.nome || 'Disciplina',
                professor_id: profId, professor_cpf: profCpf, professor_nome: profNome,
                size, tightness, priority: 2 // NP tem prioridade menor para encaixe
            });
        });
      });
    });

    // Ordenação: primeiro os professores com mais restrições (tightness), depois por tamanho de bloco
    todosOsBlocos.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        if (b.tightness !== a.tightness) return b.tightness - a.tightness;
        return b.size - a.size;
    });

    for (const b of todosOsBlocos) {
        let alocado = false;
        
        // Lista de turnos onde esta aula PODE acontecer
        const turnosParaTestar = b.tipo === 'presencial' ? [turno] : turnosPotenciaisOpostos;
        
        // Se for NP e não houver outros turnos, tentamos no próprio turno como último recurso (raro)
        if (turnosParaTestar.length === 0 && b.tipo === 'nao_presencial') turnosParaTestar.push(turno);

        for (const targetTurno of turnosParaTestar) {
            if (alocado) break;

            const dias = [...targetTurno.dias_semana].sort(() => Math.random() - 0.5);
            const slots = [];
            
            for(const d of dias) {
                for(let i=0; i <= targetTurno.aulas_por_dia - b.size; i++) {
                    let weight = Math.random() * 100;
                    
                    if (b.professor_id) {
                        const prof = professores.find(pr => pr.id === b.professor_id);
                        // Penalidade para Livre Docência
                        if (!ignorarLivreDocencia && prof?.sem_preferencia_livre_docencia === false) {
                            for (let k = 0; k < b.size; k++) {
                                if (prof.livre_docencia?.some(ld => ld.dia === d && ld.periodo === getPeriodoDaAula(targetTurno, i + k))) {
                                    weight += 10000; break;
                                }
                            }
                        }
                        // Penalidade para Planejamento
                        for (let k = 0; k < b.size; k++) {
                            if (prof?.restricoes?.[targetTurno.id]?.[d]?.[i + k] === 'planejamento') {
                                weight += permitirUsoPlanejamento ? 50 : 5000;
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
                    
                    // 1. CONFLITO DE TURMA (Apenas para aulas presenciais na grade da turma)
                    if (b.tipo === 'presencial') {
                        if (ocupacaoTurmas.has(`${d}-${idx}-${b.turma_id}`)) { livre = false; break; }
                        if (b.serie_restricoes?.[d]?.[idx] === 'proibido') { livre = false; break; }
                    }
                    
                    // 2. CONFLITO DE PROFESSOR
                    if (b.professor_cpf) {
                        // A) Conflito Global (Horários já publicados)
                        const conflitoGlobal = ocupacoesExistentes.find(o => {
                            if (o.professor?.cpf !== b.professor_cpf || o.dia_semana !== d) return false;
                            const oRealTurno = getRealTurnoForOccupation(o);
                            return slotsConflitam(targetTurno, idx, oRealTurno, o.aula_index);
                        });
                        if (conflitoGlobal) { livre = false; break; }

                        // B) Conflito Local (Aulas sendo geradas agora)
                        // Precisamos checar se o professor está em QUALQUER turno no mesmo tempo real
                        let conflitoLocal = false;
                        ocupacaoProfessoresRealTime.forEach((set, tId) => {
                            const tInfo = todosTurnos.find(tt => tt.id === tId);
                            if (!tInfo) return;
                            
                            set.forEach(val => {
                                const [vd, vIdx, vCpf] = val.split('-');
                                if (vd === d && vCpf === b.professor_cpf) {
                                    if (slotsConflitam(targetTurno, idx, tInfo, parseInt(vIdx))) {
                                        conflitoLocal = true;
                                    }
                                }
                            });
                        });
                        if (conflitoLocal) { livre = false; break; }

                        // C) Restrições Manuais do Professor
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
                        
                        if (b.tipo === 'presencial') ocupacaoTurmas.add(`${d}-${idx}-${b.turma_id}`);
                        
                        if (b.professor_cpf) {
                            if (!ocupacaoProfessoresRealTime.has(targetTurno.id)) {
                                ocupacaoProfessoresRealTime.set(targetTurno.id, new Set());
                            }
                            ocupacaoProfessoresRealTime.get(targetTurno.id)!.add(`${d}-${idx}-${b.professor_cpf}`);
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

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const currentProgress = globalProgress + (attempt / maxAttempts);
    
    // Gradualmente relaxa as regras
    let permitirUsoPlanejamento = currentProgress > 0.2; 
    let ignorarLivreDocencia = currentProgress > 0.6;    
    let forcarIndividuais = currentProgress > 0.85; // Quebra geminação se nada funcionar

    const res = executarTentativa(permitirUsoPlanejamento, ignorarLivreDocencia, forcarIndividuais);
    if (res.success) return { success: true, aulas: res.aulas, attemptsMade: attempt + 1 };
  }

  // Falhou após todas as tentativas, retorna o melhor esforço (relaxado ao máximo)
  const resFalha = executarTentativa(true, true, true);
  let errorMsg = "Inconsistência na Grade: ";
  
  if (resFalha.pendentes.length > 0) {
      const p = resFalha.pendentes[0];
      errorMsg += `O professor ${p.professor_nome} (${p.componente_nome}) ficou com ${p.size} aula(s) ${p.tipo} sem lugar. `;
      errorMsg += b.tipo === 'presencial' 
        ? "Verifique se este docente não está sobrecarregado em outros turnos." 
        : "Não há slots livres no contraturno para este professor.";
  }

  return { 
      success: false, 
      aulas: resFalha.aulas, 
      attemptsMade: maxAttempts,
      error: errorMsg
  };
}
