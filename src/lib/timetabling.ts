
import type { Turno, TurmaComDados, ProfessorComDados, HorarioAulaGerada, ConfiguracaoGerminacao } from './types';

/**
 * Algoritmo de Timetabling com Reinicialização Aleatória, Heurística de Carga e Aulas Geminadas.
 */
export function gerarHorarioAlgoritmico(
  turno: Turno,
  turmas: TurmaComDados[],
  professores: ProfessorComDados[],
  todosTurnos: Turno[],
  configGerminacao: ConfiguracaoGerminacao[] = [],
  force: boolean = false,
  ocupacoesExistentes: any[] = [] // Ocupações de outros turnos já ativos
): { success: boolean; aulas: Omit<HorarioAulaGerada, 'id' | 'horario_id'>[]; error?: string } {
  
  const MAX_ATTEMPTS = 100; 
  let melhorTentativa: { aulas: any[], pendentes: any[] } | null = null;

  // 1. Identificar Turno Oposto para Contraturno
  const nomeTurnoLower = turno.nome.toLowerCase();
  const turnoOposto = todosTurnos.find(t => {
    if (nomeTurnoLower.includes('matutino')) return t.nome.toLowerCase().includes('vespertino');
    if (nomeTurnoLower.includes('vespertino')) return t.nome.toLowerCase().includes('matutino');
    return false;
  }) || todosTurnos.find(t => t.id !== turno.id);

  const numAulasOposto = turnoOposto?.aulas_por_dia || 5;

  // 2. Mapear ocupações existentes para consulta rápida
  const ocupacaoGlobalProfessores = new Set<string>(); // "dia-aulaIdx-profId"
  ocupacoesExistentes.forEach(o => {
      if (o.professor_id) {
          ocupacaoGlobalProfessores.add(`${o.dia_semana}-${o.aula_index}-${o.professor_id}`);
      }
  });

  // 3. Validação Prévia de Dados
  const cargaTotalPorProfessor = new Map<string, number>();
  const pendenciasFaltandoProfessor: string[] = [];

  turmas.forEach(t => {
    t.serie.componentes.forEach(c => {
      const totalAulas = (c.aulas_presenciais || 0) + (c.aulas_nao_presenciais || 0);
      if (totalAulas === 0) return;
      const aloc = t.professores.find(p => p.componente_id === c.componente_id);
      if (!aloc) {
        pendenciasFaltandoProfessor.push(`• Turma ${t.nome}: "${c.componente.nome}" sem professor.`);
      } else {
        cargaTotalPorProfessor.set(aloc.professor_id, (cargaTotalPorProfessor.get(aloc.professor_id) || 0) + totalAulas);
      }
    });
  });

  if (pendenciasFaltandoProfessor.length > 0 && !force) {
    return { success: false, aulas: [], error: `FALTAM PROFESSORES:\n${pendenciasFaltandoProfessor.join('\n')}\n\nSUGESTÃO: Aloque professores em todas as disciplinas na aba "Turmas".` };
  }

  const errosSobrecarga: string[] = [];
  cargaTotalPorProfessor.forEach((carga, profId) => {
    const prof = professores.find(p => p.id === profId);
    if (prof && carga > prof.aulas_disponiveis) {
        errosSobrecarga.push(`• ${prof.nome_horario}: Atribuídas ${carga} aulas, mas o professor só tem ${prof.aulas_disponiveis} de carga disponível.`);
    }
  });

  if (errosSobrecarga.length > 0 && !force) {
    return { success: false, aulas: [], error: `CARGA HORÁRIA EXCEDIDA:\n${errosSobrecarga.join('\n')}\n\nSUGESTÃO: Aumente as aulas disponíveis do professor ou reduza a carga horária na "Série".` };
  }

  // 4. Função Auxiliar para Criar Blocos de Aulas
  const criarBlocos = (total: number, compId: string) => {
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
  };

  // 5. Loop de Tentativas
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const aulasGeradas: Omit<HorarioAulaGerada, 'id' | 'horario_id'>[] = [];
    const ocupacaoProfessoresLocal = new Set<string>(); // "dia-aulaIdx-profId"
    const ocupacaoTurmas = new Set<string>(); // "dia-aulaIdx-turmaId"
    
    let blocosPresenciais: any[] = [];
    let blocosNaoPresenciais: any[] = [];

    turmas.forEach(t => {
      t.serie.componentes.forEach(c => {
        const profId = t.professores.find(p => p.componente_id === c.componente_id)?.professor_id || null;
        
        const pSizes = criarBlocos(c.aulas_presenciais || 0, c.componente_id);
        pSizes.forEach(size => {
            blocosPresenciais.push({ turma_id: t.id, turma_nome: t.nome, componente_id: c.componente_id, componente_nome: c.componente.nome, professor_id: profId, size, serie_restricoes: t.serie.restricoes });
        });

        const npSizes = criarBlocos(c.aulas_nao_presenciais || 0, c.componente_id);
        npSizes.forEach(size => {
            blocosNaoPresenciais.push({ turma_id: t.id, turma_nome: t.nome, componente_id: c.componente_id, componente_nome: c.componente.nome, professor_id: profId, size });
        });
      });
    });

    const sortByDifficulty = (a: any, b: any) => {
        if (a.size !== b.size) return b.size - a.size;
        const cargaA = cargaTotalPorProfessor.get(a.professor_id) || 0;
        const cargaB = cargaTotalPorProfessor.get(b.professor_id) || 0;
        if (cargaA !== cargaB) return cargaB - cargaA;
        return Math.random() - 0.5;
    };

    blocosPresenciais.sort(sortByDifficulty);
    blocosNaoPresenciais.sort(sortByDifficulty);

    const dias = [...turno.dias_semana];
    dias.sort(() => Math.random() - 0.5);

    // Tentar alocar Presenciais
    for (const b of blocosPresenciais) {
        let alocado = false;
        const slotsTentativa = [];
        for(const d of dias) {
            for(let i=0; i <= turno.aulas_por_dia - b.size; i++) {
                slotsTentativa.push({ d, i });
            }
        }
        slotsTentativa.sort(() => Math.random() - 0.5);

        for (const slot of slotsTentativa) {
            const { d, i } = slot;
            let livre = true;

            for (let k = 0; k < b.size; k++) {
                const idx = i + k;
                if (ocupacaoTurmas.has(`${d}-${idx}-${b.turma_id}`)) { livre = false; break; }
                if (b.serie_restricoes?.[d]?.[idx] === 'proibido') { livre = false; break; }
                if (b.professor_id) {
                    // Verifica ocupação local (neste horário sendo gerado)
                    if (ocupacaoProfessoresLocal.has(`${d}-${idx}-${b.professor_id}`)) { livre = false; break; }
                    // Verifica ocupação GLOBAL (outros turnos ativos)
                    if (ocupacaoGlobalProfessores.has(`${d}-${idx}-${b.professor_id}`)) { livre = false; break; }
                    
                    const prof = professores.find(pr => pr.id === b.professor_id);
                    if (prof?.restricoes?.[turno.id]?.[d]?.[idx] === 'indisponivel') { livre = false; break; }
                }
            }

            if (livre) {
                for (let k = 0; k < b.size; k++) {
                    const idx = i + k;
                    aulasGeradas.push({ turma_id: b.turma_id, componente_id: b.componente_id, professor_id: b.professor_id, dia_semana: d, aula_index: idx, tipo: 'presencial' });
                    ocupacaoTurmas.add(`${d}-${idx}-${b.turma_id}`);
                    if (b.professor_id) ocupacaoProfessoresLocal.add(`${d}-${idx}-${b.professor_id}`);
                }
                alocado = true;
                break;
            }
        }
        if (alocado) b.placed = true;
    }

    // Tentar alocar Não Presenciais (Contraturno)
    for (const b of blocosNaoPresenciais) {
        let alocado = false;
        const slotsTentativa = [];
        for(const d of dias) {
            for(let i=0; i <= numAulasOposto - b.size; i++) {
                slotsTentativa.push({ d, i });
            }
        }
        slotsTentativa.sort(() => Math.random() - 0.5);

        for (const slot of slotsTentativa) {
            const { d, i } = slot;
            let livre = true;

            for (let k = 0; k < b.size; k++) {
                const idx = i + k;
                if (ocupacaoTurmas.has(`${d}-OP-${idx}-${b.turma_id}`)) { livre = false; break; }
                if (b.professor_id && turnoOposto) {
                    if (ocupacaoProfessoresLocal.has(`${d}-OP-${idx}-${b.professor_id}`)) { livre = false; break; }
                    // Verifica ocupação GLOBAL no turno oposto
                    if (ocupacaoGlobalProfessores.has(`${d}-${idx}-${b.professor_id}`)) { livre = false; break; }

                    const prof = professores.find(pr => pr.id === b.professor_id);
                    if (prof?.restricoes?.[turnoOposto.id]?.[d]?.[idx] === 'indisponivel') { livre = false; break; }
                }
            }

            if (livre) {
                for (let k = 0; k < b.size; k++) {
                    const idx = i + k;
                    aulasGeradas.push({ turma_id: b.turma_id, componente_id: b.componente_id, professor_id: b.professor_id, dia_semana: d, aula_index: idx, tipo: 'nao_presencial' });
                    ocupacaoTurmas.add(`${d}-OP-${idx}-${b.turma_id}`);
                    if (b.professor_id) ocupacaoProfessoresLocal.add(`${d}-OP-${idx}-${b.professor_id}`);
                }
                alocado = true;
                break;
            }
        }
        if (alocado) b.placed = true;
    }

    const pendentes = [...blocosPresenciais, ...blocosNaoPresenciais].filter(b => !b.placed);

    if (pendentes.length === 0) {
      return { success: true, aulas: aulasGeradas };
    }

    if (!melhorTentativa || pendentes.length < melhorTentativa.pendentes.length) {
      melhorTentativa = { aulas: aulasGeradas, pendentes };
    }
  }

  const diagnostico: string[] = [];
  const pendentes = melhorTentativa?.pendentes || [];
  
  const agrupado = new Map<string, any>();
  pendentes.forEach(p => {
    const key = `${p.turma_id}-${p.componente_id}`;
    const curr = agrupado.get(key) || { ...p, totalAulas: 0 };
    agrupado.set(key, { ...curr, totalAulas: curr.totalAulas + p.size });
  });

  agrupado.forEach(p => {
    const prof = professores.find(pr => pr.id === p.professor_id);
    diagnostico.push(`• Turma ${p.turma_nome}: "${p.componente_nome}" (${p.totalAulas} aulas pendentes).\n  SUGESTÃO: O professor ${prof?.nome_horario || 'especificado'} pode estar sem janelas livres ou ocupado em outro turno ativo.`);
  });

  return {
    success: force,
    aulas: melhorTentativa?.aulas || [],
    error: `CONFLITO LÓGICO: Após 100 tentativas, ${pendentes.reduce((s,b)=>s+b.size, 0)} aulas não couberam.\n\n${diagnostico.join('\n\n')}`
  };
}
