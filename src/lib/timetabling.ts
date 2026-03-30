import type { Turno, TurmaComDados, ProfessorComDados, HorarioAulaGerada } from './types';

/**
 * Algoritmo de Timetabling Determinístico
 * Organiza as aulas respeitando restrições de professores, séries e turnos.
 */
export function gerarHorarioAlgoritmico(
  turno: Turno,
  turmas: TurmaComDados[],
  professores: ProfessorComDados[],
  todosTurnos: Turno[]
): { success: boolean; aulas: Omit<HorarioAulaGerada, 'id' | 'horario_id'>[]; error?: string } {
  
  const aulasGeradas: Omit<HorarioAulaGerada, 'id' | 'horario_id'>[] = [];
  const diasAtivos = turno.dias_semana;
  const numAulas = turno.aulas_por_dia;

  // 1. Identificar Turno Oposto para Contraturno
  const nomeTurnoLower = turno.nome.toLowerCase();
  const turnoOposto = todosTurnos.find(t => {
    if (nomeTurnoLower.includes('matutino')) return t.nome.toLowerCase().includes('vespertino');
    if (nomeTurnoLower.includes('vespertino')) return t.nome.toLowerCase().includes('matutino');
    return false;
  }) || todosTurnos.find(t => t.id !== turno.id);

  const numAulasOposto = turnoOposto?.aulas_por_dia || 5;

  // 2. Mapeamento de ocupação dos professores [dia][aulaIndex][professorId]
  const ocupacaoProfessores = new Set<string>();

  // 3. Preparar lista de aulas pendentes por turma
  const pendenciasPresenciais: { turma_id: string, turma_nome: string, componente_id: string, componente_nome: string, professor_id: string | null }[] = [];
  const pendenciasNP: { turma_id: string, turma_nome: string, componente_id: string, componente_nome: string, professor_id: string | null }[] = [];

  for (const turma of turmas) {
    for (const comp of turma.serie.componentes) {
      const profAlocado = turma.professores.find(p => p.componente_id === comp.componente_id);
      
      // Aulas Presenciais
      for (let i = 0; i < comp.aulas_presenciais; i++) {
        pendenciasPresenciais.push({
          turma_id: turma.id,
          turma_nome: turma.nome,
          componente_id: comp.componente_id,
          componente_nome: comp.componente.nome,
          professor_id: profAlocado?.professor_id || null,
        });
      }
      
      // Aulas Não Presenciais
      for (let i = 0; i < comp.aulas_nao_presenciais; i++) {
        pendenciasNP.push({
          turma_id: turma.id,
          turma_nome: turma.nome,
          componente_id: comp.componente_id,
          componente_nome: comp.componente.nome,
          professor_id: profAlocado?.professor_id || null,
        });
      }
    }
  }

  // Ordenar pendências: priorizar disciplinas com professores que têm mais restrições
  const sortHeuristic = (list: any[]) => [...list].sort((a, b) => {
    const profA = professores.find(p => p.id === a.professor_id);
    const profB = professores.find(p => p.id === b.professor_id);
    
    const countRestricoes = (p: any) => {
        if (!p?.restricoes?.[turno.id]) return 0;
        let total = 0;
        Object.values(p.restricoes[turno.id]).forEach((dia: any) => {
            total += Object.keys(dia).length;
        });
        return total;
    };

    return countRestricoes(profB) - countRestricoes(profA);
  });

  const presenciaisOrdenadas = sortHeuristic(pendenciasPresenciais);
  const npOrdenadas = sortHeuristic(pendenciasNP);

  // 4. Alocar Aulas Presenciais (Turno Regular)
  for (const dia of diasAtivos) {
    for (let aulaIdx = 0; aulaIdx < numAulas; aulaIdx++) {
      for (const turma of turmas) {
        const indexPendente = presenciaisOrdenadas.findIndex(p => {
          if (p.turma_id !== turma.id) return false;
          if (turma.serie.restricoes?.[dia]?.[aulaIdx] === 'proibido') return false;
          if (p.professor_id) {
            const prof = professores.find(pr => pr.id === p.professor_id);
            if (ocupacaoProfessores.has(`${dia}-${aulaIdx}-${p.professor_id}`)) return false;
            if (prof?.restricoes?.[turno.id]?.[dia]?.[aulaIdx] === 'indisponivel') return false;
          }
          return true;
        });

        if (indexPendente !== -1) {
          const aulaParaAlocar = presenciaisOrdenadas.splice(indexPendente, 1)[0];
          aulasGeradas.push({
            turma_id: aulaParaAlocar.turma_id,
            componente_id: aulaParaAlocar.componente_id,
            professor_id: aulaParaAlocar.professor_id,
            dia_semana: dia,
            aula_index: aulaIdx,
            tipo: 'presencial'
          });
          if (aulaParaAlocar.professor_id) {
            ocupacaoProfessores.add(`${dia}-${aulaIdx}-${aulaParaAlocar.professor_id}`);
          }
        }
      }
    }
  }

  // 5. Alocar Aulas Não Presenciais (No Turno Oposto)
  for (const dia of diasAtivos) {
    for (let aulaIdx = 0; aulaIdx < numAulasOposto; aulaIdx++) {
      for (const turma of turmas) {
        const indexPendente = npOrdenadas.findIndex(p => {
          if (p.turma_id !== turma.id) return false;
          if (p.professor_id) {
            if (ocupacaoProfessores.has(`${dia}-oposto-${aulaIdx}-${p.professor_id}`)) return false;
            if (turnoOposto) {
                const prof = professores.find(pr => pr.id === p.professor_id);
                if (prof?.restricoes?.[turnoOposto.id]?.[dia]?.[aulaIdx] === 'indisponivel') return false;
            }
          }
          return true;
        });

        if (indexPendente !== -1) {
          const aulaParaAlocar = npOrdenadas.splice(indexPendente, 1)[0];
          aulasGeradas.push({
            turma_id: aulaParaAlocar.turma_id,
            componente_id: aulaParaAlocar.componente_id,
            professor_id: aulaParaAlocar.professor_id,
            dia_semana: dia,
            aula_index: aulaIdx,
            tipo: 'nao_presencial'
          });
          if (aulaParaAlocar.professor_id) {
            ocupacaoProfessores.add(`${dia}-oposto-${aulaIdx}-${aulaParaAlocar.professor_id}`);
          }
        }
      }
    }
  }

  // 6. Verificação Final: Carga Horária Completa?
  if (presenciaisOrdenadas.length > 0 || npOrdenadas.length > 0) {
    const pendenciasRestantes = [...presenciaisOrdenadas, ...npOrdenadas];
    const turmasAfetadas = Array.from(new Set(pendenciasRestantes.map(p => p.turma_nome)));
    const componentesAfetados = Array.from(new Set(pendenciasRestantes.map(p => p.componente_nome)));
    
    return {
      success: false,
      aulas: [],
      error: `Não foi possível alocar toda a carga horária. Verifique as restrições dos professores ou choque de horários. Turmas com pendências: ${turmasAfetadas.join(', ')}. Disciplinas afetadas: ${componentesAfetados.join(', ')}.`
    };
  }

  return { success: true, aulas: aulasGeradas };
}