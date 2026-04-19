import type { Turno } from './types';

export type AulaRefino = {
  id: string;
  horario_id: string;
  turma_id: string;
  turma_nome: string;
  componente_id: string;
  componente_nome: string;
  componente_sigla: string;
  professor_id: string | null;
  professor_nome: string;
  professor_cpf?: string | null;
  dia_semana: string;
  aula_index: number;
  tipo: 'presencial' | 'nao_presencial';
  turno_id: string;
};

export type Move = {
  aulaId: string;
  novoDia: string;
  novoSlot: number;
  novoTurnoId: string;
};

export type Possibilidade = {
  id: string;
  moves: Move[];
  impactoTurmas: number;
  impactoProfessores: number;
  qtdMovimentos: number;
  // Detalhamento textual de cada passo
  passos: string[];
};

export type ImpactoAnalise = {
  status: 'livre' | 'sugestao' | 'atencao' | 'bloqueado' | 'possibilidades';
  mensagem: string;
  mudancasNecessarias: Move[]; 
  possibilidades?: Possibilidade[]; 
};

// ============================================
// Time & Conflict Helpers
// ============================================

function timeToMinutes(hhmm: string | undefined | null): number {
  if (!hhmm) return -1;
  const parts = hhmm.split(':');
  if (parts.length < 2) return -1;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return -1;
  return h * 60 + m;
}

function getSlotMinutes(turno: Turno | undefined, aulaIdx: number): [number, number] {
  const h = turno?.horarios?.[aulaIdx];
  if (!h) return [-1, -1];
  return [timeToMinutes(h.inicio), timeToMinutes(h.fim)];
}

function minutesConflitam(
  ini1: number, fim1: number,
  ini2: number, fim2: number,
): boolean {
  if (ini1 < 0 || fim1 < 0 || ini2 < 0 || fim2 < 0) return false;
  return ini1 < fim2 && ini2 < fim1;
}

function getProfessorKey(professorId: string | null, cpf?: string | null): string | null {
  if (!professorId) return null;
  if (cpf && cpf.replace(/\D/g, '').length >= 11) return `cpf:${cpf.replace(/\D/g, '')}`;
  return `id:${professorId}`;
}

// ============================================
// BFS Solver Graph Engine
// ============================================

type SlotAddress = { dia: string; slot: number; turnoId: string };

type SolverState = {
  moves: Move[];
  openTargetSlots: SlotAddress[];
  displacedLessons: AulaRefino[];
  simulatedAssignments: Map<string, string>; // aulaId -> JSON
  depth: number;
};

// Max DFS/BFS limits to prevent UI freezing
const MAX_DEPTH = 3;
const MAX_TIME_MS = 2000;
const MAX_SOLUTIONS = 5;

function hashState(moves: Move[]): string {
  // Sort moves by aulaId to ensure identical final configurations hash identically
  const sorted = [...moves].sort((a, b) => a.aulaId.localeCompare(b.aulaId));
  return sorted.map(m => `${m.aulaId}:${m.novoDia}:${m.novoSlot}`).join('|');
}

export function analisarMovimento(
  todasAulas: AulaRefino[],
  turnosById: Map<string, Turno>,
  aulaId: string,
  diaDestino: string,
  slotDestino: number,
  turnoDestinoId: string,
  runDeepSearch: boolean = false
): ImpactoAnalise {
  const startMs = Date.now();
  const aulaOrigem = todasAulas.find(a => a.id === aulaId);
  if (!aulaOrigem) {
    return { status: 'bloqueado', mensagem: 'Aula origem não encontrada.', mudancasNecessarias: [] };
  }

  const au_turmaId = aulaOrigem.turma_id;

  if (diaDestino === aulaOrigem.dia_semana && slotDestino === aulaOrigem.aula_index && turnoDestinoId === aulaOrigem.turno_id) {
    return { status: 'livre', mensagem: 'A aula já encontra-se neste slot.', mudancasNecessarias: [] };
  }

  // Se não foi ativado o deep search, fazemos a validação inicial.
  const turnosOrigem = turnosById.get(aulaOrigem.turno_id);
  const [iniDest, fimDest] = getSlotMinutes(turnosById.get(turnoDestinoId), slotDestino);

  // Achar se ha alguem da Turma no destino
  const turmaNoDestinoAqui = todasAulas.find(a => 
    a.id !== aulaOrigem.id && a.turma_id === aulaOrigem.turma_id &&
    a.dia_semana === diaDestino && a.aula_index === slotDestino && a.turno_id === turnoDestinoId
  );

  // Achar conflito de linha cronologica absoluta da TURMA 
  const turmaNoDestinoTempo = todasAulas.find(a => 
    a.id !== aulaOrigem.id && a.turma_id === aulaOrigem.turma_id &&
    a.dia_semana === diaDestino && 
    (() => {
        const [iA, fA] = getSlotMinutes(turnosById.get(a.turno_id), a.aula_index);
        return minutesConflitam(iniDest, fimDest, iA, fA);
    })()
  );
  
  const profKey = getProfessorKey(aulaOrigem.professor_id, aulaOrigem.professor_cpf);
  const profNoDestinoTempo = !profKey ? null : todasAulas.find(a => 
      a.id !== aulaOrigem.id && a.professor_id &&
      getProfessorKey(a.professor_id, a.professor_cpf) === profKey &&
      a.dia_semana === diaDestino &&
      (() => {
          const [iA, fA] = getSlotMinutes(turnosById.get(a.turno_id), a.aula_index);
          return minutesConflitam(iniDest, fimDest, iA, fA);
      })()
  );

  const temConflitoNaRaiz = !!turmaNoDestinoAqui || !!turmaNoDestinoTempo || !!profNoDestinoTempo;

  if (!runDeepSearch) {
      if (!temConflitoNaRaiz) {
           return {
              status: 'atencao',
              mensagem: 'O destino está livre. No entanto, mover esta aula criará um buraco na origem e não é permitido deixar lacunas indevidas.',
              mudancasNecessarias: []
           };
      } else {
           return {
               status: 'atencao',
               mensagem: `O destino possui uma aula (${(turmaNoDestinoAqui || profNoDestinoTempo)?.componente_nome}) da mesma turma ou professor. Não há troca direta trivial validada sem disparar o motor algorítmico.`,
               mudancasNecessarias: []
           };
      }
  }

  // ============================================
  // DFS SOLVER EXECUTION
  // ============================================
  const solutions: SolverState[] = [];
  const visited = new Set<string>();

  // Helper para checar validade de um estado em tempo constante relativo ao map
  function isSlotValid(aula: AulaRefino, dia: string, slot: number, turnoId: string, state: SolverState): boolean {
      const [iniT, fimT] = getSlotMinutes(turnosById.get(turnoId), slot);
      const prfKey = getProfessorKey(aula.professor_id, aula.professor_cpf);

      // Iteramos a grade simulada usando base + diff
      for (const tAula of todasAulas) {
          if (tAula.id === aula.id) continue;
          
          let curDia = tAula.dia_semana;
          let curSlot = tAula.aula_index;
          let curTurno = tAula.turno_id;

          const sState = state.simulatedAssignments.get(tAula.id);
          if (sState) {
              const [d, s, t] = sState.split('|');
              curDia = d; curSlot = parseInt(s, 10); curTurno = t;
              // Se foi ejetada e está flutuando, a string seria "floating" (marcaremos -1)
              if (curSlot === -1) continue; 
          }

          if (curDia !== dia) continue;
          
          const tA = turnosById.get(curTurno);
          const [iA, fA] = getSlotMinutes(tA, curSlot);
          if (!minutesConflitam(iniT, fimT, iA, fA)) continue;

          // Se sobrepõe no tempo, checa professor e turma
          if (tAula.turma_id === aula.turma_id) return false;
          if (prfKey && tAula.professor_id && getProfessorKey(tAula.professor_id, tAula.professor_cpf) === prfKey) return false;
      }
      return true;
  }

  // Prepara o estado inicial
  const initialState: SolverState = {
      moves: [],
      openTargetSlots: [{ dia: aulaOrigem.dia_semana, slot: aulaOrigem.aula_index, turnoId: aulaOrigem.turno_id }], // A origem ficou buraco!
      displacedLessons: [],
      simulatedAssignments: new Map(),
      depth: 0
  };

  initialState.moves.push({ aulaId: aulaOrigem.id, novoDia: diaDestino, novoSlot: slotDestino, novoTurnoId: turnoDestinoId });
  initialState.simulatedAssignments.set(aulaId, `${diaDestino}|${slotDestino}|${turnoDestinoId}`);
  
  // Quem estava lá?
  const displacedInit = todasAulas.find(a => 
       a.id !== aulaOrigem.id &&
       a.dia_semana === diaDestino && 
       (()=>{
            const [iA, fA] = getSlotMinutes(turnosById.get(a.turno_id), a.aula_index);
            return minutesConflitam(iniDest, fimDest, iA, fA) && (a.turma_id === aulaOrigem.turma_id || getProfessorKey(a.professor_id, a.professor_cpf) === profKey);
       })()
  );

  if (displacedInit) {
      initialState.displacedLessons.push(displacedInit);
      initialState.simulatedAssignments.set(displacedInit.id, `floating|-1|floating`);
  }

  visited.add(hashState(initialState.moves));

  // DFS recursivo simulando o Graph
  function dfs(currentState: SolverState) {
      if (Date.now() - startMs > MAX_TIME_MS) return;
      if (solutions.length >= MAX_SOLUTIONS) return;
      
      // Estado está limpo? Se não há aulas flutuando e TODOS os openSlots de origem foram fechados (ou seja, ciclo puro)
      if (currentState.displacedLessons.length === 0 && currentState.openTargetSlots.length === 0) {
          solutions.push(currentState);
          return;
      }

      // Evita loops hiper-profundos
      if (currentState.depth >= MAX_DEPTH) return;

      // Pega aula flutuando (se existir). Se não existir, pega o último openSlot e manda preencher!
      if (currentState.displacedLessons.length > 0) {
          const lesson = currentState.displacedLessons[0];
          
          // Tenta colocar essa lesson num dos openTargetSlots
          for (let i = 0; i < currentState.openTargetSlots.length; i++) {
              const target = currentState.openTargetSlots[i];
              // Verifica se a lesson PODE ir para o target
              if (isSlotValid(lesson, target.dia, target.slot, target.turnoId, currentState)) {
                  // Pode! Clona o estado
                  const newState = cloneState(currentState);
                  newState.depth++;
                  newState.displacedLessons.shift(); // Remove working lesson
                  newState.openTargetSlots.splice(i, 1); // Fechou um buraco
                  newState.moves.push({ aulaId: lesson.id, novoDia: target.dia, novoSlot: target.slot, novoTurnoId: target.turnoId });
                  newState.simulatedAssignments.set(lesson.id, `${target.dia}|${target.slot}|${target.turnoId}`);
                  
                  const hash = hashState(newState.moves);
                  if (!visited.has(hash)) {
                      visited.add(hash);
                      dfs(newState);
                  }
              }
          }

          // Ou então, tenta empurrar ALGUEM pra ejetar ALGUEM (extensão de cadeia).
          // Mas para evitar O(N^2) colossal, varremos os dias que a turma atende para trocar.
          const diasTurno = turnosById.get(lesson.turno_id)?.dias_semana || [];
          const slotsTurno = turnosById.get(lesson.turno_id)?.aulas_por_dia || 0;

          for (const d of diasTurno) {
              for (let s = 0; s < slotsTurno; s++) {
                  // A lição tenta tomar X
                  const [iX, fX] = getSlotMinutes(turnosById.get(lesson.turno_id), s);
                  
                  const targetAula = todasAulas.find(a => 
                      a.id !== lesson.id &&
                      a.turma_id === lesson.turma_id && // só permuta com a propria turma para cadeias compactas
                      a.dia_semana === d &&
                      (() => {
                           const sA = currentState.simulatedAssignments.get(a.id);
                           let cdia = a.dia_semana, cslot = a.aula_index, ct = a.turno_id;
                           if (sA) {
                               if (sA.includes('floating')) return false;
                               const prts = sA.split('|'); cdia = prts[0]; cslot = parseInt(prts[1],10); ct = prts[2];
                           }
                           if (cdia !== d) return false;
                           const [iaa, faa] = getSlotMinutes(turnosById.get(ct), cslot);
                           return minutesConflitam(iX, fX, iaa, faa);
                      })()
                  );

                  if (targetAula) {
                      // Check if lesson can take over targetAula's spot BEFORE ejecting targetAula
                      // We must simulate targetAula missing
                      const curAssign = currentState.simulatedAssignments.get(targetAula.id);
                      currentState.simulatedAssignments.set(targetAula.id, 'floating|-1|x');
                      const valid = isSlotValid(lesson, d, s, lesson.turno_id, currentState);
                      if (curAssign) currentState.simulatedAssignments.set(targetAula.id, curAssign);
                      else currentState.simulatedAssignments.delete(targetAula.id);

                      if (valid) {
                         const nState = cloneState(currentState);
                         nState.depth++;
                         nState.displacedLessons.shift();
                         nState.displacedLessons.push(targetAula); // Nova a ser ejetada
                         nState.moves.push({ aulaId: lesson.id, novoDia: d, novoSlot: s, novoTurnoId: lesson.turno_id });
                         nState.simulatedAssignments.set(lesson.id, `${d}|${s}|${lesson.turno_id}`);
                         nState.simulatedAssignments.set(targetAula.id, 'floating|-1|x');

                         const hsh = hashState(nState.moves);
                         if (!visited.has(hsh)) {
                             visited.add(hsh);
                             dfs(nState);
                         }
                      }
                  }
              }
          }

      } else if (currentState.openTargetSlots.length > 0) {
          // Nenhuma lesson flutuando, mas sobrou um buraco aberto (Ex: movimento inicial foi pro vazio).
          // Temos que achar alguma aula da mesma TURMA para PUXAR pra tapar esse target e criar outro buraco (fechando outro ciclo).
          const target = currentState.openTargetSlots[0];
          
          // Pegamos uma aula de Ponta (fim do dia / começo) pra não criar buraco feio no meio
          const turmaCandidates = todasAulas.filter(a => 
              a.id !== aulaId && a.turma_id === au_turmaId &&
              !currentState.simulatedAssignments.has(a.id)
          ).sort((a, b) => b.aula_index - a.aula_index); // prioriza aulas no final do dia
          
          for (const cand of turmaCandidates) {
              if (isSlotValid(cand, target.dia, target.slot, target.turnoId, currentState)) {
                  const nState = cloneState(currentState);
                  nState.depth++;
                  nState.openTargetSlots.shift(); // Fechou este buraco
                  // Abriu novo
                  nState.moves.push({ aulaId: cand.id, novoDia: target.dia, novoSlot: target.slot, novoTurnoId: target.turnoId });
                  nState.simulatedAssignments.set(cand.id, `${target.dia}|${target.slot}|${target.turnoId}`);
                  // Nota: paramos o "pulling" chain se abrirmos um buraco no topo/fim que não importa?
                  // Pela matemática de ciclos puros para n-lados, vamos apenas forçar fechar ciclos.
                  // Se nState chegar no limit depth, ele nunca devolve.
                  // Para flexibilizar e permitir compactação como Válida, se o cand_index for o ultimo slot real, 
                  // deixamos o OpenTarget sumir magicaente? A regra é rígida: NÃO PODE DEIXAR LACUNA. Entao sempre eh ciclo fechado.
                  
                  const hsh = hashState(nState.moves);
                  if (!visited.has(hsh)) {
                      visited.add(hsh);
                      dfs(nState);
                  }
              }
          }
      }
  }

  function cloneState(s: SolverState): SolverState {
      return {
          moves: [...s.moves],
          openTargetSlots: [...s.openTargetSlots],
          displacedLessons: [...s.displacedLessons],
          simulatedAssignments: new Map(s.simulatedAssignments),
          depth: s.depth
      };
  }

  // Desperta a fera
  dfs(initialState);

  if (solutions.length === 0) {
      return {
          status: 'bloqueado',
          mensagem: 'Não foi encontrada uma sequência de remanejamentos viável (sem causar lacunas ou conflitos cronológicos reais) dentro dos limites de cálculo do sistema.',
          mudancasNecessarias: []
      };
  }

  // Filtragem e Ranking das soluções
  const sortedSolutions = solutions.sort((a,b) => {
      // Menor quantidade de movimentos
      if (a.moves.length !== b.moves.length) return a.moves.length - b.moves.length;
      return 0; // Pode expadir priorização se necessário
  });

  const topSols = sortedSolutions.slice(0, MAX_SOLUTIONS);

  const DIAS_SHORT: any = { segunda: 'Seg', terca: 'Ter', quarta: 'Qua', quinta: 'Qui', sexta: 'Sex', sabado: 'Sáb' };

  const possibilidadesRender: Possibilidade[] = topSols.map((sol, index) => {
      // Build textual steps
      const impactosProf = new Set();
      const impactosTurm = new Set();
      const passosText: string[] = [];
      
      sol.moves.forEach(m => {
          const aName = todasAulas.find(a => a.id === m.aulaId)?.componente_sigla || 'Aula';
          const tName = todasAulas.find(a => a.id === m.aulaId)?.turma_nome || '';
          const pName = todasAulas.find(a => a.id === m.aulaId)?.professor_nome || '';
          
          impactosTurm.add(tName);
          if(pName) impactosProf.add(pName);
          
          passosText.push(`${aName} (${tName}) ➔ ${DIAS_SHORT[m.novoDia]} ${m.novoSlot + 1}ª`);
      });

      return {
          id: `opt_${index}`,
          moves: sol.moves,
          impactoTurmas: impactosTurm.size,
          impactoProfessores: impactosProf.size,
          qtdMovimentos: sol.moves.length,
          passos: passosText
      };
  });

  return {
      status: 'possibilidades',
      mensagem: `Simplicidade direta não atingida. O Motor analisou toda a linha cronológica absoluta calculando cadeias perfeitas e encontrou ${possibilidadesRender.length} solução(ões) sem deixar buracos na grade. Selecione uma opção.`,
      mudancasNecessarias: [],
      possibilidades: possibilidadesRender
  };
}
