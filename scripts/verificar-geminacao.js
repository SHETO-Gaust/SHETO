/**
 * Verifica o contrato da geminacao no motor de geracao de horario.
 *
 * Nao toca no banco: monta escolas sinteticas em memoria e roda
 * `gerarHorarioAlgoritmico` contra elas. Serve para rodar a qualquer momento,
 * em qualquer maquina, em segundos.
 *
 *   npm run verificar:geminacao
 *   node scripts/verificar-geminacao.js          (exige workers/ ja compilado)
 *
 * Sai com codigo 1 se qualquer verificacao falhar.
 *
 * O CONTRATO, em uma frase: pedir "geminar 2x" numa disciplina significa UM
 * bloco de duas aulas seguidas naquela turma, e nao a semana inteira aos pares.
 * Concretamente, tres coisas precisam valer ao mesmo tempo:
 *
 *   1. existe uma sequencia contigua DO tamanho pedido;
 *   2. nenhuma sequencia passa desse tamanho (a avulsa nao cola no bloco e
 *      vira trio);
 *   3. quando 1 ou 2 nao cabem nos dados, a perda vem DECLARADA em
 *      `geminacoesQuebradas` — e nao escondida atras de um `success: true`;
 *   4. disciplina SEM geminacao pedida nao emenda: o teto dela e 2 aulas
 *      seguidas, e so quando o relaxamento entra porque a grade nao fecha de
 *      outro jeito;
 *   5. a regra do DIA, que nao e a mesma pergunta que a sequencia: aulas da
 *      mesma disciplina podem se repetir no dia desde que RESPIREM — pelo menos
 *      1 aula livre entre duas avulsas, pelo menos 2 quando uma delas e dupla —
 *      e ate um teto (4 num dia de 7 aulas ou mais, 3 nos demais).
 *
 * O item 3 e o que este arquivo mais protege. Uma geminacao desfeita nao deixa
 * celula vazia: a disciplina continua com todas as aulas dela na grade, so que
 * espalhadas. Sem uma verificacao explicita, a regressao passa despercebida.
 */

const path = require('path');

/**
 * `SHETO_MOTOR` aponta para outro build do motor.
 *
 * Serve para provar que este arquivo sabe reprovar: apontado para o motor
 * anterior a 08/2026 ele acusa o defeito original (5 aulas com "2x" saindo como
 * [2,2,1], dois pares onde se pediu um). Um teste que so sabe aprovar nao
 * protege nada.
 */
const CAMINHO_MOTOR = process.env.SHETO_MOTOR || path.join(__dirname, '..', 'workers', 'timetabling.js');

let gerarHorarioAlgoritmico;
let criarBlocos;
let regraDoDiaViolada;
try {
  ({ gerarHorarioAlgoritmico, criarBlocos, regraDoDiaViolada } = require(CAMINHO_MOTOR));
} catch (err) {
  console.error(`Nao encontrei o motor compilado em ${CAMINHO_MOTOR}.`);
  console.error('Rode `npm run build:worker` antes (ou use `npm run verificar:geminacao`).');
  process.exit(1);
}

/**
 * O motor narra o que faz (reparos, avisos de travamento) com dezenas de
 * `console.log`. Aqui isso soterra o relatorio das verificacoes, que e o unico
 * motivo de este script existir. `SHETO_VERBOSO=1` traz a narracao de volta
 * quando se esta investigando uma falha.
 */
const silenciarMotor = process.env.SHETO_VERBOSO !== '1';
const logOriginal = console.log;
function semRuido(fn) {
  if (!silenciarMotor) return fn();
  console.log = () => { };
  try { return fn(); } finally { console.log = logOriginal; }
}

const DIAS = ['segunda', 'terca', 'quarta', 'quinta', 'sexta'];

// ─── Montagem de escolas sinteticas ─────────────────────────────────────────

function montarTurno(id, nome, aulasPorDia, horaBase) {
  return {
    id, escola_id: 'e1', nome, ativo: true,
    dias_semana: DIAS,
    aulas_por_dia: aulasPorDia,
    horarios: Array.from({ length: aulasPorDia }, (_, i) => ({
      id: `h${i}`,
      inicio: `${String(horaBase + i).padStart(2, '0')}:00`,
      fim: `${String(horaBase + i).padStart(2, '0')}:50`,
    })),
    created_at: '',
  };
}

function montarProfessor(id, restricoes) {
  return {
    id, escola_id: 'e1', cpf: null, nome_completo: id, nome_horario: id,
    turnos_ids: ['t1', 't2'], aulas_disponiveis: 40, aulas_planejamento: 0,
    restricoes: restricoes || {}, livre_docencia: [],
    sem_preferencia_livre_docencia: true,
    componentes: [], turnos: [], created_at: '',
  };
}

/** `grade` = [[sigla, presenciais, naoPresenciais], ...]; `profDe(sigla, i)` escolhe o professor. */
function montarTurma(indice, nome, grade, profDe) {
  const id = `turma${indice}`;
  return {
    id, escola_id: 'e1', serie_id: 's1', nome, created_at: '',
    serie: {
      id: 's1', nome: 'serie de teste', turno_id: 't1', restricoes: {},
      componentes: grade.map(([sigla, p, np]) => ({
        serie_id: 's1', componente_id: `c_${sigla}`,
        aulas_presenciais: p, aulas_nao_presenciais: np || 0,
        componente: { id: `c_${sigla}`, nome: sigla, sigla },
      })),
    },
    professores: grade.map(([sigla]) => {
      const pid = profDe(sigla, indice);
      return {
        turma_id: id, componente_id: `c_${sigla}`, professor_id: pid,
        professor: { id: pid, nome_horario: pid },
      };
    }),
    aulas_fixas: [],
  };
}

function montarConfig(grade, geminar) {
  return grade.map(([sigla]) => ({
    componente_id: `c_${sigla}`,
    geminar: geminar[sigla] !== undefined,
    tamanho_bloco: geminar[sigla] || 2,
  }));
}

function rodar(turno, turmas, professores, todosTurnos, config, orcamento) {
  const r = semRuido(() => gerarHorarioAlgoritmico(
    turno, turmas, professores, todosTurnos, config,
    false,      // force
    [],         // ocupacoes existentes
    orcamento,  // chunk
    0,          // offset
    [],         // aulas fixas
    false,      // permitir mesmo prof / disciplinas / mesmo dia
    orcamento,  // orcamento total
    false,      // diagnostico
    null, null, Infinity, {}
  ));

  // Motor sem o campo declara, na pratica, "nao perdi nada" — que e exatamente
  // o silencio que estas verificacoes existem para pegar.
  if (!r.geminacoesQuebradas) r.geminacoesQuebradas = [];
  return r;
}

// ─── Auditoria da grade ─────────────────────────────────────────────────────

/**
 * Comprimentos de todas as sequencias contiguas, por `turma|componente|tipo`.
 *
 * Deliberadamente reimplementado aqui, e nao importado do motor: um teste que
 * usa a mesma funcao que esta testando aprova a si mesmo. Foi exatamente assim
 * que a versao anterior do verificador deixou passar uma sequencia MAIOR que a
 * pedida como se cumprisse o contrato.
 */
function sequenciasPorGrupo(aulas) {
  const porDia = new Map();
  for (const a of aulas) {
    const k = `${a.turma_id}|${a.componente_id}|${a.tipo}|${a.turno_id}|${a.dia_semana}`;
    if (!porDia.has(k)) porDia.set(k, []);
    porDia.get(k).push(a.aula_index);
  }

  const sequencias = new Map();
  for (const [k, indices] of porDia) {
    const grupo = k.split('|').slice(0, 3).join('|');
    indices.sort((x, y) => x - y);
    let i = 0;
    while (i < indices.length) {
      let fim = i;
      while (fim + 1 < indices.length && indices[fim + 1] === indices[fim] + 1) fim++;
      if (!sequencias.has(grupo)) sequencias.set(grupo, []);
      sequencias.get(grupo).push(fim - i + 1);
      i = fim + 1;
    }
  }
  return sequencias;
}

/**
 * A regra do dia, reimplementada AQUI de proposito.
 *
 * O cenario 6 testa a funcao do motor contra uma tabela escrita a mao. Estes
 * outros cenarios auditam a GRADE, e para isso usam esta copia: um teste que
 * audita a grade com a mesma funcao que a grade usou nao audita nada.
 *
 * teto: quantas cabem no dia. limiteRun: maior emenda permitida.
 */
function violaRegraDoDia(indices, limiteRun, teto) {
  const ord = [...new Set(indices)].sort((a, b) => a - b);
  if (ord.length === 0) return false;
  if (ord.length > teto) return true;

  const corridas = [];
  let i = 0;
  while (i < ord.length) {
    let fim = i;
    while (fim + 1 < ord.length && ord[fim + 1] === ord[fim] + 1) fim++;
    corridas.push({ ini: ord[i], fim: ord[fim], tam: fim - i + 1 });
    i = fim + 1;
  }

  if (corridas.some(c => c.tam > limiteRun)) return true;

  for (let k = 1; k < corridas.length; k++) {
    const vao = corridas[k].ini - corridas[k - 1].fim - 1;
    const minimo = corridas[k - 1].tam >= 2 || corridas[k].tam >= 2 ? 2 : 1;
    if (vao < minimo) return true;
  }
  return false;
}

/** Teto de aulas no dia, pelo tamanho do dia. Espelha o motor. */
function tetoDoDia(aulasPorDia, cargaSemanal, dias, blocoPedido) {
  return Math.max(
    aulasPorDia >= 7 ? 4 : 3,
    Math.ceil(cargaSemanal / Math.max(1, dias)),
    blocoPedido || 0,
  );
}

/**
 * Quantas aulas cada `turma|componente|tipo` tem em cada dia.
 *
 * A pergunta que faltava. Sequencia e uma coisa, carga do dia e outra: o par em
 * 1-2 mais a avulsa em 5 nao produz nenhuma sequencia acima de 2 e ainda assim
 * sao tres aulas da mesma materia no mesmo dia.
 */
function indicesPorGrupoEDia(aulas) {
  const mapa = new Map();
  for (const a of aulas) {
    const k = `${a.turma_id}|${a.componente_id}|${a.tipo}`;
    if (!mapa.has(k)) mapa.set(k, new Map());
    const porDia = mapa.get(k);
    if (!porDia.has(a.dia_semana)) porDia.set(a.dia_semana, []);
    porDia.get(a.dia_semana).push(a.aula_index);
  }
  return mapa;
}

/** Lista das geminacoes que a grade NAO cumpre, na leitura independente. */
function geminacoesQuebradasReais(aulas, turmas, grade, geminar) {
  const seq = sequenciasPorGrupo(aulas);
  const quebradas = [];
  for (const t of turmas) {
    for (const [sigla, p, np] of grade) {
      const tamanho = geminar[sigla];
      if (tamanho === undefined) continue;
      for (const [tipo, n] of [['presencial', p], ['nao_presencial', np || 0]]) {
        if (!n || Math.min(tamanho, n) <= 1) continue;
        const runs = seq.get(`${t.id}|c_${sigla}|${tipo}`) || [];
        const alvo = Math.min(tamanho, n);
        if (!runs.includes(alvo) || runs.some(x => x > alvo)) {
          quebradas.push(`${t.nome}/${sigla}/${tipo}=[${runs.join(',')}] esperava um bloco de ${alvo}`);
        }
      }
    }
  }
  return quebradas;
}

// ─── Relato ─────────────────────────────────────────────────────────────────

let falhas = 0;

function checar(descricao, condicao, detalhe) {
  if (condicao) {
    console.log(`   ok   ${descricao}`);
  } else {
    falhas++;
    console.log(`   FALHA  ${descricao}${detalhe ? `\n          ${detalhe}` : ''}`);
  }
}

// ─── Cenario 0: a reparticao, na fonte ──────────────────────────────────────
//
// A verificacao mais importante do arquivo, e a que pega o defeito original de
// forma inequivoca.
//
// Na grade pronta, "um bloco de 2 mais duas avulsas que por acaso cairam
// juntas" e "dois blocos de 2" produzem a MESMA figura: [2,2]. Como o par
// acidental e permitido, olhar so a grade nao distingue os dois casos — foi por
// isso que a primeira versao deste arquivo aprovou o motor defeituoso. Aqui a
// diferenca e literal: `criarBlocos(5, 2)` tem de devolver [2,1,1,1], e nao
// [2,2,1].

function cenario0() {
  console.log('\n0. reparticao em blocos — um bloco geminado, o resto avulso');

  if (typeof criarBlocos !== 'function') {
    falhas++;
    console.log('   FALHA  o motor nao exporta `criarBlocos` — sem ela a regra nao e verificavel');
    return;
  }

  const casos = [
    // [total, tamanhoPedido, esperado]
    [5, 2, [2, 1, 1, 1]],  // o caso da reclamacao: saia [2,2,1]
    [4, 2, [2, 1, 1]],
    [6, 2, [2, 1, 1, 1, 1]],  // saia [2,2,2]: a semana inteira aos pares
    [6, 3, [3, 1, 1, 1]],  // saia [3,3]
    [2, 2, [2]],
    [3, 4, [3]],  // pediu mais do que existe: gemina o que da
    [1, 2, [1]],  // uma aula so nao gemina com ninguem
    [4, 1, [1, 1, 1, 1]],  // sem geminacao
    [0, 2, []],
  ];

  for (const [total, pedido, esperado] of casos) {
    const obtido = criarBlocos(total, pedido);
    checar(
      `${total} aulas, bloco de ${pedido} -> [${esperado.join(',')}]`,
      JSON.stringify(obtido) === JSON.stringify(esperado),
      `obtive [${obtido.join(',')}]`
    );
  }
}

// ─── Cenario 1: o contrato basico ───────────────────────────────────────────
//
// Duas turmas, carga exatamente igual a capacidade (25 aulas em 5x5), tres
// disciplinas geminadas em 2x. Reproduz o defeito original: com 5 aulas e "2x",
// a reparticao gulosa devolvia [2,2,1] — dois pares onde se pediu um.

function cenario1() {
  console.log('\n1. contrato basico — um bloco por disciplina, nunca dois');

  const grade = [['MAT', 5], ['POR', 5], ['CIE', 4], ['HIS', 3], ['GEO', 3], ['ART', 3], ['EDF', 2]];
  const geminar = { MAT: 2, POR: 2, CIE: 2 };

  const t1 = montarTurno('t1', 'Matutino', 5, 7);
  const t2 = montarTurno('t2', 'Vespertino', 5, 13);
  const professores = grade.map(([sigla]) => montarProfessor(`p_${sigla}`));
  const turmas = [montarTurma(1, 'A', grade, s => `p_${s}`), montarTurma(2, 'B', grade, s => `p_${s}`)];

  const r = rodar(t1, turmas, professores, [t1, t2], montarConfig(grade, geminar), 4000);
  const seq = sequenciasPorGrupo(r.aulas);
  const indicesPorGrupoDia = indicesPorGrupoEDia(r.aulas);

  checar('a grade fecha', r.success, `success=${r.success}, ${r.aulas.length} aulas`);
  checar('nenhuma geminacao declarada como quebrada', r.geminacoesQuebradas.length === 0,
    JSON.stringify(r.geminacoesQuebradas));

  for (const t of turmas) {
    for (const [sigla, n] of grade) {
      const runs = (seq.get(`${t.id}|c_${sigla}|presencial`) || []).sort((a, b) => b - a);
      const total = runs.reduce((s, x) => s + x, 0);
      const alvo = geminar[sigla];

      checar(`${t.nome}/${sigla}: ${n} aulas na grade`, total === n, `encontrei ${total}`);

      // Regra do dia: repetir a disciplina no dia e permitido, colar nao.
      const idxPorDia = indicesPorGrupoDia.get(`${t.id}|c_${sigla}|presencial`) || new Map();
      const teto = tetoDoDia(5, n, DIAS.length, alvo);
      const diasRuins = [...idxPorDia.entries()]
        .filter(([, idx]) => violaRegraDoDia(idx, alvo === undefined ? 2 : alvo, teto))
        .map(([d, idx]) => `${d}=[${[...idx].sort((x, y) => x - y).map(v => v + 1).join(',')}]`);
      checar(`${t.nome}/${sigla}: nenhum dia quebra a regra (teto ${teto})`,
        diasRuins.length === 0, diasRuins.join(' ; '));
      if (alvo === undefined) {
        // Quem nao pediu geminacao nao pode receber emenda maior que 2. Antes
        // nao havia teto NENHUM aqui, e a disciplina saia em blocos de quatro.
        checar(`${t.nome}/${sigla}: sem geminacao pedida, nenhuma sequencia passa de 2`,
          !runs.some(x => x > 2), `sequencias: [${runs.join(',')}]`);
        continue;
      }

      checar(`${t.nome}/${sigla}: existe o bloco de ${alvo}  [${runs.join(',')}]`, runs.includes(alvo));
      checar(`${t.nome}/${sigla}: nenhuma sequencia passa de ${alvo}`, !runs.some(x => x > alvo),
        `sequencias: [${runs.join(',')}]`);
    }
  }
}

// ─── Cenario 2: geminacao impossivel deve ser DECLARADA ─────────────────────
//
// O professor de MAT so pode dar aula no primeiro horario de cada dia, entao
// MAT nunca tem duas aulas seguidas — mas a grade inteira ainda fecha. Este e o
// caso que o motor resolvia mentindo: devolvia `success: true` e a geminacao
// sumia sem aviso.

function cenario2() {
  console.log('\n2. geminacao impossivel — a grade fecha, mas a perda e declarada');

  const grade = [['MAT', 5], ['POR', 5], ['CIE', 4], ['HIS', 3], ['GEO', 3], ['ART', 3], ['EDF', 2]];
  const geminar = { MAT: 2 };

  const restricoesMat = { t1: {}, t2: {} };
  for (const d of DIAS) {
    restricoesMat.t1[d] = { 1: 'indisponivel', 2: 'indisponivel', 3: 'indisponivel', 4: 'indisponivel' };
    restricoesMat.t2[d] = { 0: 'indisponivel', 1: 'indisponivel', 2: 'indisponivel', 3: 'indisponivel', 4: 'indisponivel' };
  }

  const t1 = montarTurno('t1', 'Matutino', 5, 7);
  const t2 = montarTurno('t2', 'Vespertino', 5, 13);
  const professores = grade.map(([sigla]) =>
    montarProfessor(`p_${sigla}`, sigla === 'MAT' ? restricoesMat : {}));
  const turmas = [montarTurma(1, 'A', grade, s => `p_${s}`)];

  const r = rodar(t1, turmas, professores, [t1, t2], montarConfig(grade, geminar), 2000);

  checar('a grade fecha assim mesmo (25 aulas)', r.success && r.aulas.length === 25,
    `success=${r.success}, ${r.aulas.length} aulas`);
  checar('a geminacao perdida vem declarada, e nao escondida',
    r.geminacoesQuebradas.length === 1 && r.geminacoesQuebradas[0].componente_nome === 'MAT',
    JSON.stringify(r.geminacoesQuebradas));

  const seq = sequenciasPorGrupo(r.aulas);
  const runs = seq.get(`turma1|c_MAT|presencial`) || [];
  checar('e a declaracao bate com a grade (MAT sem nenhum par)', !runs.includes(2),
    `sequencias de MAT: [${runs.join(',')}]`);
}

// ─── Cenario 3: escola apertada, com bans ───────────────────────────────────
//
// 8 turmas, 2 professores por disciplina, um quarto dos slots de cada professor
// bloqueado. Aqui a busca gasta o orcamento todo e chega a acionar o
// relaxamento final — que era justamente onde a geminacao se perdia calada.
//
// A verificacao decisiva e a ultima: o que o motor DECLARA tem de bater com o
// que a grade MOSTRA, em qualquer direcao. Silencio e o defeito.

function cenario3() {
  console.log('\n3. escola apertada — o declarado tem de bater com o entregue');

  const grade = [
    ['POR', 5, 0], ['MAT', 5, 0], ['CIE', 3, 0], ['HIS', 2, 0], ['GEO', 2, 0],
    ['ART', 2, 0], ['EDF', 2, 0], ['ING', 2, 0], ['FIL', 0, 1], ['SOC', 0, 1],
  ];
  const geminar = { POR: 2, MAT: 2, CIE: 2, ING: 2 };
  const N_TURMAS = 8;

  const t1 = montarTurno('t1', 'Matutino', 5, 7);
  const t2 = montarTurno('t2', 'Vespertino', 5, 13);

  const professores = [];
  grade.forEach(([sigla], gi) => {
    for (let k = 0; k < 2; k++) {
      // Bans deterministicos: ~25% dos slots de cada professor.
      const restricoes = { t1: {}, t2: {} };
      let semente = (gi * 7 + k * 13 + 3) >>> 0;
      const proximo = () => {
        semente = (semente * 1103515245 + 12345) >>> 0;
        return (semente >>> 8) / 16777216;
      };
      for (const d of DIAS) {
        restricoes.t1[d] = {};
        for (let s = 0; s < 5; s++) if (proximo() < 0.25) restricoes.t1[d][s] = 'indisponivel';
      }
      professores.push(montarProfessor(`p_${sigla}_${k}`, restricoes));
    }
  });

  const profDe = (sigla, i) => `p_${sigla}_${i <= N_TURMAS / 2 ? 0 : 1}`;
  const turmas = Array.from({ length: N_TURMAS }, (_, i) => montarTurma(i + 1, `T${i + 1}`, grade, profDe));

  const orcamento = Number(process.env.ORC || 4000);
  const r = rodar(t1, turmas, professores, [t1, t2], montarConfig(grade, geminar), orcamento);

  const reais = geminacoesQuebradasReais(r.aulas, turmas, grade, geminar);

  const pedidas = N_TURMAS * Object.keys(geminar).length;

  console.log(`        (${r.aulas.length} aulas alocadas, ${r.attemptsMade} tentativas, ` +
    `${r.success ? 'fechou' : 'nao fechou'}, ${pedidas - reais.length}/${pedidas} geminacoes cumpridas)`);

  /**
   * A verificacao decisiva, e a unica que precisa valer sempre.
   *
   * Nao se exige que TODAS as geminacoes caibam — numa escola apertada pode
   * genuinamente nao haver arranjo. O que se exige e que a conta feche: o que o
   * motor declara em `geminacoesQuebradas` tem de ser exatamente o que a grade
   * perdeu, lido por fora. Declarar de menos e a mentira antiga; declarar de
   * mais assustaria o usuario a toa.
   */
  checar('o motor declara exatamente as geminacoes que a grade perdeu',
    reais.length === r.geminacoesQuebradas.length,
    `a grade perdeu ${reais.length} [${reais.join(' ; ')}] mas o motor declarou ${r.geminacoesQuebradas.length}`);

  /**
   * Sob pressao e que os vazamentos aparecem: o reparo so entra quando a busca
   * ja falhou, e foi la que a aula extra do dia estava sendo colada. Nenhum
   * cenario tranquilo pega isso.
   */
  const idxPorGrupoDia = indicesPorGrupoEDia(r.aulas);
  const estourou = [];
  for (const [sigla, p, np] of grade) {
    for (const [tipo, n] of [['presencial', p], ['nao_presencial', np || 0]]) {
      if (!n) continue;
      const teto = tetoDoDia(5, n, DIAS.length, geminar[sigla]);
      for (const t of turmas) {
        const porDia = idxPorGrupoDia.get(`${t.id}|c_${sigla}|${tipo}`) || new Map();
        for (const [d, idx] of porDia) {
          if (violaRegraDoDia(idx, geminar[sigla] || 2, teto)) {
            estourou.push(`${t.nome}/${sigla}/${d}=[${[...idx].sort((x, y) => x - y).map(v => v + 1).join(',')}] (teto ${teto})`);
          }
        }
      }
    }
  }
  checar('nenhum dia quebra a regra do dia',
    estourou.length === 0, estourou.slice(0, 8).join(' ; '));

  // Aviso, nao falha: a maioria deveria caber. Se despencar, algo regrediu.
  if (reais.length > pedidas / 2) {
    console.log(`   AVISO  mais da metade das geminacoes nao coube (${reais.length}/${pedidas}) — investigue`);
  }
}

// ─── Cenario 4: grade herdada fora do contrato nao pode voltar intacta ──────
//
// Foi o defeito visto em producao. A memoria devolvia uma grade montada por uma
// versao do motor que ainda nao tinha teto de sequencia — quatro aulas seguidas
// da mesma disciplina — e ela entrava como incumbente sem passar por nenhuma
// validacao. Depois de 70 mil tentativas e 21 minutos o motor devolvia a MESMA
// grade, aula por aula, com as sequencias de quatro intactas.
function cenario4() {
  console.log('\n4. grade herdada fora do contrato — o motor tem de podar, nao repetir');

  const grade = [['MAT', 4]];
  const t1 = montarTurno('t1', 'Matutino', 5, 7);
  const t2 = montarTurno('t2', 'Vespertino', 5, 13);
  const professores = [montarProfessor('p_MAT')];
  const turmas = [montarTurma(1, 'A', grade, () => 'p_MAT')];

  // As quatro aulas de MAT emendadas na segunda: nenhuma geracao nova poderia
  // produzir isso, porque sem geminacao pedida o teto e 2.
  const herdada = [0, 1, 2, 3].map(i => ({
    turma_id: 'turma1', componente_id: 'c_MAT', professor_id: 'p_MAT',
    dia_semana: 'segunda', aula_index: i, tipo: 'presencial', turno_id: 't1',
    aula_fixa_id: null,
  }));

  const r = semRuido(() => gerarHorarioAlgoritmico(
    t1, turmas, professores, [t1, t2], montarConfig(grade, {}),
    false,      // force
    [],         // ocupacoes existentes
    400,        // chunk
    0,          // offset
    [],         // aulas fixas
    false,      // permitir mesmo prof / disciplinas / mesmo dia
    400,        // orcamento total
    false,      // diagnostico
    herdada,    // grade herdada — fora do contrato de hoje
    null,       // pesos iniciais
    0,          // pendentes herdados: a grade se dizia completa
    {}
  ));

  const runs = (sequenciasPorGrupo(r.aulas).get('turma1|c_MAT|presencial') || []).sort((a, b) => b - a);
  checar('as 4 aulas continuam na grade', r.aulas.length === 4, `${r.aulas.length} aulas`);
  checar('a sequencia de 4 herdada nao sobreviveu', !runs.some(x => x > 2),
    `sequencias: [${runs.join(',')}]`);
}

// ─── Cenario 5: a regra do dia, na grade herdada ────────────────────────────
//
// A grade herdada e o jeito deterministico de exigir a poda: ela entra como
// incumbente sem passar por validacao nenhuma, entao se o motor nao souber
// cortar, ela volta intacta — que foi o que ja aconteceu uma vez.
//
// Os tres casos cobrem os dois lados da regra. O do meio e o mais importante:
// ele prova que o afrouxamento de fato chegou. Houve um teto de contagem puro
// aqui (no maximo 2 no dia), e ele proibia o espacado junto com o colado.
function cenario5() {
  console.log('\n5. regra do dia na grade herdada — o que respira fica, o que cola sai');

  const t1 = montarTurno('t1', 'Matutino', 5, 7);
  const t2 = montarTurno('t2', 'Vespertino', 5, 13);

  const casos = [
    {
      nome: 'dupla em 1-2 e avulsa em 4 (vao de 1)',
      grade: [['MAT', 3]], geminar: { MAT: 2 }, indices: [0, 1, 3],
      sobrevive: false,
    },
    {
      nome: 'dupla em 1-2 e avulsa em 5 (vao de 2)',
      grade: [['MAT', 3]], geminar: { MAT: 2 }, indices: [0, 1, 4],
      sobrevive: true,
    },
    {
      nome: 'duas duplas coladas no mesmo dia, sem geminacao pedida',
      grade: [['POR', 4]], geminar: {}, indices: [0, 1, 3, 4],
      sobrevive: false,
    },
  ];

  for (const caso of casos) {
    const sigla = caso.grade[0][0];
    const total = caso.grade[0][1];
    const professores = [montarProfessor(`p_${sigla}`)];
    const turmas = [montarTurma(1, 'A', caso.grade, () => `p_${sigla}`)];

    const herdada = caso.indices.map(i => ({
      turma_id: 'turma1', componente_id: `c_${sigla}`, professor_id: `p_${sigla}`,
      dia_semana: 'segunda', aula_index: i, tipo: 'presencial', turno_id: 't1',
      aula_fixa_id: null,
    }));

    const r = semRuido(() => gerarHorarioAlgoritmico(
      t1, turmas, professores, [t1, t2], montarConfig(caso.grade, caso.geminar),
      false,      // force
      [],         // ocupacoes existentes
      400,        // chunk
      0,          // offset
      [],         // aulas fixas
      false,      // permitir mesmo prof / disciplinas / mesmo dia
      400,        // orcamento total
      false,      // diagnostico
      herdada,    // grade herdada
      null,       // pesos iniciais
      0,          // pendentes herdados: a grade se dizia completa
      {}
    ));

    const naSegunda = r.aulas
      .filter(a => a.dia_semana === 'segunda')
      .map(a => a.aula_index)
      .sort((x, y) => x - y);

    checar(`${caso.nome}: as ${total} aulas continuam na grade`,
      r.aulas.length === total, `${r.aulas.length} aulas`);

    const igual = JSON.stringify(naSegunda) === JSON.stringify(caso.indices);
    if (caso.sobrevive) {
      checar(`${caso.nome}: a grade herdada sobrevive intacta`,
        igual, `a segunda ficou [${naSegunda.map(i => i + 1).join(',')}]`);
    } else {
      checar(`${caso.nome}: a grade herdada NAO sobrevive`,
        !igual, `a segunda continuou [${naSegunda.map(i => i + 1).join(',')}]`);
      const teto = tetoDoDia(5, total, DIAS.length, caso.geminar[sigla]);
      checar(`${caso.nome}: e o que sobrou respeita a regra`,
        !violaRegraDoDia(naSegunda, caso.geminar[sigla] || 2, teto),
        `a segunda ficou [${naSegunda.map(i => i + 1).join(',')}]`);
    }
  }
}

// ─── Cenario 6: a regra do dia, na fonte ────────────────────────────────────
//
// Igual ao cenario 0 e pelo mesmo motivo: olhar so a grade pronta nao distingue
// "o motor respeita a regra" de "a regra e frouxa". Aqui a funcao do motor e
// confrontada com uma tabela escrita a mao a partir do enunciado.
function cenario6() {
  console.log('\n6. regra do dia — a decisao, na fonte');

  if (typeof regraDoDiaViolada !== 'function') {
    falhas++;
    console.log('   FALHA  o motor nao exporta `regraDoDiaViolada` — a regra nao e verificavel');
    return;
  }

  //        descricao                                indices    run teto proibido?
  const casos = [
    ['MAT -- MAT -- MAT (avulsas, vao 1)',           [0, 2, 4],        1, 3, false],
    ['MAT MAT -- -- MAT (vao 2 depois da dupla)',    [0, 1, 4],        2, 3, false],
    ['MAT MAT -- MAT -- (vao 1 depois da dupla)',    [0, 1, 3],        2, 3, true],
    ['MAT MAT MAT (corrida de 3)',                   [0, 1, 2],        2, 3, true],
    ['4 avulsas espacadas num teto de 3',            [0, 2, 4, 6],     1, 3, true],
    ['integral: 2 duplas com vao 2',                 [0, 1, 4, 5],     2, 4, false],
    ['integral: 2 duplas com vao 1',                 [0, 1, 3, 4],     2, 4, true],
    ['integral: 4 avulsas vao 1, no teto',           [0, 2, 4, 6],     1, 4, false],
    ['integral: 5 avulsas vao 1, passa do teto',     [0, 2, 4, 6, 8],  1, 4, true],
    ['integral: dupla mais avulsa com vao 2',        [0, 1, 4],        2, 4, false],
    ['bloco de 4 pedido na tela',                    [0, 1, 2, 3],     4, 4, false],
    ['dia vazio',                                    [],               1, 3, false],
    ['uma aula so',                                  [3],              1, 3, false],
  ];

  for (const [desc, idx, run, teto, proibido] of casos) {
    const obtido = regraDoDiaViolada(idx, run, teto);
    checar(
      `${desc} -> ${proibido ? 'proibido' : 'permitido'}`,
      obtido === proibido,
      `o motor disse ${obtido ? 'proibido' : 'permitido'}`
    );
  }
}

// ─── Execucao ───────────────────────────────────────────────────────────────

console.log('=== verificacao do contrato de geminacao ===');
cenario0();
cenario1();
cenario2();
cenario3();
cenario4();
cenario5();
cenario6();

console.log('');
if (falhas === 0) {
  console.log('TUDO OK — o contrato de geminacao esta sendo cumprido.');
  process.exit(0);
} else {
  console.log(`${falhas} VERIFICACAO(OES) FALHARAM.`);
  process.exit(1);
}
