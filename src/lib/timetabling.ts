import type { Turno, TurmaComDados, ProfessorComDados, HorarioAulaGerada, ConfiguracaoGerminacao, LivreDocenciaItem } from './types';

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
 * Algoritmo de Timetabling com Livre Docência, Reinicialização Aleatória e Heurística de Carga.
 */
export function gerarHorarioAlgoritmico(
  turno: Turno,
  turmas: TurmaComDados[],
  professores: ProfessorComDados[],
  todosTurnos: Turno[],
  configGerminacao: ConfiguracaoGerminacao[] = [],
  force: boolean = false,
  ocupacoesExistentes: any[] = [] 
): { 
    success: boolean; 
    aulas: Omit<HorarioAulaGerada, 'id' | 'horario_id'>[]; 
    error?: string;
    sugestao?: SugestaoRealocacao[];
} {
  
  const MAX_ATTEMPTS = 100; 
  
  const nomeTurnoLower = turno.nome.toLowerCase();
  const turnoOposto = todosTurnos.find(t => {
    if (nomeTurnoLower.includes('matutino')) return t.nome.toLowerCase().includes('vespertino');
    if (nomeTurnoLower.includes('vespertino')) return t.nome.toLowerCase().includes('matutino');
    return false;
  }) || todosTurnos.find(t => t.id !== turno.id);

  const numAulasOposto = turnoOposto?.aulas_por_dia || 5;

  const ocupacaoFixaProfessores = new Set<string>();
  const ocupacaoFlexivel = ocupacoesExistentes.filter(o => o.tipo === 'nao_presencial');
  
  ocupacoesExistentes.forEach(o => {
      if (o.professor_id && o.tipo === 'presencial') {
          ocupacaoFixaProfessores.add(`${o.dia_semana}-${o.aula_index}-${o.professor_id}`);
      }
  });

  const cargaTotalPorProfessor = new Map<string, number>();
  turmas.forEach(t => {
    t.serie.componentes.forEach(c => {
      const totalAulas = (c.aulas_presenciais || 0) + (c.aulas_nao_presenciais || 0);
      if (totalAulas === 0) return;
      const aloc = t.professores.find(p => p.componente_id === c.componente_id);
      if (aloc) cargaTotalPorProfessor.set(aloc.professor_id, (cargaTotalPorProfessor.get(aloc.professor_id) || 0) + totalAulas);
    });
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

  const executarTentativa = (permitirMoverNP: boolean, permitirUsoPlanejamento: boolean, ignorarLivreDocencia: boolean = false) => {
    const aulasGeradas: Omit<HorarioAulaGerada, 'id' | 'horario_id'>[] = [];
    const ocupacaoProfessoresLocal = new Set<string>();
    const ocupacaoTurmas = new Set<string>();
    const bumpedNPs = new Set<string>(); 

    const turmaDiaProfessorDisciplina = new Map<string, string>();
    const turmaDiaComponenteCount = new Map<string, number>();

    let blocosPresenciais: any[] = [];
    let blocosNaoPresenciais: any[] = [];

    turmas.forEach(t => {
      t.serie.componentes.forEach(c => {
        const profInfo = t.professores.find(p => p.componente_id === c.componente_id);
        const profId = profInfo?.professor_id || null;
        const profNome = profInfo?.professor?.nome_horario || 'Sem Professor';
        const componenteNome = c.componente.nome;
        
        const config = configGerminacao.find(cfg => cfg.componente_id === c.componente_id);
        const maxAulasPorDia = config?.geminar ? config.tamanho_bloco : 1;

        criarBlocos(c.aulas_presenciais || 0, c.componente_id).forEach(size => {
            blocosPresenciais.push({ 
                turma_id: t.id, 
                turma_nome: t.nome, 
                componente_id: c.componente_id, 
                componente_nome: componenteNome,
                professor_id: profId, 
                professor_nome: profNome,
                size, 
                serie_restricoes: t.serie.restricoes, 
                maxAulasPorDia 
            });
        });
        
        criarBlocos(c.aulas_nao_presenciais || 0, c.componente_id).forEach(size => {
            blocosNaoPresenciais.push({ 
                turma_id: t.id, 
                turma_nome: t.nome, 
                componente_id: c.componente_id, 
                componente_nome: componenteNome,
                professor_id: profId, 
                professor_nome: profNome,
                size, 
                maxAulasPorDia 
            });
        });
      });
    });

    const sortFn = (a: any, b: any) => (b.size - a.size) || ((cargaTotalPorProfessor.get(b.professor_id) || 0) - (cargaTotalPorProfessor.get(a.professor_id) || 0)) || (Math.random() - 0.5);
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
                    
                    // Verificação de Livre Docência
                    const isLivreDocenciaShift = !ignorarLivreDocencia && prof?.livre_docencia?.some(ld => ld.turno_id === turno.id && ld.dia === d);
                    if (isLivreDocenciaShift) {
                        weight += 1000; // Bloqueio quase total
                    }

                    for (let k = 0; k < b.size; k++) {
                        if (prof?.restricoes?.[turno.id]?.[d]?.[i + k] === 'planejamento') {
                            weight += 10;
                            break;
                        }
                    }
                }
                slots.push({ d, i, weight });
            }
        }
        slots.sort((a, b) => a.weight - b.weight);

        for (const slot of slots) {
            if (slot.weight >= 1000) continue; // Pula slots de livre docência se não estivermos ignorando

            const { d, i } = slot;
            let livre = true;
            const currentBumped = new Set<string>();

            if (b.professor_id && turmaDiaProfessorDisciplina.get(`${d}-${b.turma_id}-${b.professor_id}`) && turmaDiaProfessorDisciplina.get(`${d}-${b.turma_id}-${b.professor_id}`) !== b.componente_id) livre = false;
            if ((turmaDiaComponenteCount.get(`${d}-${b.turma_id}-${b.componente_id}`) || 0) + b.size > b.maxAulasPorDia) livre = false;

            if (!livre) continue;

            for (let k = 0; k < b.size; k++) {
                const idx = i + k;
                if (ocupacaoTurmas.has(`${d}-${idx}-${b.turma_id}`)) { livre = false; break; }
                if (b.serie_restricoes?.[d]?.[idx] === 'proibido') { livre = false; break; }
                
                if (b.professor_id) {
                    if (ocupacaoFixaProfessores.has(`${d}-${idx}-${b.professor_id}`)) { livre = false; break; }
                    if (ocupacaoProfessoresLocal.has(`${d}-${idx}-${b.professor_id}`)) { livre = false; break; }
                    
                    const npConflict = ocupacaoFlexivel.find(o => o.professor_id === b.professor_id && o.dia_semana === d && o.aula_index === idx);
                    if (npConflict) {
                        if (permitirMoverNP) currentBumped.add(npConflict.id);
                        else { livre = false; break; }
                    }

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
                    if (b.professor_id) ocupacaoProfessoresLocal.add(`${d}-${idx}-${b.professor_id}`);
                }
                currentBumped.forEach(id => bumpedNPs.add(id));
                turmaDiaProfessorDisciplina.set(`${d}-${b.turma_id}-${b.professor_id}`, b.componente_id);
                turmaDiaComponenteCount.set(`${d}-${b.turma_id}-${b.componente_id}`, (turmaDiaComponenteCount.get(`${d}-${b.turma_id}-${b.componente_id}`) || 0) + b.size);
                alocado = true;
                break;
            }
        }
        if (alocado) b.placed = true;
    }

    if (turnoOposto) {
        for (const b of blocosNaoPresenciais) {
            let alocado = false;
            const slotsNP = [];
            for(const d of dias) {
                for(let i=0; i <= numAulasOposto - b.size; i++) {
                    let weight = Math.random();
                    if (b.professor_id) {
                        const prof = professores.find(pr => pr.id === b.professor_id);
                        const isLivreShift = !ignorarLivreDocencia && prof?.livre_docencia?.some(ld => ld.turno_id === turnoOposto.id && ld.dia === d);
                        if (isLivreShift) weight += 1000;
                    }
                    slotsNP.push({ d, i, weight });
                }
            }
            slotsNP.sort((a,b) => a.weight - b.weight);

            for (const slot of slotsNP) {
                if (slot.weight >= 1000) continue;
                const { d, i } = slot;
                let livre = true;

                if (b.professor_id) {
                    for (let k = 0; k < b.size; k++) {
                        const idx = i + k;
                        if (ocupacaoFixaProfessores.has(`${d}-${idx}-${b.professor_id}`)) { livre = false; break; }
                        
                        const prof = professores.find(pr => pr.id === b.professor_id);
                        const restricaoOposta = prof?.restricoes?.[turnoOposto.id]?.[d]?.[idx];
                        if (restricaoOposta === 'indisponivel') { livre = false; break; }
                        if (restricaoOposta === 'planejamento' && !permitirUsoPlanejamento) { livre = false; break; }
                    }
                }

                if (livre) {
                    for (let k = 0; k < b.size; k++) {
                        aulasGeradas.push({ turma_id: b.turma_id, componente_id: b.componente_id, professor_id: b.professor_id, dia_semana: d, aula_index: i + k, tipo: 'nao_presencial' });
                    }
                    alocado = true;
                    break;
                }
            }
            if (alocado) b.placed = true;
        }
    }

    const pendentes = [...blocosPresenciais, ...blocosNaoPresenciais].filter(b => !b.placed);
    return { success: pendentes.length === 0, aulas: aulasGeradas, bumpedNPs: Array.from(bumpedNPs), pendentes };
  };

  // --- FLUXO DE TENTATIVAS ---
  
  // 1. Tentar com todas as restrições rígidas (Livre Docência mantida)
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const res = executarTentativa(true, false, false);
    if (res.success) return { success: true, aulas: res.aulas };
  }

  // 2. Tentar flexibilizando Planejamento (Livre Docência mantida)
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const res = executarTentativa(true, true, false);
    if (res.success) return { success: true, aulas: res.aulas };
  }

  // 3. Tentar ignorando Livre Docência (Último recurso)
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const res = executarTentativa(true, true, true);
    if (res.success) {
        // Encontrou solução mas quebrou a livre docência de alguém
        return { success: true, aulas: res.aulas, error: "AVISO: A grade foi gerada ignorando temporariamente a Livre Docência de alguns professores para possibilitar o fechamento." };
    }
  }

  // Se nada funcionou, gerar diagnóstico detalhado
  const resFalha = executarTentativa(true, true, false);
  const p = resFalha.pendentes[0];
  if (p) {
      const prof = professores.find(pr => pr.id === p.professor_id);
      let diag = `CONFLITO LÓGICO DETECTADO:\n`;
      diag += `A disciplina "${p.componente_nome}" do professor ${p.professor_nome} na Turma ${p.turma_nome} não encontrou espaço.\n\n`;
      diag += `CAUSAS PROVÁVEIS:\n`;
      
      const hasLDInThisTurno = prof?.livre_docencia?.some(ld => ld.turno_id === turno.id);
      if (hasLDInThisTurno) {
          diag += `• O professor ${p.professor_nome} tem um período de LIVRE DOCÊNCIA neste turno que pode estar bloqueando aulas necessárias.\n`;
      }
      
      diag += `• O professor pode ter excesso de restrições de indisponibilidade.\n`;
      diag += `• A carga horária total da série pode estar excedendo a capacidade do turno.`;
      
      return { success: force, aulas: resFalha.aulas, error: diag };
  }

  return { success: force, aulas: [], error: `Erro no processamento lógico da grade.` };
}
