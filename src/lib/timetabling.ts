import type { Turno, TurmaComDados, ProfessorComDados, HorarioAulaGerada } from './types';

/**
 * Algoritmo de Timetabling Determinístico com Diagnóstico de Erros e Suporte a Geração Parcial
 */
export function gerarHorarioAlgoritmico(
  turno: Turno,
  turmas: TurmaComDados[],
  professores: ProfessorComDados[],
  todosTurnos: Turno[],
  force: boolean = false
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

  // 3. Validar se todas as disciplinas com carga horária possuem professores alocados
  const pendenciasFaltandoProfessor: string[] = [];
  const pendenciasPresenciais: { id: string, turma_id: string, turma_nome: string, componente_id: string, componente_nome: string, professor_id: string | null }[] = [];
  const pendenciasNP: { id: string, turma_id: string, turma_nome: string, componente_id: string, componente_nome: string, professor_id: string | null }[] = [];

  for (const turma of turmas) {
    for (const comp of turma.serie.componentes) {
      const aulasTotais = (comp.aulas_presenciais || 0) + (comp.aulas_nao_presenciais || 0);
      if (aulasTotais === 0) continue;

      const profAlocado = turma.professores.find(p => p.componente_id === comp.componente_id);
      
      if (!profAlocado) {
        pendenciasFaltandoProfessor.push(`Turma ${turma.nome}: Disciplina "${comp.componente.nome}" está sem professor.`);
        continue;
      }

      // Aulas Presenciais
      for (let i = 0; i < comp.aulas_presenciais; i++) {
        pendenciasPresenciais.push({
          id: `${turma.id}-${comp.componente_id}-P-${i}`,
          turma_id: turma.id,
          turma_nome: turma.nome,
          componente_id: comp.componente_id,
          componente_nome: comp.componente.nome,
          professor_id: profAlocado.professor_id,
        });
      }
      
      // Aulas Não Presenciais
      for (let i = 0; i < comp.aulas_nao_presenciais; i++) {
        pendenciasNP.push({
          id: `${turma.id}-${comp.componente_id}-NP-${i}`,
          turma_id: turma.id,
          turma_nome: turma.nome,
          componente_id: comp.componente_id,
          componente_nome: comp.componente.nome,
          professor_id: profAlocado.professor_id,
        });
      }
    }
  }

  if (pendenciasFaltandoProfessor.length > 0 && !force) {
    return {
      success: false,
      aulas: [],
      error: `Faltam alocações de professores:\n${pendenciasFaltandoProfessor.join('\n')}`
    };
  }

  // Ordenar pendências: priorizar professores com mais restrições (Heurística)
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

  let presenciaisOrdenadas = sortHeuristic(pendenciasPresenciais);
  let npOrdenadas = sortHeuristic(pendenciasNP);

  // 4. Alocar Aulas Presenciais (Turno Regular)
  for (const dia of diasAtivos) {
    for (let aulaIdx = 0; aulaIdx < numAulas; aulaIdx++) {
      for (const turma of turmas) {
        const jaTemAula = aulasGeradas.some(a => a.turma_id === turma.id && a.dia_semana === dia && a.aula_index === aulaIdx && a.tipo === 'presencial');
        if (jaTemAula) continue;

        const indexPendente = presenciaisOrdenadas.findIndex(p => {
          if (p.turma_id !== turma.id) return false;
          if (turma.serie.restricoes?.[dia]?.[aulaIdx] === 'proibido') return false;
          if (p.professor_id) {
            if (ocupacaoProfessores.has(`${dia}-${aulaIdx}-${p.professor_id}`)) return false;
            const prof = professores.find(pr => pr.id === p.professor_id);
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

  // 6. Diagnóstico de Pendências
  if (presenciaisOrdenadas.length > 0 || npOrdenadas.length > 0) {
    const pendencias = [...presenciaisOrdenadas, ...npOrdenadas];
    const diagnostico: string[] = [];

    const agrupado = new Map<string, { count: number, turma: string, comp: string, profId: string | null }>();
    pendencias.forEach(p => {
        const key = `${p.turma_id}-${p.componente_id}`;
        const current = agrupado.get(key) || { count: 0, turma: p.turma_nome, comp: p.componente_nome, profId: p.professor_id };
        agrupado.set(key, { ...current, count: current.count + 1 });
    });

    agrupado.forEach((val) => {
        const prof = professores.find(p => p.id === val.profId);
        let motivo = "Conflitos de horário ou restrições excessivas.";
        let acao = "Revise as restrições da série ou do professor.";
        
        if (prof) {
            let slotsLivresProfessor = 0;
            diasAtivos.forEach(dia => {
                for (let i = 0; i < numAulas; i++) {
                    const indisponivel = prof.restricoes?.[turno.id]?.[dia]?.[i] === 'indisponivel';
                    if (!indisponivel) slotsLivresProfessor++;
                }
            });

            if (slotsLivresProfessor < val.count) {
                motivo = `O professor ${prof.nome_horario} está sem horários livres suficientes neste turno (tem ${slotsLivresProfessor} slots mas precisa de ${val.count} para esta disciplina).`;
                acao = `Ação Corretiva: Vá em 'Professores' e remova restrições de 'Indisponível' para ${prof.nome_horario}, ou reduza as aulas desta disciplina na 'Série'.`;
            } else {
                motivo = `O professor ${prof.nome_horario} já está ocupado em outras turmas nos poucos horários em que a Turma ${val.turma} está livre.`;
                acao = `Ação Corretiva: Tente liberar horários na Turma ${val.turma} (remova restrições 'Proibido' na Série) ou mude o professor desta disciplina para alguém com mais janelas livres.`;
            }
        }

        diagnostico.push(`• Turma ${val.turma}: "${val.comp}" (${val.count} aulas restantes).\n  ${motivo}\n  → ${acao}`);
    });

    if (!force) {
        return {
            success: false,
            aulas: [],
            error: `Não foi possível alocar todas as aulas:\n\n${diagnostico.join('\n\n')}`
        };
    }
  }

  return { success: true, aulas: aulasGeradas };
}
