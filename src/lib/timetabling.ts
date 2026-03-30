
import type { Turno, TurmaComDados, ProfessorComDados, HorarioAulaGerada } from './types';

/**
 * Algoritmo de Timetabling Determinístico
 * Organiza as aulas respeitando restrições de professores, séries e turnos.
 */
export function gerarHorarioAlgoritmico(
  turno: Turno,
  turmas: TurmaComDados[],
  professores: ProfessorComDados[]
): { aulas: Omit<HorarioAulaGerada, 'id' | 'horario_id'>[] } {
  
  const aulasGeradas: Omit<HorarioAulaGerada, 'id' | 'horario_id'>[] = [];
  const diasAtivos = turno.dias_semana;
  const numAulas = turno.aulas_por_dia;

  // 1. Mapeamento de ocupação dos professores [dia][aulaIndex][professorId]
  const ocupacaoProfessores = new Set<string>();

  // 2. Preparar lista de aulas pendentes por turma
  // Cada item: { turma_id, componente_id, professor_id, tipo }
  const pendencias: { turma_id: string, componente_id: string, professor_id: string | null, tipo: 'presencial' | 'nao_presencial' }[] = [];

  for (const turma of turmas) {
    for (const comp of turma.serie.componentes) {
      // Adicionar aulas presenciais
      for (let i = 0; i < comp.aulas_presenciais; i++) {
        const profAlocado = turma.professores.find(p => p.componente_id === comp.componente_id);
        pendencias.push({
          turma_id: turma.id,
          componente_id: comp.componente_id,
          professor_id: profAlocado?.professor_id || null,
          tipo: 'presencial'
        });
      }
      // Adicionar aulas não presenciais (fora da grade)
      for (let i = 0; i < comp.aulas_nao_presenciais; i++) {
        const profAlocado = turma.professores.find(p => p.componente_id === comp.componente_id);
        aulasGeradas.push({
          turma_id: turma.id,
          componente_id: comp.componente_id,
          professor_id: profAlocado?.professor_id || null,
          dia_semana: 'contraturno',
          aula_index: 0,
          tipo: 'nao_presencial'
        });
      }
    }
  }

  // Ordenar pendências: priorizar disciplinas com professores que têm mais restrições (heurística)
  const pendenciasOrdenadas = pendencias.sort((a, b) => {
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

  // 3. Tentar alocar cada aula presencial na grade
  // Vamos percorrer slot por slot [dia][aula] para cada turma
  for (const dia of diasAtivos) {
    for (let aulaIdx = 0; aulaIdx < numAulas; aulaIdx++) {
      for (const turma of turmas) {
        // Encontrar uma aula pendente para esta turma que possa entrar neste slot
        const indexPendente = pendenciasOrdenadas.findIndex(p => {
          if (p.turma_id !== turma.id) return false;
          if (p.tipo !== 'presencial') return false;

          // Verificar restrição da SÉRIE/MODELO
          if (turma.serie.restricoes?.[dia]?.[aulaIdx] === 'proibido') {
            return false;
          }

          // Verificar se o professor está disponível
          if (p.professor_id) {
            const prof = professores.find(pr => pr.id === p.professor_id);
            
            // Regra 1: Professor não pode estar em outra turma no mesmo horário
            if (ocupacaoProfessores.has(`${dia}-${aulaIdx}-${p.professor_id}`)) {
              return false;
            }

            // Regra 2: Respeitar restrições de "indisponível" do professor
            if (prof?.restricoes?.[turno.id]?.[dia]?.[aulaIdx] === 'indisponivel') {
              return false;
            }
          }

          return true;
        });

        if (indexPendente !== -1) {
          const aulaParaAlocar = pendenciasOrdenadas.splice(indexPendente, 1)[0];
          
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

  return { aulas: aulasGeradas };
}
