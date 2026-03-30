import type { Turno, TurmaComDados, ProfessorComDados, HorarioAulaGerada } from './types';

/**
 * Algoritmo de Timetabling com Reinicialização Aleatória e Heurística de Carga
 * Resolve o problema de "deadlocks" lógicos tentando múltiplas combinações.
 */
export function gerarHorarioAlgoritmico(
  turno: Turno,
  turmas: TurmaComDados[],
  professores: ProfessorComDados[],
  todosTurnos: Turno[],
  force: boolean = false
): { success: boolean; aulas: Omit<HorarioAulaGerada, 'id' | 'horario_id'>[]; error?: string } {
  
  const MAX_ATTEMPTS = 50; // Tenta 50 combinações diferentes antes de desistir
  let melhorTentativa: { aulas: any[], pendentes: any[], erroMsg?: string } | null = null;

  // 1. Identificar Turno Oposto para Contraturno
  const nomeTurnoLower = turno.nome.toLowerCase();
  const turnoOposto = todosTurnos.find(t => {
    if (nomeTurnoLower.includes('matutino')) return t.nome.toLowerCase().includes('vespertino');
    if (nomeTurnoLower.includes('vespertino')) return t.nome.toLowerCase().includes('matutino');
    return false;
  }) || todosTurnos.find(t => t.id !== turno.id);

  const numAulasOposto = turnoOposto?.aulas_por_dia || 5;

  // 2. Validação Prévia de Carga (Essencial antes de tentar gerar)
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
    return { success: false, aulas: [], error: `PROFESSORES NÃO ALOCADOS:\n${pendenciasFaltandoProfessor.join('\n')}` };
  }

  const errosSobrecarga: string[] = [];
  cargaTotalPorProfessor.forEach((carga, profId) => {
    const prof = professores.find(p => p.id === profId);
    if (prof && carga > prof.aulas_disponiveis) {
        errosSobrecarga.push(`• ${prof.nome_horario}: Precisa de ${carga} aulas, mas só tem ${prof.aulas_disponiveis} disponíveis.`);
    }
  });

  if (errosSobrecarga.length > 0 && !force) {
    return { success: false, aulas: [], error: `CARGA HORÁRIA EXCEDIDA:\n${errosSobrecarga.join('\n')}\n\nSUGESTÃO: Aumente as aulas disponíveis do professor.` };
  }

  // 3. Loop de Tentativas (Randomized Restarts)
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const aulasGeradas: Omit<HorarioAulaGerada, 'id' | 'horario_id'>[] = [];
    const ocupacaoProfessores = new Set<string>();
    
    // Criar lista de aulas pendentes
    let presenciais: any[] = [];
    let naoPresenciais: any[] = [];

    turmas.forEach(t => {
      t.serie.componentes.forEach(c => {
        const profId = t.professores.find(p => p.componente_id === c.componente_id)?.professor_id || null;
        for (let i = 0; i < (c.aulas_presenciais || 0); i++) {
          presenciais.push({ turma_id: t.id, turma_nome: t.nome, componente_id: c.componente_id, componente_nome: c.componente.nome, professor_id: profId, serie_restricoes: t.serie.restricoes });
        }
        for (let i = 0; i < (c.aulas_nao_presenciais || 0); i++) {
          naoPresenciais.push({ turma_id: t.id, turma_nome: t.nome, componente_id: c.componente_id, componente_nome: c.componente.nome, professor_id: profId });
        }
      });
    });

    // HEURÍSTICA: Ordenar por professores que têm MAIS aulas no total (os mais difíceis)
    // E aplicar um pouco de aleatoriedade no desempate para cada tentativa
    const sortByDifficulty = (a: any, b: any) => {
        const cargaA = cargaTotalPorProfessor.get(a.professor_id) || 0;
        const cargaB = cargaTotalPorProfessor.get(b.professor_id) || 0;
        if (cargaA !== cargaB) return cargaB - cargaA;
        return Math.random() - 0.5;
    };

    presenciais.sort(sortByDifficulty);
    naoPresenciais.sort(sortByDifficulty);

    // Embaralhar a ordem dos dias e turmas para esta tentativa
    const diasEmbaralhados = [...turno.dias_semana].sort(() => Math.random() - 0.5);
    const turmasEmbaralhadas = [...turmas].sort(() => Math.random() - 0.5);

    // Tentar alocar presenciais
    for (const dia of diasEmbaralhados) {
      for (let aulaIdx = 0; aulaIdx < turno.aulas_por_dia; aulaIdx++) {
        for (const turma of turmasEmbaralhadas) {
          const indexPendente = presenciais.findIndex(p => {
            if (p.turma_id !== turma.id) return false;
            if (p.serie_restricoes?.[dia]?.[aulaIdx] === 'proibido') return false;
            if (p.professor_id) {
              if (ocupacaoProfessores.has(`${dia}-${aulaIdx}-${p.professor_id}`)) return false;
              const prof = professores.find(pr => pr.id === p.professor_id);
              if (prof?.restricoes?.[turno.id]?.[dia]?.[aulaIdx] === 'indisponivel') return false;
            }
            return true;
          });

          if (indexPendente !== -1) {
            const aula = presenciais.splice(indexPendente, 1)[0];
            aulasGeradas.push({ turma_id: aula.turma_id, componente_id: aula.componente_id, professor_id: aula.professor_id, dia_semana: dia, aula_index: aulaIdx, tipo: 'presencial' });
            if (aula.professor_id) ocupacaoProfessores.add(`${dia}-${aulaIdx}-${aula.professor_id}`);
          }
        }
      }
    }

    // Tentar alocar não presenciais (Contraturno)
    for (const dia of diasEmbaralhados) {
      for (let aulaIdx = 0; aulaIdx < numAulasOposto; aulaIdx++) {
        for (const turma of turmasEmbaralhadas) {
          const indexPendente = naoPresenciais.findIndex(p => {
            if (p.turma_id !== turma.id) return false;
            if (p.professor_id) {
              if (ocupacaoProfessores.has(`${dia}-OP-${aulaIdx}-${p.professor_id}`)) return false;
              if (turnoOposto) {
                const prof = professores.find(pr => pr.id === p.professor_id);
                if (prof?.restricoes?.[turnoOposto.id]?.[dia]?.[aulaIdx] === 'indisponivel') return false;
              }
            }
            return true;
          });

          if (indexPendente !== -1) {
            const aula = naoPresenciais.splice(indexPendente, 1)[0];
            aulasGeradas.push({ turma_id: aula.turma_id, componente_id: aula.componente_id, professor_id: aula.professor_id, dia_semana: dia, aula_index: aulaIdx, tipo: 'nao_presencial' });
            if (aula.professor_id) ocupacaoProfessores.add(`${dia}-OP-${aulaIdx}-${aula.professor_id}`);
          }
        }
      }
    }

    // Se conseguiu alocar TUDO, retorna imediatamente
    if (presenciais.length === 0 && naoPresenciais.length === 0) {
      return { success: true, aulas: aulasGeradas };
    }

    // Se não, guarda a melhor tentativa até agora
    if (!melhorTentativa || (presenciais.length + naoPresenciais.length) < (melhorTentativa.pendentes.length)) {
      melhorTentativa = { aulas: aulasGeradas, pendentes: [...presenciais, ...naoPresenciais] };
    }
  }

  // 4. Se chegou aqui, falhou após todas as tentativas. Gera diagnóstico do melhor rascunho.
  const diagnostico: string[] = [];
  const pendentes = melhorTentativa?.pendentes || [];
  
  const agrupado = new Map<string, any>();
  pendentes.forEach(p => {
    const key = `${p.turma_id}-${p.componente_id}`;
    const curr = agrupado.get(key) || { ...p, count: 0 };
    agrupado.set(key, { ...curr, count: curr.count + 1 });
  });

  agrupado.forEach(p => {
    const prof = professores.find(pr => pr.id === p.professor_id);
    diagnostico.push(`• Turma ${p.turma_nome}: "${p.componente_nome}" (${p.count} aulas pendentes).\n  SUGESTÃO: Verifique se o professor ${prof?.nome_horario || 'especificado'} não está com excesso de turmas ou pouca disponibilidade.`);
  });

  return {
    success: force,
    aulas: melhorTentativa?.aulas || [],
    error: `CONFLITO LÓGICO: O sistema tentou ${MAX_ATTEMPTS} combinações mas ${pendentes.length} aulas não couberam.\n\n${diagnostico.join('\n\n')}`
  };
}
