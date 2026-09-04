/**
 * Qual grade de cada turno conta como "o que já está ocupado".
 *
 * O refino sempre trabalhou sobre uma grade só e comparava com as PUBLICADAS da
 * escola. Isso deixava de fora justamente o caso que quebra: enquanto o Integral
 * ainda é rascunho, ele é invisível — e o Matutino, que começa na mesma hora,
 * aceita pôr o mesmo professor às 7h numa turma que o Integral já ocupou.
 *
 * Passar a considerar TODOS os rascunhos, porém, seria pior: um turno costuma
 * ter várias versões salvas, e duas versões do mesmo turno se chocam em quase
 * todo slot — o refino passaria a acusar conflito inventado em cima de si mesmo.
 * Daí a regra deste módulo, e é por isso que ela mora aqui e não solta numa
 * action: **uma grade por turno, e só uma**, escolhida pelo usuário ou pela
 * política padrão.
 */

export type StatusGrade = 'publicado' | 'pre_producao' | 'em_rascunho';

export type GradeCandidata = {
  id: string;
  nome: string;
  status: StatusGrade;
  turno_id: string;
  turno_nome: string;
  created_at: string;
};

export type ReferenciaResolvida = {
  turno_id: string;
  turno_nome: string;
  horario_id: string;
  horario_nome: string;
  status: StatusGrade;
  /** `false` = ninguém escolheu, veio da política padrão. A tela marca isso. */
  escolhidaPeloUsuario: boolean;
};

/** Valor de "— não considerar —" no seletor de cada turno. */
export const SEM_REFERENCIA = 'nenhuma';

/**
 * Colunas que o refino precisa de cada aula.
 *
 * `compartilhada`/`aula_compartilhada_id` entram porque sem elas as duas
 * metades de uma aula coletiva parecem o mesmo professor em dois lugares.
 */
export const SELECT_AULA_REFINO =
  'id, horario_id, turma_id, componente_id, professor_id, dia_semana, aula_index, tipo, turno_id,' +
  ' aula_fixa_id, compartilhada, aula_compartilhada_id,' +
  ' turma:turmas(nome), componente:componentes_curriculares(nome, sigla),' +
  ' professor:professores(nome_horario, cpf)';

/** Publicado ganha de pré-produção, que ganha de rascunho. */
const PRIORIDADE: Record<StatusGrade, number> = { publicado: 0, pre_producao: 1, em_rascunho: 2 };

export function rotuloDoStatus(status: StatusGrade): string {
  if (status === 'publicado') return 'publicado';
  if (status === 'pre_producao') return 'pré-produção';
  return 'rascunho';
}

/** A grade que representa um turno quando ninguém escolheu: a mais oficial e, no empate, a mais nova. */
function melhorDoTurno(grades: GradeCandidata[]): GradeCandidata | undefined {
  return [...grades].sort((a, b) => {
    const p = PRIORIDADE[a.status] - PRIORIDADE[b.status];
    if (p !== 0) return p;
    return (b.created_at || '').localeCompare(a.created_at || '');
  })[0];
}

/**
 * Uma grade por turno, tirando o turno que está sendo editado.
 *
 * O turno da grade em edição não entra: ali a autoridade é a própria grade
 * aberta, e trazer outra versão dela seria comparar o horário consigo mesmo.
 */
export function resolverGradesDeReferencia(
  candidatos: GradeCandidata[],
  horarioEmEdicaoId: string,
  turnoEmEdicaoId: string,
  escolhas?: Record<string, string> | null,
): { referencias: ReferenciaResolvida[]; avisos: string[] } {
  const porTurno = new Map<string, GradeCandidata[]>();
  for (const g of candidatos) {
    if (g.turno_id === turnoEmEdicaoId) continue;
    if (g.id === horarioEmEdicaoId) continue;
    const lista = porTurno.get(g.turno_id);
    if (lista) lista.push(g);
    else porTurno.set(g.turno_id, [g]);
  }

  const referencias: ReferenciaResolvida[] = [];
  const avisos: string[] = [];

  for (const [turnoId, grades] of porTurno) {
    const escolhido = escolhas?.[turnoId];
    let grade: GradeCandidata | undefined;
    let escolhidaPeloUsuario = false;

    if (escolhido === SEM_REFERENCIA) continue;

    if (escolhido) {
      grade = grades.find(g => g.id === escolhido);
      if (grade) {
        escolhidaPeloUsuario = true;
      } else {
        // Grade de outra escola, de outro turno, ou apagada desde que a tela
        // carregou. Cair no padrão é melhor do que devolver erro e não refinar.
        avisos.push(
          `A grade escolhida para o turno ${grades[0]?.turno_nome || turnoId} não está mais disponível; ` +
          'usando a mais recente daquele turno.',
        );
      }
    }

    if (!grade) grade = melhorDoTurno(grades);
    if (!grade) continue;

    referencias.push({
      turno_id: turnoId,
      turno_nome: grade.turno_nome,
      horario_id: grade.id,
      horario_nome: grade.nome,
      status: grade.status,
      escolhidaPeloUsuario,
    });
  }

  referencias.sort((a, b) => a.turno_nome.localeCompare(b.turno_nome));
  return { referencias, avisos };
}
