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

    // 1. Prioridade: Horário Real (HH:mm)
    if (hA?.inicio && hA?.fim && hB?.inicio && hB?.fim) {
        return hA.inicio < hB.fim && hA.fim > hB.inicio;
    }

    // 2. Fallback: Heurística por nome de turno e índice
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
  maxAttempts: number = 1000,
  globalProgress: number = 0 // 0 a 1 indicando quão longe estamos do limite de 10k
): { 
    success: boolean; 
    aulas: Omit<HorarioAulaGerada, 'id' | 'horario_id'>[]; 
    error?: string;
    sugestao?: SugestaoRealocacao[];
    attemptsMade: number;
} {
  
  const professorCpfMap = new Map<string, string>();
  professores.forEach(p => {
      professorCpfMap.set(p.id, p.cpf);
  });

  const criarBlocos = (total: number, compId: string) => {
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

  const executarTentativa = (permitirUsoPlanejamento: boolean, ignorarLivreDocencia: boolean = false) => {
    const aulasGeradas: Omit<HorarioAulaGerada, 'id' | 'horario_id'>[] = [];
    const ocupacaoProfessoresLocal = new Set<string>();
    const ocupacaoTurmas = new Set<string>();

    const turmaDiaProfessorDisciplina = new Map<string, string>();
    const turmaDiaComponenteCount = new Map<string, number>();

    let blocosPresenciais: any[] = [];
    let blocosNaoPresenciais: any[] = [];

    const turnoOposto = todosTurnos.find(t => {
        const n = turno.nome.toLowerCase();
        if (n.includes('matutino')) return t.nome.toLowerCase().includes('vespertino');
        if (n.includes('vespertino')) return t.nome.toLowerCase().includes('matutino');
        return false;
    }) || todosTurnos.find(t => t.id !== turno.id);

    turmas.forEach(t => {
      t.serie.componentes.forEach(c => {
        const profInfo = t.professores.find(p => p.componente_id === c.componente_id);
        const profId = profInfo?.professor_id || null;
        const profCpf = profId ? professorCpfMap.get(profId) : null;
        const profNome = profInfo?.professor?.nome_horario || 'Sem Professor';
        
        const config = configGerminacao.find(cfg => cfg.componente_id === c.componente_id);
        const maxAulasPorDia = config?.geminar ? config.tamanho_bloco : 1;

        criarBlocos(c.aulas_presenciais || 0, c.componente_id).forEach(size => {
            blocosPresenciais.push({ 
                turma_id: t.id, turma_nome: t.nome, componente_id: c.componente_id, componente_nome: (c as any).componente?.nome || 'Disciplina',
                professor_id: profId, professor_cpf: profCpf, professor_nome: profNome,
                size, serie_restricoes: t.serie.restricoes, maxAulasPorDia 
            });
        });
        
        criarBlocos(c.aulas_nao_presenciais || 0, c.componente_id).forEach(size => {
            blocosNaoPresenciais.push({ 
                turma_id: t.id, turma_nome: t.nome, componente_id: c.componente_id, componente_nome: (c as any).componente?.nome || 'Disciplina',
                professor_id: profId, professor_cpf: profCpf, professor_nome: profNome,
                size, maxAulasPorDia 
            });
        });
      });
    });

    const sortFn = (a: any, b: any) => (b.size - a.size) || (Math.random() - 0.5);
    blocosPresenciais.sort(sortFn);
    blocosNaoPresenciais.sort(sortFn);

    const dias = [...turno.dias_semana].sort(() => Math.random() - 0.5);

    for (const b of blocosPresenciais) {
        let alocado = false;
        const slots = [];
        for(const d of dias) {
            for(let i=0; i <= turno.aulas_por_dia - b.size; i++) {
                let weight = Math.random();
                if (b.professor_id) {
                    const prof = professores.find(pr => pr.id === b.professor_id);
                    if (!ignorarLivreDocencia && prof?.sem_preferencia_livre_docencia === false && prof?.livre_docencia) {
                        for (let k = 0; k < b.size; k++) {
                            if (prof.livre_docencia.some(ld => ld.dia === d && ld.periodo === getPeriodoDaAula(turno, i + k))) {
                                weight += 5000; break;
                            }
                        }
                    }
                    for (let k = 0; k < b.size; k++) {
                        if (prof?.restricoes?.[turno.id]?.[d]?.[i + k] === 'planejamento') weight += 10;
                    }
                }
                slots.push({ d, i, weight });
            }
        }
        slots.sort((a, b) => a.weight - b.weight);

        for (const slot of slots) {
            if (slot.weight >= 1000 && !ignorarLivreDocencia) continue; 
            const { d, i } = slot;
            let livre = true;

            if (b.professor_id && turmaDiaProfessorDisciplina.get(`${d}-${b.turma_id}-${b.professor_id}`) && turmaDiaProfessorDisciplina.get(`${d}-${b.turma_id}-${b.professor_id}`) !== b.componente_id) livre = false;
            if ((turmaDiaComponenteCount.get(`${d}-${b.turma_id}-${b.componente_id}`) || 0) + b.size > b.maxAulasPorDia) livre = false;
            if (!livre) continue;

            for (let k = 0; k < b.size; k++) {
                const idx = i + k;
                if (ocupacaoTurmas.has(`${d}-${idx}-${b.turma_id}`)) { livre = false; break; }
                if (b.serie_restricoes?.[d]?.[idx] === 'proibido') { livre = false; break; }
                
                if (b.professor_cpf) {
                    const conflitoGlobal = ocupacoesExistentes.find(o => 
                        o.professor?.cpf === b.professor_cpf && 
                        o.dia_semana === d && 
                        slotsConflitam(turno, idx, o.horario.turno, o.aula_index)
                    );
                    if (conflitoGlobal) { livre = false; break; }
                    if (ocupacaoProfessoresLocal.has(`${d}-${idx}-${b.professor_cpf}`)) { livre = false; break; }

                    const prof = professores.find(pr => pr.id === b.professor_id);
                    const restricao = prof?.restricoes?.[turno.id]?.[d]?.[idx];
                    if (restricao === 'indisponivel') { livre = false; break; }
                    if (restricao === 'planejamento' && !permitirUsoPlanejamento) { livre = false; break; }
                }
            }

            if (livre) {
                for (let k = 0; k < b.size; k++) {
                    const idx = i + k;
                    aulasGeradas.push({ turma_id: b.turma_id, componente_id: b.componente_id, professor_id: b.professor_id, dia_semana: d, aula_index: idx, tipo: 'presencial' });
                    ocupacaoTurmas.add(`${d}-${idx}-${b.turma_id}`);
                    if (b.professor_cpf) ocupacaoProfessoresLocal.add(`${d}-${idx}-${b.professor_cpf}`);
                }
                turmaDiaProfessorDisciplina.set(`${d}-${b.turma_id}-${b.professor_id}`, b.componente_id);
                turmaDiaComponenteCount.set(`${d}-${b.turma_id}-${b.componente_id}`, (turmaDiaComponenteCount.get(`${d}-${b.turma_id}-${b.componente_id}`) || 0) + b.size);
                alocado = true; break;
            }
        }
        if (alocado) b.placed = true;
    }

    if (turnoOposto) {
        const numAulasOposto = turnoOposto.aulas_por_dia || 5;
        for (const b of blocosNaoPresenciais) {
            let alocado = false;
            const slotsNP = [];
            for(const d of dias) {
                for(let i=0; i <= numAulasOposto - b.size; i++) {
                    let weight = Math.random();
                    if (b.professor_id) {
                        const prof = professores.find(pr => pr.id === b.professor_id);
                        if (!ignorarLivreDocencia && prof?.sem_preferencia_livre_docencia === false && prof?.livre_docencia) {
                            for (let k = 0; k < b.size; k++) {
                                if (prof.livre_docencia.some(ld => ld.dia === d && ld.periodo === getPeriodoDaAula(turnoOposto, i + k))) {
                                    weight += 5000; break;
                                }
                            }
                        }
                    }
                    slotsNP.push({ d, i, weight });
                }
            }
            slotsNP.sort((a,b) => a.weight - b.weight);

            for (const slot of slotsNP) {
                if (slot.weight >= 1000 && !ignorarLivreDocencia) continue;
                const { d, i } = slot;
                let livre = true;

                if (b.professor_cpf) {
                    for (let k = 0; k < b.size; k++) {
                        const idx = i + k;
                        const conflitoGlobal = ocupacoesExistentes.find(o => 
                            o.professor?.cpf === b.professor_cpf && 
                            o.dia_semana === d && 
                            slotsConflitam(turnoOposto, idx, o.horario.turno, o.aula_index)
                        );
                        if (conflitoGlobal) { livre = false; break; }
                        if (ocupacaoProfessoresLocal.has(`${d}-${idx}-${b.professor_cpf}`)) { livre = false; break; }
                        
                        const prof = professores.find(pr => pr.id === b.professor_id);
                        const restricaoOposta = prof?.restricoes?.[turnoOposto.id]?.[d]?.[idx];
                        if (restricaoOposta === 'indisponivel') { livre = false; break; }
                        if (restricaoOposta === 'planejamento' && !permitirUsoPlanejamento) { livre = false; break; }
                    }
                }

                if (livre) {
                    for (let k = 0; k < b.size; k++) {
                        aulasGeradas.push({ turma_id: b.turma_id, componente_id: b.componente_id, professor_id: b.professor_id, dia_semana: d, aula_index: i + k, tipo: 'nao_presencial' });
                        if (b.professor_cpf) ocupacaoProfessoresLocal.add(`${d}-${(i+k)}-${b.professor_cpf}`);
                    }
                    alocado = true; break;
                }
            }
            if (alocado) b.placed = true;
        }
    }

    const pendentes = [...blocosPresenciais, ...blocosNaoPresenciais].filter(b => !b.placed);
    return { success: pendentes.length === 0, aulas: aulasGeradas, pendentes };
  };

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const currentProgress = globalProgress + (attempt / 10000);
    
    // Define estratégia do lote baseado no progresso global
    let permitirUsoPlanejamento = currentProgress > 0.3;
    let ignorarLivreDocencia = currentProgress > 0.7;

    const res = executarTentativa(permitirUsoPlanejamento, ignorarLivreDocencia);
    if (res.success) return { success: true, aulas: res.aulas, attemptsMade: attempt + 1 };
  }

  const resFalha = executarTentativa(true, true);
  return { 
      success: false, 
      aulas: resFalha.aulas, 
      attemptsMade: maxAttempts,
      error: resFalha.pendentes.length > 0 ? `Não foi possível alocar ${resFalha.pendentes[0].professor_nome} (${resFalha.pendentes[0].componente_nome}) na Turma ${resFalha.pendentes[0].turma_nome}.` : "Erro desconhecido."
  };
}
