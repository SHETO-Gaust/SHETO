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
 * Verifica se dois slots de tempos em turnos diferentes conflitam (sobrepõem).
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

    return false;
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
 * Algoritmo de Timetabling com Prevenção de Choque Global entre Turnos.
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
      // Calcula quão "ocupado" o professor está em outros turnos
      const conflicts = ocupacoesExistentes.filter(o => o.professor?.cpf === p.cpf).length;
      professorTightnessMap.set(p.id, conflicts);
  });

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
    const ocupacaoProfessoresLocal = new Set<string>();
    const ocupacaoTurmas = new Set<string>();

    const turmaDiaProfessorDisciplina = new Map<string, string>();
    const turmaDiaComponenteCount = new Map<string, number>();

    let todosOsBlocos: any[] = [];

    turmas.forEach(t => {
      t.serie.componentes.forEach(c => {
        const profInfo = t.professores.find(p => p.componente_id === c.componente_id);
        const profId = profInfo?.professor_id || null;
        const profCpf = profId ? professorCpfMap.get(profId) : null;
        const profNome = profInfo?.professor?.nome_horario || 'Sem Professor';
        const tightness = profId ? (professorTightnessMap.get(profId) || 0) : 0;
        
        const config = configGerminacao.find(cfg => cfg.componente_id === c.componente_id);
        const maxAulasPorDay = (config?.geminar && !forcarIndividuais) ? config.tamanho_bloco : 1;

        // Presenciais
        criarBlocos(c.aulas_presenciais || 0, c.componente_id, forcarIndividuais).forEach(size => {
            todosOsBlocos.push({ 
                tipo: 'presencial',
                turma_id: t.id, turma_nome: t.nome, componente_id: c.componente_id, componente_nome: (c as any).componente?.nome || 'Disciplina',
                professor_id: profId, professor_cpf: profCpf, professor_nome: profNome,
                size, serie_restricoes: t.serie.restricoes, maxAulasPorDay, tightness
            });
        });
        
        // Não Presenciais
        criarBlocos(c.aulas_nao_presenciais || 0, c.componente_id, forcarIndividuais).forEach(size => {
            todosOsBlocos.push({ 
                tipo: 'nao_presencial',
                turma_id: t.id, turma_nome: t.nome, componente_id: c.componente_id, componente_nome: (c as any).componente?.nome || 'Disciplina',
                professor_id: profId, professor_cpf: profCpf, professor_nome: profNome,
                size, maxAulasPorDay, tightness
            });
        });
      });
    });

    // ORDENAÇÃO ESTRATÉGICA: 
    // 1. Professores com mais conflitos globais (tightness) primeiro.
    // 2. Blocos maiores primeiro.
    todosOsBlocos.sort((a, b) => {
        if (b.tightness !== a.tightness) return b.tightness - a.tightness;
        return b.size - a.size;
    });

    const dias = [...turno.dias_semana].sort(() => Math.random() - 0.5);
    const turnoOposto = todosTurnos.find(t => {
        const n = turno.nome.toLowerCase();
        if (n.includes('matutino')) return t.nome.toLowerCase().includes('vespertino');
        if (n.includes('vespertino')) return t.nome.toLowerCase().includes('matutino');
        return false;
    }) || todosTurnos.find(t => t.id !== turno.id);

    for (const b of todosOsBlocos) {
        let alocado = false;
        const currentTurno = b.tipo === 'presencial' ? turno : turnoOposto;
        if (!currentTurno) { b.placed = true; continue; } // Ignora NP se não houver turno oposto

        const slots = [];
        for(const d of dias) {
            for(let i=0; i <= currentTurno.aulas_por_dia - b.size; i++) {
                let weight = Math.random() * 10;
                
                // Incentiva preencher o início do dia
                weight += (i * 2);

                if (b.professor_id) {
                    const prof = professores.find(pr => pr.id === b.professor_id);
                    // Penaliza uso de Livre Docência
                    if (!ignorarLivreDocencia && prof?.sem_preferencia_livre_docencia === false && prof?.livre_docencia) {
                        for (let k = 0; k < b.size; k++) {
                            if (prof.livre_docencia.some(ld => ld.dia === d && ld.periodo === getPeriodoDaAula(currentTurno, i + k))) {
                                weight += 10000; break;
                            }
                        }
                    }
                    // Penaliza levemente uso de Planejamento
                    for (let k = 0; k < b.size; k++) {
                        if (prof?.restricoes?.[currentTurno.id]?.[d]?.[i + k] === 'planejamento') weight += 50;
                    }
                }
                slots.push({ d, i, weight });
            }
        }
        slots.sort((a, b) => a.weight - b.weight);

        for (const slot of slots) {
            if (slot.weight >= 5000 && !ignorarLivreDocencia) continue; 
            const { d, i } = slot;
            let livre = true;

            // Regra: Mesma turma, mesmo dia, mesmo professor -> Só se for a mesma disciplina (até 50% de progresso)
            if (globalProgress < 0.5) {
                if (b.professor_id && turmaDiaProfessorDisciplina.get(`${d}-${b.turma_id}-${b.professor_id}`) && turmaDiaProfessorDisciplina.get(`${d}-${b.turma_id}-${b.professor_id}`) !== b.componente_id) {
                    livre = false;
                }
            }

            // Regra: Máximo de aulas daquela disciplina por dia
            if ((turmaDiaComponenteCount.get(`${d}-${b.turma_id}-${b.componente_id}`) || 0) + b.size > b.maxAulasPorDay) livre = false;
            
            if (!livre) continue;

            for (let k = 0; k < b.size; k++) {
                const idx = i + k;
                
                // Conflito de Turma (alguém já está dando aula aqui para esta turma?)
                if (b.tipo === 'presencial' && ocupacaoTurmas.has(`${d}-${idx}-${b.turma_id}`)) { livre = false; break; }
                
                // Restrição da Série (Passo 5)
                if (b.tipo === 'presencial' && b.serie_restricoes?.[d]?.[idx] === 'proibido') { livre = false; break; }
                
                if (b.professor_cpf) {
                    // Conflito Global (CPF em outro turno publicado)
                    const conflitoGlobal = ocupacoesExistentes.find(o => 
                        o.professor?.cpf === b.professor_cpf && 
                        o.dia_semana === d && 
                        slotsConflitam(currentTurno, idx, o.horario.turno, o.aula_index)
                    );
                    if (conflitoGlobal) { livre = false; break; }

                    // Conflito Local (Professor já alocado neste mesmo turno em outra turma)
                    if (ocupacaoProfessoresLocal.has(`${d}-${idx}-${b.professor_cpf}`)) { livre = false; break; }

                    // Restrições Manuais do Professor (Ban/Planejamento)
                    const prof = professores.find(pr => pr.id === b.professor_id);
                    const restricao = prof?.restricoes?.[currentTurno.id]?.[d]?.[idx];
                    if (restricao === 'indisponivel') { livre = false; break; }
                    if (restricao === 'planejamento' && !permitirUsoPlanejamento) { livre = false; break; }
                }
            }

            if (livre) {
                for (let k = 0; k < b.size; k++) {
                    const idx = i + k;
                    aulasGeradas.push({ turma_id: b.turma_id, componente_id: b.componente_id, professor_id: b.professor_id, dia_semana: d, aula_index: idx, tipo: b.tipo });
                    if (b.tipo === 'presencial') ocupacaoTurmas.add(`${d}-${idx}-${b.turma_id}`);
                    if (b.professor_cpf) ocupacaoProfessoresLocal.add(`${d}-${idx}-${b.professor_cpf}`);
                }
                turmaDiaProfessorDisciplina.set(`${d}-${b.turma_id}-${b.professor_id}`, b.componente_id);
                turmaDiaComponenteCount.set(`${d}-${b.turma_id}-${b.componente_id}`, (turmaDiaComponenteCount.get(`${d}-${b.turma_id}-${b.componente_id}`) || 0) + b.size);
                alocado = true; break;
            }
        }
        if (alocado) b.placed = true;
    }

    const pendentes = todosOsBlocos.filter(b => !b.placed);
    return { success: pendentes.length === 0, aulas: aulasGeradas, pendentes };
  };

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const currentProgress = globalProgress + (attempt / 100000);
    
    // ESTRATÉGIA EVOLUTIVA:
    let permitirUsoPlanejamento = currentProgress > 0.2; // 20% -> Usa slots de planejamento
    let ignorarLivreDocencia = currentProgress > 0.5;    // 50% -> Ignora preferências de Livre Docência
    let forcarIndividuais = currentProgress > 0.8;       // 80% -> Quebra blocos germinados para salvar a grade

    const res = executarTentativa(permitirUsoPlanejamento, ignorarLivreDocencia, forcarIndividuais);
    if (res.success) return { success: true, aulas: res.aulas, attemptsMade: attempt + 1 };
  }

  // Falha final
  const resFalha = executarTentativa(true, true, true);
  let errorMsg = "Conflito Crítico: ";
  
  if (resFalha.pendentes.length > 0) {
      const p = resFalha.pendentes[0];
      errorMsg += `O professor ${p.professor_nome} está com a agenda lotada ou bloqueada no turno ${turno.nome} para a disciplina ${p.componente_nome} na Turma ${p.turma_nome}. Verifique se ele já não atingiu o limite de aulas semanais somando todos os turnos.`;
  }

  return { 
      success: false, 
      aulas: resFalha.aulas, 
      attemptsMade: maxAttempts,
      error: errorMsg
  };
}
