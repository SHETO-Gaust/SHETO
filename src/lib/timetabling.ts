
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
): { aulas: Omit<HorarioAulaGerada, 'id' | 'horario_id'>[] } {
  
  const aulasGeradas: Omit<HorarioAulaGerada, 'id' | 'horario_id'>[] = [];
  const diasAtivos = turno.dias_semana;
  const numAulas = turno.aulas_por_dia;

  // 1. Identificar Turno Oposto para Contraturno
  const nomeTurnoLower = turno.nome.toLowerCase();
  const turnoOposto = todosTurnos.find(t => {
    if (nomeTurnoLower.includes('matutino')) return t.nome.toLowerCase().includes('vespertino');
    if (nomeTurnoLower.includes('vespertino')) return t.nome.toLowerCase().includes('matutino');
    return false;
  }) || todosTurnos.find(t => t.id !== turno.id); // Fallback para qualquer outro se não achar pelo nome

  const numAulasOposto = turnoOposto?.aulas_por_dia || 5;

  // 2. Mapeamento de ocupação dos professores [dia][aulaIndex][professorId]
  const ocupacaoProfessores = new Set<string>();

  // 3. Preparar lista de aulas pendentes por turma
  const pendenciasPresenciais: { turma_id: string, componente_id: string, professor_id: string | null }[] = [];
  const pendenciasNP: { turma_id: string, componente_id: string, professor_id: string | null }[] = [];

  for (const turma of turmas) {
    for (const comp of turma.serie.componentes) {
      const profAlocado = turma.professores.find(p => p.componente_id === comp.componente_id);
      
      // Aulas Presenciais
      for (let i = 0; i < comp.aulas_presenciais; i++) {
        pendenciasPresenciais.push({
          turma_id: turma.id,
          componente_id: comp.componente_id,
          professor_id: profAlocado?.professor_id || null,
        });
      }
      
      // Aulas Não Presenciais
      for (let i = 0; i < comp.aulas_nao_presenciais; i++) {
        pendenciasNP.push({
          turma_id: turma.id,
          componente_id: comp.componente_id,
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
  // Usamos os mesmos dias ativos, mas os slots do turno oposto
  for (const dia of diasAtivos) {
    for (let aulaIdx = 0; aulaIdx < numAulasOposto; aulaIdx++) {
      for (const turma of turmas) {
        const indexPendente = npOrdenadas.findIndex(p => {
          if (p.turma_id !== turma.id) return false;
          // No contraturno, a restrição da série não se aplica da mesma forma, 
          // mas o professor não pode estar ocupado no turno oposto se ele também der aula lá
          if (p.professor_id) {
            if (ocupacaoProfessores.has(`${dia}-oposto-${aulaIdx}-${p.professor_id}`)) return false;
            // Verifica se o professor tem restrição no turno oposto
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

  return { aulas: aulasGeradas };
}
