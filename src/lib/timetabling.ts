
import type { Turno, TurmaComDados, ProfessorComDados, HorarioAulaGerada, ConfiguracaoGerminacao } from './types';

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
 * Algoritmo de Timetabling com Reinicialização Aleatória, Heurística de Carga e Diagnóstico de Erros.
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
  
  // 1. Identificar Turno Oposto para Contraturno
  const nomeTurnoLower = turno.nome.toLowerCase();
  const turnoOposto = todosTurnos.find(t => {
    if (nomeTurnoLower.includes('matutino')) return t.nome.toLowerCase().includes('vespertino');
    if (nomeTurnoLower.includes('vespertino')) return t.nome.toLowerCase().includes('matutino');
    return false;
  }) || todosTurnos.find(t => t.id !== turno.id);

  const numAulasOposto = turnoOposto?.aulas_por_dia || 5;

  // Separar ocupações em Fixas (Presenciais) e Flexíveis (NP de outros turnos)
  const ocupacaoFixaProfessores = new Set<string>();
  const ocupacaoFlexivel = ocupacoesExistentes.filter(o => o.tipo === 'nao_presencial');
  
  ocupacoesExistentes.forEach(o => {
      if (o.professor_id && o.tipo === 'presencial') {
          ocupacaoFixaProfessores.add(`${o.dia_semana}-${o.aula_index}-${o.professor_id}`);
      }
  });

  // Validação de Carga Pedagógica
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

  const executarTentativa = (permitirMoverNP: boolean) => {
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

    // --- ALOCAÇÃO PRESENCIAL ---
    for (const b of blocosPresenciais) {
        let alocado = false;
        const slots = [];
        for(const d of dias) for(let i=0; i <= turno.aulas_por_dia - b.size; i++) slots.push({ d, i });
        slots.sort(() => Math.random() - 0.5);

        for (const slot of slots) {
            const { d, i } = slot;
            let livre = true;
            const currentBumped = new Set<string>();

            // Regra: Professor não dá disciplinas diferentes no mesmo dia para a mesma turma
            if (b.professor_id && turmaDiaProfessorDisciplina.get(`${d}-${b.turma_id}-${b.professor_id}`) && turmaDiaProfessorDisciplina.get(`${d}-${b.turma_id}-${b.professor_id}`) !== b.componente_id) livre = false;
            
            // Regra: Máximo de aulas por dia do componente (Geminação)
            if ((turmaDiaComponenteCount.get(`${d}-${b.turma_id}-${b.componente_id}`) || 0) + b.size > b.maxAulasPorDia) livre = false;

            if (!livre) continue;

            for (let k = 0; k < b.size; k++) {
                const idx = i + k;
                if (ocupacaoTurmas.has(`${d}-${idx}-${b.turma_id}`)) { livre = false; break; }
                if (b.serie_restricoes?.[d]?.[idx] === 'proibido') { livre = false; break; }
                
                if (b.professor_id) {
                    if (ocupacaoProfessoresLocal.has(`${d}-${idx}-${b.professor_id}`)) { livre = false; break; }
                    if (ocupacaoFixaProfessores.has(`${d}-${idx}-${b.professor_id}`)) { livre = false; break; }
                    
                    const npConflict = ocupacaoFlexivel.find(o => o.professor_id === b.professor_id && o.dia_semana === d && o.aula_index === idx);
                    if (npConflict) {
                        if (permitirMoverNP) currentBumped.add(npConflict.id);
                        else { livre = false; break; }
                    }

                    const prof = professores.find(pr => pr.id === b.professor_id);
                    const restricao = prof?.restricoes?.[turno.id]?.[d]?.[idx];
                    // PLANEJAMENTO AGORA É TRATADO COMO INDISPONÍVEL (HARD BLOCK)
                    if (restricao === 'indisponivel' || restricao === 'planejamento') { livre = false; break; }
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

    // --- ALOCAÇÃO NÃO PRESENCIAL (CONTRATURNO) ---
    if (turnoOposto) {
        for (const b of blocosNaoPresenciais) {
            let alocado = false;
            const slotsNP = [];
            for(const d of dias) for(let i=0; i <= numAulasOposto - b.size; i++) slotsNP.push({ d, i });
            slotsNP.sort(() => Math.random() - 0.5);

            for (const slot of slotsNP) {
                const { d, i } = slot;
                let livre = true;

                if (b.professor_id) {
                    for (let k = 0; k < b.size; k++) {
                        const idx = i + k;
                        const conflictKey = `${d}-${idx}-${b.professor_id}`;
                        if (ocupacaoFixaProfessores.has(conflictKey)) { livre = false; break; }
                        
                        const prof = professores.find(pr => pr.id === b.professor_id);
                        const restricaoOposta = prof?.restricoes?.[turnoOposto.id]?.[d]?.[idx];
                        // PLANEJAMENTO TAMBÉM BLOQUEIA CONTRATURNO
                        if (restricaoOposta === 'indisponivel' || restricaoOposta === 'planejamento') { livre = false; break; }
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

  let melhorTentativa: any = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const res = executarTentativa(false);
    if (res.success) return { success: true, aulas: res.aulas };
    if (!melhorTentativa || res.pendentes.length < melhorTentativa.pendentes.length) melhorTentativa = res;
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const res = executarTentativa(true);
    if (res.success) {
        const sugestoes: SugestaoRealocacao[] = [];
        let realocacaoPossivel = true;
        const ocupacaoAtualTurno = new Set(res.aulas.map(a => `${a.dia_semana}-${a.aula_index}-${a.professor_id}`));

        for (const npId of res.bumpedNPs) {
            const aulaNP = ocupacaoFlexivel.find(o => o.id === npId);
            if (!aulaNP) continue;

            let acheiNovo = false;
            for (const d of turno.dias_semana) {
                for (let i = 0; i < turno.aulas_por_dia; i++) {
                    const key = `${d}-${i}-${aulaNP.professor_id}`;
                    if (!ocupacaoAtualTurno.has(key) && !ocupacaoFixaProfessores.has(key)) {
                        sugestoes.push({
                            horario_id: aulaNP.horario_id,
                            aula_id: aulaNP.id,
                            professor_nome: aulaNP.professor.nome_horario,
                            turma_nome: aulaNP.turma.nome,
                            disciplina_nome: aulaNP.componente.nome,
                            dia_antigo: aulaNP.dia_semana,
                            aula_idx_antigo: aulaNP.aula_index,
                            dia_novo: d,
                            aula_idx_novo: i
                        });
                        ocupacaoAtualTurno.add(key);
                        acheiNovo = true;
                        break;
                    }
                }
                if (acheiNovo) break;
            }
            if (!acheiNovo) { realocacaoPossivel = false; break; }
        }
        if (realocacaoPossivel) return { success: true, aulas: res.aulas, sugestao: sugestoes };
    }
  }

  if (melhorTentativa) {
      const p = melhorTentativa.pendentes[0];
      let diag = `Não foi possível alocar todas as aulas após ${MAX_ATTEMPTS} tentativas.\n\n`;
      diag += `GARGALO DETECTADO:\n`;
      diag += `A disciplina "${p.componente_nome}" do professor ${p.professor_nome} na Turma ${p.turma_nome} não encontrou espaço.\n\n`;
      diag += `SUGESTÕES DE CORREÇÃO:\n`;
      diag += `1. Verifique se o professor ${p.professor_nome} possui muitas restrições de folga ou planejamento na aba "Professores".\n`;
      diag += `2. Tente desativar a "Geminação" para a disciplina ${p.componente_nome} no passo anterior da geração.\n`;
      diag += `3. Verifique se este professor está sobrecarregado com muitas turmas simultâneas.\n`;
      diag += `4. Se o erro persistir, você pode "Gerar Mesmo com Erros" para ver visualmente onde as janelas estão faltando.`;
      
      return { success: force, aulas: melhorTentativa.aulas, error: diag };
  }

  return { success: force, aulas: [], error: `Erro desconhecido durante o processamento.` };
}
