/**
 * Preencher sozinho as aulas que a geração deixou de fora.
 *
 * O irmão deste módulo, `refino-professores.ts`, troca o PROFESSOR da aula:
 * outro habilitado assume a vaga e o que ficou sem aula toma o lugar dele. Isso
 * resolve quando existe um segundo professor para a disciplina — e não resolve
 * nada quando não existe. Na Girassol as três aulas que faltaram eram todas de
 * Arte e Ensino Religioso, com um único professor na escola: não havia com quem
 * trocar, e o botão de trocas ficava sem resposta possível.
 *
 * Aqui o movimento é outro. O professor é fixo; o que anda é o BURACO.
 *
 *   A turma tem uma aula a menos que os slots do turno, então sobra um vazio.
 *   Se esse vazio caiu num horário em que o professor está bloqueado, ele nunca
 *   poderá ser preenchido — mas se OUTRA aula da turma se mudar para dentro do
 *   vazio, o vazio passa a ser o slot que ela desocupou. Repetindo, o buraco
 *   caminha pela grade até parar onde o professor cabe.
 *
 *   14.01, buraco em sexta 9ª (Edivaldo está indisponível a sexta inteira)
 *     move Física     de quarta 9ª → sexta 9ª     buraco vai para quarta 9ª
 *     move Produção   de terça 9ª  → quarta 9ª    buraco vai para terça 9ª
 *     move Prát.Quím. de sexta 5ª  → terça 9ª     buraco vai para sexta 5ª
 *     move Filosofia  de quarta 3ª → sexta 5ª     buraco vai para quarta 3ª
 *     cria  Arte do Edivaldo em quarta 3ª          buraco fechado
 *
 * Foram quatro movimentos, e não um, porque o caminho curto não existia: a
 * primeira aula que parecia poder ceder o lugar era de uma professora com livre
 * docência na sexta. Isso é o motivo de a busca aprofundar por conta própria em
 * vez de desistir num limite fixo.
 *
 * A busca é global, e não uma turma de cada vez, porque as pendências disputam
 * os mesmos horários do mesmo professor — resolvidas em sequência, a segunda
 * desfaria a primeira. É por isso que existe o retrocesso lá embaixo.
 *
 * O que este módulo checa e o refino de horário NÃO checa: as restrições do
 * professor e a regra do dia. `analisarMovimento` ignora as duas — inclusive a
 * livre docência, que nem mora em `restricoes` —, o que é aceitável quando um
 * humano está olhando a tela e decide, e não é aceitável quando a máquina aplica
 * uma cadeia inteira de uma vez sem ninguém conferir.
 */

import { motivoImpedimento } from './geracao/certificado';
import { getSlotMinutes, minutesConflitam, regraDoDiaViolada } from './horario-slots';
import {
  chaveProfessor,
  paraCertificado,
  type AulaAlocacao,
  type ProfessorAlocacao,
} from './refino-professores';
import type { Turno } from './types';

/** Uma aula que o cadastro pede, a grade não tem, e queremos encaixar. */
export type PendenciaVaga = {
  turma_id: string;
  turma_nome: string;
  componente_id: string;
  componente_nome: string;
  componente_sigla: string;
  tipo: 'presencial' | 'nao_presencial';
  turno_id: string;
  professor_id: string | null;
  professor_nome: string;
  /** Teto de aulas da disciplina no dia, já com o piso da carga aplicado. */
  tetoDoDia: number;
};

export type MovimentoPreenchimento =
  | {
      tipo: 'mover';
      aulaId: string;
      dia_semana: string;
      aula_index: number;
      turno_id: string;
    }
  | {
      tipo: 'criar';
      turma_id: string;
      componente_id: string;
      professor_id: string | null;
      tipo_aula: 'presencial' | 'nao_presencial';
      dia_semana: string;
      aula_index: number;
      turno_id: string;
    };

/** Um movimento contado para a tela, com os nomes que o usuário reconhece. */
export type PassoPreenchimento = {
  ordem: number;
  acao: 'mover' | 'criar';
  turma_nome: string;
  componente_sigla: string;
  componente_nome: string;
  professor_nome: string;
  origemDia: string | null;
  origemSlot: number | null;
  destinoDia: string;
  destinoSlot: number;
};

/** Por que uma pendência não teve jeito. */
export type FalhaPreenchimento = {
  turma_nome: string;
  componente_nome: string;
  professor_nome: string;
  motivo: string;
  detalhes: string[];
};

export type ResultadoPreenchimento = {
  movimentos: MovimentoPreenchimento[];
  passos: PassoPreenchimento[];
  resolvidas: number;
  total: number;
  falhas: FalhaPreenchimento[];
  mensagem: string;
};

/**
 * Até quantos movimentos o buraco pode caminhar atrás de um lugar.
 *
 * Três é o mesmo teto do refino, e não por imitação: cada passo a mais desloca
 * uma aula que já estava certa, e uma rota de seis movimentos "resolve" a
 * pendência entregando uma grade que o coordenador não reconhece mais.
 */
const MAX_PASSOS_POR_VAGA = 3;

/**
 * Até onde o aprofundamento progressivo vai quando 3 não bastam.
 *
 * Seis é onde a cadeia deixa de ser explicável: além disso o plano remaneja
 * meia turma para encaixar uma aula, e a resposta honesta passa a ser "não cabe,
 * e aqui está o porquê" em vez de uma reforma que ninguém vai conferir.
 */
const MAX_PASSOS_TETO = 6;

/** Orçamento da busca inteira. A tela espera por ele; não pode ser generoso. */
const MAX_TEMPO_MS = 8000;

/** Quantas rotas guardar por pendência antes de partir para o retrocesso. */
const MAX_ROTAS_POR_VAGA = 24;

/**
 * Emenda máxima presumida quando a grade não diz qual foi a geminação pedida.
 *
 * `horario_aulas` não guarda a configuração de geminação da geração. Assumir 2
 * é o que já se faz na alocação por trocas — mas assumir 2 cegamente recusaria
 * mexer numa turma cuja grade legitimamente tem um bloco de 3 pedido na tela.
 * Por isso o limite real é o MAIOR entre este piso e o que a grade já pratica:
 * a busca nunca aperta mais do que o horário atual, e nunca afrouxa além dele.
 */
const EMENDA_PRESUMIDA = 2;

type Posicao = { dia: string; slot: number; turnoId: string };

/** Uma rota: onde a aula que falta vai nascer, e o que precisa sair da frente. */
type Rota = {
  destino: Posicao;
  movimentos: { aula: AulaAlocacao; para: Posicao }[];
};

export function calcularPreenchimentoAutomatico(
  /** Aulas DESTE horário. São as únicas que a busca pode mover. */
  aulas: AulaAlocacao[],
  /** Aulas de outros horários vigentes: bloqueiam o professor, mas não se mexem. */
  externas: AulaAlocacao[],
  professores: ProfessorAlocacao[],
  turnosById: Map<string, Turno>,
  pendencias: PendenciaVaga[],
): ResultadoPreenchimento {
  const inicioMs = Date.now();
  const acabou = () => Date.now() - inicioMs > MAX_TEMPO_MS;

  const profPorId = new Map(professores.map(p => [p.id, p]));

  /**
   * Índices por turma, por professor e por grupo-disciplina.
   *
   * Sem eles cada pergunta ("a turma está ocupada?", "o professor está livre?")
   * varreria a grade inteira, e as aulas dos OUTROS horários vigentes da escola
   * são mais de dez mil linhas. A busca faz centenas de milhares dessas
   * perguntas; com varredura linear ela não terminaria dentro do orçamento.
   * A filiação de uma aula a uma turma e a um professor não muda durante a
   * busca — só a posição muda — então os índices podem ser montados uma vez.
   */
  const porTurma = new Map<string, AulaAlocacao[]>();
  const porProfessor = new Map<string, AulaAlocacao[]>();
  const porGrupo = new Map<string, AulaAlocacao[]>();
  const externasPorProfessor = new Map<string, AulaAlocacao[]>();

  const empilhar = <T,>(m: Map<string, T[]>, k: string | null, v: T) => {
    if (!k) return;
    const l = m.get(k);
    if (l) l.push(v);
    else m.set(k, [v]);
  };

  for (const a of aulas) {
    empilhar(porTurma, a.turma_id, a);
    empilhar(porProfessor, chaveProfessor(a.professor_id, a.professor_cpf), a);
    empilhar(porGrupo, `${a.turma_id}|${a.componente_id}|${a.tipo}`, a);
  }
  for (const e of externas) {
    empilhar(externasPorProfessor, chaveProfessor(e.professor_id, e.professor_cpf), e);
  }

  /**
   * A grade simulada.
   *
   * `deslocadas` guarda só o que mudou de lugar; `nascidas` guarda as aulas que
   * a busca criou. Clonar as 400 linhas da grade a cada ramo do retrocesso seria
   * caro e desnecessário — o que muda é sempre um punhado.
   */
  const deslocadas = new Map<string, Posicao>();
  const nascidas: {
    turma_id: string;
    componente_id: string;
    tipo: 'presencial' | 'nao_presencial';
    professor_id: string | null;
    professor_cpf: string | null;
    pos: Posicao;
  }[] = [];

  const posicaoDe = (a: AulaAlocacao): Posicao =>
    deslocadas.get(a.id) ?? { dia: a.dia_semana, slot: a.aula_index, turnoId: a.turno_id };

  const minutosDe = (p: Posicao) => getSlotMinutes(turnosById.get(p.turnoId), p.slot);

  /**
   * Os dois endereços acontecem ao mesmo tempo?
   *
   * Dentro do mesmo turno a comparação é por índice; entre turnos diferentes é
   * por minutos reais, porque a 1ª aula de um turno pode cair dentro da 3ª de
   * outro. É a mesma função do motor e do certificado — inclusive na parte
   * conservadora: horário não cadastrado conta como choque, para a busca não
   * inventar folga em cima de dado faltando.
   */
  const mesmoInstante = (a: Posicao, b: Posicao): boolean => {
    if (a.dia !== b.dia) return false;
    const [i1, f1] = minutosDe(a);
    const [i2, f2] = minutosDe(b);
    return minutesConflitam(i1, f1, i2, f2, a.turnoId === b.turnoId, a.slot, b.slot);
  };

  // ── O que ocupa cada coisa, na simulação ────────────────────────────────

  /** A turma já tem aula nesse instante? */
  const turmaOcupada = (turmaId: string, pos: Posicao, ignorar?: string): boolean => {
    for (const a of porTurma.get(turmaId) ?? []) {
      if (a.id === ignorar) continue;
      if (mesmoInstante(posicaoDe(a), pos)) return true;
    }
    for (const n of nascidas) {
      if (n.turma_id !== turmaId) continue;
      if (mesmoInstante(n.pos, pos)) return true;
    }
    return false;
  };

  /**
   * O professor está livre nesse instante?
   *
   * Compara minutos reais e não índice de aula: dois turnos da mesma escola não
   * começam na mesma hora, e a 1ª de um pode cair dentro da 3ª de outro. Varre
   * também os horários vigentes de outros turnos — o professor não pode estar
   * em duas salas ao mesmo tempo em grade nenhuma.
   */
  const professorLivre = (
    profId: string | null,
    cpf: string | null | undefined,
    pos: Posicao,
    ignorar?: string,
  ): boolean => {
    const chave = chaveProfessor(profId, cpf);
    if (!chave) return true; // aula sem professor não disputa ninguém

    for (const a of porProfessor.get(chave) ?? []) {
      if (a.id === ignorar) continue;
      if (mesmoInstante(posicaoDe(a), pos)) return false;
    }
    for (const e of externasPorProfessor.get(chave) ?? []) {
      const pe = { dia: e.dia_semana, slot: e.aula_index, turnoId: e.turno_id };
      if (mesmoInstante(pe, pos)) return false;
    }
    for (const n of nascidas) {
      if (chaveProfessor(n.professor_id, n.professor_cpf) !== chave) continue;
      if (mesmoInstante(n.pos, pos)) return false;
    }
    return true;
  };

  /**
   * O slot está vedado a este professor?
   *
   * A resposta vem de `motivoImpedimento`, a mesma função que o certificado de
   * inviabilidade e o Mapa de Disponibilidade usam. Reimplementar aqui seria a
   * quarta cópia da regra — e a que erraria, porque a livre docência não mora
   * numa célula de `restricoes`: ela é declarada por período do dia, num campo à
   * parte, e só vale quando o professor não dispensou a preferência.
   *
   * `planejamento` e os tipos `personalizado*` NÃO entram: o motor os trata como
   * soft e pode usá-los sob relaxamento. Aqui eles ficam de fora por outro
   * motivo — este preenchimento aplica dez movimentos de uma vez sem ninguém
   * conferir, e gastar o planejamento de um professor calado é o tipo de coisa
   * que só se descobre quando ele reclama. O diagnóstico conta quantos são,
   * para quem quiser usá-los à mão.
   */
  const restrito = (profId: string | null, pos: Posicao): string | null => {
    if (!profId) return null;
    const p = profPorId.get(profId);
    if (!p) return null;
    const turno = turnosById.get(pos.turnoId);
    if (!turno) return null;

    const impedimento = motivoImpedimento(paraCertificado(p), turno, pos.dia, pos.slot);
    if (impedimento) return impedimento;

    const estado = p.restricoes?.[pos.turnoId]?.[pos.dia]?.[String(pos.slot)];
    if (estado === 'planejamento') return 'planejamento';
    if (typeof estado === 'string' && estado.startsWith('personalizado')) return estado;
    return null;
  };

  // ── A regra do dia, aferida contra o que a grade já pratica ─────────────

  const indicesDoGrupoNoDia = (
    turmaId: string, compId: string, tipo: string, dia: string, ignorar?: string,
  ): number[] => {
    const idx: number[] = [];
    for (const a of porGrupo.get(`${turmaId}|${compId}|${tipo}`) ?? []) {
      if (a.id === ignorar) continue;
      const p = posicaoDe(a);
      if (p.dia === dia) idx.push(p.slot);
    }
    for (const n of nascidas) {
      if (n.turma_id !== turmaId || n.componente_id !== compId || n.tipo !== tipo) continue;
      if (n.pos.dia === dia) idx.push(n.pos.slot);
    }
    return idx;
  };

  /**
   * Quanto a grade ATUAL já emenda e acumula desta disciplina.
   *
   * A geração não grava a geminação que usou, então o limite não é legível — só
   * observável. Tomar o que a grade pratica como piso evita o erro grosseiro de
   * recusar um movimento porque ele reproduz um bloco de 3 que o próprio usuário
   * pediu na tela e que já está lá, salvo, há semanas.
   */
  const pratica = new Map<string, { run: number; teto: number }>();
  const observado = (turmaId: string, compId: string, tipo: string): { run: number; teto: number } => {
    const k = `${turmaId}|${compId}|${tipo}`;
    const memo = pratica.get(k);
    if (memo) return memo;

    const porDia = new Map<string, number[]>();
    for (const a of porGrupo.get(k) ?? []) {
      const lista = porDia.get(a.dia_semana);
      if (lista) lista.push(a.aula_index);
      else porDia.set(a.dia_semana, [a.aula_index]);
    }

    let run = EMENDA_PRESUMIDA;
    let teto = 0;
    for (const idx of porDia.values()) {
      const ord = [...new Set(idx)].sort((x, y) => x - y);
      teto = Math.max(teto, ord.length);
      let corrida = 1;
      for (let i = 1; i < ord.length; i++) {
        corrida = ord[i] === ord[i - 1] + 1 ? corrida + 1 : 1;
        run = Math.max(run, corrida);
      }
      if (ord.length >= 1) run = Math.max(run, 1);
    }

    const r = { run, teto };
    pratica.set(k, r);
    return r;
  };

  /** A disciplina aguenta ganhar esse slot nesse dia? */
  const regraDoDiaAceita = (
    turmaId: string, compId: string, tipo: string,
    dia: string, slot: number, tetoMinimo: number, ignorar?: string,
  ): boolean => {
    const obs = observado(turmaId, compId, tipo);
    const idx = indicesDoGrupoNoDia(turmaId, compId, tipo, dia, ignorar);
    idx.push(slot);
    return !regraDoDiaViolada(idx, obs.run, Math.max(tetoMinimo, obs.teto));
  };

  // ── A aula pode ir para lá? ─────────────────────────────────────────────

  /** Por que esta aula não pode ir para ali, ou `null` se pode. */
  type Empecilho = 'travada' | 'turma_ocupada' | 'restricao' | 'professor_ocupado' | 'regra_do_dia';

  const motivoNaoMove = (a: AulaAlocacao, para: Posicao): Empecilho | null => {
    if (a.aula_fixa_id) return 'travada'; // travada na série: imóvel por contrato
    if (turmaOcupada(a.turma_id, para, a.id)) return 'turma_ocupada';
    if (restrito(a.professor_id, para)) return 'restricao';
    if (!professorLivre(a.professor_id, a.professor_cpf, para, a.id)) return 'professor_ocupado';
    const obs = observado(a.turma_id, a.componente_id, a.tipo);
    if (!regraDoDiaAceita(a.turma_id, a.componente_id, a.tipo, para.dia, para.slot, obs.teto, a.id)) {
      return 'regra_do_dia';
    }
    return null;
  };

  const podeMover = (a: AulaAlocacao, para: Posicao): boolean => motivoNaoMove(a, para) === null;

  const podeNascer = (pend: PendenciaVaga, pos: Posicao): boolean => {
    if (turmaOcupada(pend.turma_id, pos)) return false;
    if (restrito(pend.professor_id, pos)) return false;
    const cpf = pend.professor_id ? profPorId.get(pend.professor_id)?.cpf ?? null : null;
    if (!professorLivre(pend.professor_id, cpf, pos)) return false;
    return regraDoDiaAceita(
      pend.turma_id, pend.componente_id, pend.tipo, pos.dia, pos.slot, pend.tetoDoDia,
    );
  };

  // ── Onde estão os buracos de uma turma ──────────────────────────────────

  const buracosDaTurma = (turmaId: string, turnoId: string): Posicao[] => {
    const turno = turnosById.get(turnoId);
    if (!turno) return [];
    const vazios: Posicao[] = [];
    for (const dia of turno.dias_semana ?? []) {
      for (let s = 0; s < (turno.aulas_por_dia ?? 0); s++) {
        const pos = { dia, slot: s, turnoId };
        if (!turmaOcupada(turmaId, pos)) vazios.push(pos);
      }
    }
    return vazios;
  };

  /**
   * A CADEIA ATRAVESSANDO TURMAS.
   *
   * O buraco anda dentro de uma turma só — é dela que ele é. Mas a aula que
   * poderia se mudar para dentro dele frequentemente não pode por um motivo que
   * nada tem a ver com esta turma: o professor dela está dando aula em OUTRA
   * turma naquele instante. Na Girassol é o caso de 11 das 44 aulas da 72.01.
   *
   * Aqui se tenta desimpedir isso. A aula que segura o professor é trocada de
   * lugar com outra da própria turma dela — uma transposição, que não precisa de
   * buraco nenhum e por isso funciona mesmo em turma lotada. Liberado o
   * professor, a aula original pode enfim se mudar para o buraco.
   *
   * Custa dois movimentos e mexe numa turma que não tinha problema algum, então
   * só se paga esse preço quando o empecilho é exatamente esse. Aulas de outros
   * horários vigentes não entram: elas bloqueiam o professor e não se mexem,
   * porque não pertencem à grade que está sendo editada.
   */
  const liberarProfessor = (
    aula: AulaAlocacao,
    destino: Posicao,
    jaMovidas: Set<string>,
  ): { aula: AulaAlocacao; para: Posicao }[] | null => {
    const chave = chaveProfessor(aula.professor_id, aula.professor_cpf);
    if (!chave) return null;

    // Quem, nesta grade, segura o professor no instante do destino?
    const presos = (porProfessor.get(chave) ?? []).filter(
      o => o.id !== aula.id && mesmoInstante(posicaoDe(o), destino),
    );
    if (presos.length !== 1) return null; // zero não deveria acontecer; dois não se resolve com uma troca
    const preso = presos[0];
    if (preso.aula_fixa_id || jaMovidas.has(preso.id)) return null;
    if (preso.turma_id === aula.turma_id) return null; // mesma turma: é o caso do buraco, não deste atalho

    // Compromisso externo não se move.
    for (const e of externasPorProfessor.get(chave) ?? []) {
      if (mesmoInstante({ dia: e.dia_semana, slot: e.aula_index, turnoId: e.turno_id }, destino)) return null;
    }

    const posPreso = posicaoDe(preso);

    for (const troca of porTurma.get(preso.turma_id) ?? []) {
      if (troca.id === preso.id || troca.aula_fixa_id || jaMovidas.has(troca.id)) continue;
      const posTroca = posicaoDe(troca);
      if (posTroca.dia === posPreso.dia && posTroca.slot === posPreso.slot) continue;

      // Simula a transposição e pergunta se as duas pontas ficam legítimas.
      const desfazer = aplicarMovimentos([
        { aula: preso, para: posTroca },
        { aula: troca, para: posPreso },
      ]);
      const ok =
        motivoNaoMove(preso, posTroca) === null &&
        motivoNaoMove(troca, posPreso) === null;
      desfazer();

      if (ok) {
        return [
          { aula: preso, para: posTroca },
          { aula: troca, para: posPreso },
        ];
      }
    }

    return null;
  };

  /**
   * As rotas de uma pendência: por onde o buraco pode caminhar até um lugar bom.
   *
   * Largura primeiro, para que as rotas curtas apareçam antes das longas — o
   * retrocesso experimenta nessa ordem e quase sempre fecha nas primeiras.
   */
  const rotasPara = (pend: PendenciaVaga, profundidade: number): Rota[] => {
    const rotas: Rota[] = [];
    const vistos = new Set<string>();

    type No = { buraco: Posicao; movimentos: { aula: AulaAlocacao; para: Posicao }[] };
    const fila: No[] = buracosDaTurma(pend.turma_id, pend.turno_id).map(b => ({
      buraco: b,
      movimentos: [],
    }));
    for (const n of fila) vistos.add(`${n.buraco.dia}|${n.buraco.slot}`);

    while (fila.length > 0) {
      if (acabou() || rotas.length >= MAX_ROTAS_POR_VAGA) break;
      const no = fila.shift()!;

      // Para simular este nó, os movimentos dele precisam estar valendo.
      const desfazer = aplicarMovimentos(no.movimentos);
      try {
        if (podeNascer(pend, no.buraco)) {
          rotas.push({ destino: no.buraco, movimentos: no.movimentos });
        }

        if (no.movimentos.length < profundidade) {
          // Quem da turma poderia se mudar PARA o buraco? Cada candidato que
          // couber abre um buraco novo no lugar de onde saiu.
          const jaMovidas = new Set(no.movimentos.map(m => m.aula.id));

          for (const cand of porTurma.get(pend.turma_id) ?? []) {
            if (jaMovidas.has(cand.id)) continue;
            const origem = posicaoDe(cand);
            if (origem.dia === no.buraco.dia && origem.slot === no.buraco.slot) continue;

            const chave = `${origem.dia}|${origem.slot}`;
            if (vistos.has(chave)) continue;

            /**
             * Duas maneiras de o candidato entrar no buraco: direto, ou depois
             * de destravar o professor dele noutra turma. A segunda só é tentada
             * quando o empecilho é exatamente esse — desarrumar uma turma alheia
             * para contornar uma restrição de agenda não resolveria nada.
             */
            let extras: { aula: AulaAlocacao; para: Posicao }[] = [];
            const empecilho = motivoNaoMove(cand, no.buraco);

            if (empecilho === 'professor_ocupado' && no.movimentos.length + 3 <= profundidade) {
              const soltura = liberarProfessor(cand, no.buraco, jaMovidas);
              if (!soltura) continue;
              const desfazerExtras = aplicarMovimentos(soltura);
              const agoraVai = motivoNaoMove(cand, no.buraco) === null;
              desfazerExtras();
              if (!agoraVai) continue;
              extras = soltura;
            } else if (empecilho !== null) {
              continue;
            }

            vistos.add(chave);
            fila.push({
              buraco: origem,
              movimentos: [...no.movimentos, ...extras, { aula: cand, para: no.buraco }],
            });
          }
        }
      } finally {
        desfazer();
      }
    }

    rotas.sort((a, b) => a.movimentos.length - b.movimentos.length);
    return rotas;
  };

  /** Aplica movimentos na simulação e devolve como desfazê-los. */
  function aplicarMovimentos(movs: { aula: AulaAlocacao; para: Posicao }[]): () => void {
    const antes: [string, Posicao | undefined][] = movs.map(m => [m.aula.id, deslocadas.get(m.aula.id)]);
    for (const m of movs) deslocadas.set(m.aula.id, m.para);
    return () => {
      for (const [id, pos] of antes) {
        if (pos) deslocadas.set(id, pos);
        else deslocadas.delete(id);
      }
    };
  }

  // ── Retrocesso sobre as pendências ─────────────────────────────────────

  const escolhidas: { pend: PendenciaVaga; rota: Rota }[] = [];

  /**
   * Ordena pelas mais difíceis primeiro (menos rotas disponíveis).
   *
   * Sem isso, a pendência fácil consome o horário que era a ÚNICA saída da
   * difícil e o retrocesso paga para descobrir isso — que foi exatamente o caso
   * da 14.01 contra a 34.02, ambas disputando segunda 4ª do mesmo professor.
   */
  const ordenar = (restantes: PendenciaVaga[], profundidade: number): PendenciaVaga[] =>
    [...restantes]
      .map(p => ({ p, n: rotasPara(p, profundidade).length }))
      .sort((a, b) => a.n - b.n)
      .map(x => x.p);

  const resolver = (restantes: PendenciaVaga[], profundidade: number): boolean => {
    if (restantes.length === 0) return true;
    if (acabou()) return false;

    const [pend, ...resto] = restantes;
    for (const rota of rotasPara(pend, profundidade)) {
      if (acabou()) return false;

      const desfazer = aplicarMovimentos(rota.movimentos);
      const cpf = pend.professor_id ? profPorId.get(pend.professor_id)?.cpf ?? null : null;
      nascidas.push({
        turma_id: pend.turma_id,
        componente_id: pend.componente_id,
        tipo: pend.tipo,
        professor_id: pend.professor_id,
        professor_cpf: cpf,
        pos: rota.destino,
      });
      escolhidas.push({ pend, rota });

      if (resolver(resto, profundidade)) return true;

      escolhidas.pop();
      nascidas.pop();
      desfazer();
    }
    return false;
  };

  const zerarSimulacao = () => {
    escolhidas.length = 0;
    nascidas.length = 0;
    deslocadas.clear();
  };

  /**
   * Aprofundamento progressivo: tenta curto, depois vai fundo.
   *
   * A primeira passada admite cadeias de até `MAX_PASSOS_POR_VAGA` movimentos.
   * Se ela fechar tudo, pronto — e fecha com as rotas mais curtas, que é o que
   * se quer: quanto menos aula deslocada, mais o coordenador reconhece a grade
   * que ele revisou. Só quando sobra pendência é que vale pagar por cadeias
   * longas, e aí o limite é o relógio, não um número escolhido de antemão.
   *
   * A cada rodada a simulação é zerada: um plano é um conjunto coerente de
   * movimentos, e misturar metade de uma tentativa com metade de outra produz
   * exatamente a grade que ninguém pediu.
   */
  let melhor: { escolhidas: typeof escolhidas; profundidade: number } | null = null;
  let profundidadeUsada = MAX_PASSOS_POR_VAGA;

  for (let prof = MAX_PASSOS_POR_VAGA; prof <= MAX_PASSOS_TETO; prof++) {
    zerarSimulacao();
    const ordenadas = ordenar(pendencias, prof);
    const fechou = resolver(ordenadas, prof);
    profundidadeUsada = prof;

    if (fechou) {
      melhor = { escolhidas: [...escolhidas], profundidade: prof };
      break;
    }

    // Não fechou tudo: guarda o melhor parcial e tenta mais fundo enquanto
    // houver relógio. Meia grade preenchida vale mais que nenhuma.
    zerarSimulacao();
    for (const pend of ordenadas) {
      if (acabou()) break;
      const rotas = rotasPara(pend, prof);
      if (rotas.length === 0) continue;
      const rota = rotas[0];
      aplicarMovimentos(rota.movimentos);
      const cpf = pend.professor_id ? profPorId.get(pend.professor_id)?.cpf ?? null : null;
      nascidas.push({
        turma_id: pend.turma_id,
        componente_id: pend.componente_id,
        tipo: pend.tipo,
        professor_id: pend.professor_id,
        professor_cpf: cpf,
        pos: rota.destino,
      });
      escolhidas.push({ pend, rota });
    }
    if (!melhor || escolhidas.length > melhor.escolhidas.length) {
      melhor = { escolhidas: [...escolhidas], profundidade: prof };
    }
    if (escolhidas.length === pendencias.length || acabou()) break;
  }

  // Reconstrói a simulação a partir do melhor plano encontrado, para que o
  // diagnóstico lá embaixo enxergue a grade que o plano realmente entrega.
  if (melhor) {
    zerarSimulacao();
    for (const { pend, rota } of melhor.escolhidas) {
      aplicarMovimentos(rota.movimentos);
      const cpf = pend.professor_id ? profPorId.get(pend.professor_id)?.cpf ?? null : null;
      nascidas.push({
        turma_id: pend.turma_id,
        componente_id: pend.componente_id,
        tipo: pend.tipo,
        professor_id: pend.professor_id,
        professor_cpf: cpf,
        pos: rota.destino,
      });
      escolhidas.push({ pend, rota });
    }
  }

  // ── Monta a saída ──────────────────────────────────────────────────────

  const movimentos: MovimentoPreenchimento[] = [];
  const passos: PassoPreenchimento[] = [];
  let ordem = 0;

  for (const { pend, rota } of escolhidas) {
    for (const m of rota.movimentos) {
      movimentos.push({
        tipo: 'mover',
        aulaId: m.aula.id,
        dia_semana: m.para.dia,
        aula_index: m.para.slot,
        turno_id: m.para.turnoId,
      });
      passos.push({
        ordem: ordem++,
        acao: 'mover',
        turma_nome: m.aula.turma_nome,
        componente_sigla: m.aula.componente_sigla,
        componente_nome: m.aula.componente_nome,
        professor_nome: m.aula.professor_nome,
        origemDia: m.aula.dia_semana,
        origemSlot: m.aula.aula_index,
        destinoDia: m.para.dia,
        destinoSlot: m.para.slot,
      });
    }
    movimentos.push({
      tipo: 'criar',
      turma_id: pend.turma_id,
      componente_id: pend.componente_id,
      professor_id: pend.professor_id,
      tipo_aula: pend.tipo,
      dia_semana: rota.destino.dia,
      aula_index: rota.destino.slot,
      turno_id: rota.destino.turnoId,
    });
    passos.push({
      ordem: ordem++,
      acao: 'criar',
      turma_nome: pend.turma_nome,
      componente_sigla: pend.componente_sigla,
      componente_nome: pend.componente_nome,
      professor_nome: pend.professor_nome,
      origemDia: null,
      origemSlot: null,
      destinoDia: rota.destino.dia,
      destinoSlot: rota.destino.slot,
    });
  }

  const resolvidasIds = new Set(escolhidas.map(e => chaveDaPendencia(e.pend)));
  const falhas = pendencias
    .filter(p => !resolvidasIds.has(chaveDaPendencia(p)))
    .map(p => diagnosticar(p));

  return {
    movimentos,
    passos,
    resolvidas: escolhidas.length,
    total: pendencias.length,
    falhas,
    mensagem: montarMensagem(escolhidas.length, pendencias.length, movimentos.length, acabou()),
  };

  // ── Diagnóstico de quem não coube ──────────────────────────────────────

  /**
   * Por que esta aula não entrou.
   *
   * Percorre a semana inteira e classifica cada horário do turno pelo primeiro
   * motivo que o descarta. Um "não deu" seco obriga o coordenador a refazer a
   * conta na mão — que é o trabalho que a tela deveria estar poupando.
   */
  function diagnosticar(pend: PendenciaVaga): FalhaPreenchimento {
    const turno = turnosById.get(pend.turno_id);
    const dias = turno?.dias_semana ?? [];
    const porDia = turno?.aulas_por_dia ?? 0;

    let restritos = 0;
    let reservados = 0; // planejamento / personalizado: soft, mas não gastamos
    let ocupadoEmOutraTurma = 0;
    let regraDia = 0;
    let livresParaEle = 0;
    const conflitos = new Map<string, number>();

    for (const dia of dias) {
      for (let s = 0; s < porDia; s++) {
        const pos = { dia, slot: s, turnoId: pend.turno_id };
        const marca = restrito(pend.professor_id, pos);
        if (marca) {
          if (marca === 'planejamento' || marca.startsWith('personalizado')) reservados++;
          else restritos++;
          continue;
        }
        const cpf = pend.professor_id ? profPorId.get(pend.professor_id)?.cpf ?? null : null;
        if (!professorLivre(pend.professor_id, cpf, pos)) {
          ocupadoEmOutraTurma++;
          const chave = chaveProfessor(pend.professor_id, cpf);
          const quem = (chave ? porProfessor.get(chave) ?? [] : []).find(a =>
            mesmoInstante(posicaoDe(a), pos),
          );
          if (quem) conflitos.set(quem.turma_nome, (conflitos.get(quem.turma_nome) ?? 0) + 1);
          continue;
        }
        if (!regraDoDiaAceita(pend.turma_id, pend.componente_id, pend.tipo, dia, s, pend.tetoDoDia)) {
          regraDia++;
          continue;
        }
        livresParaEle++;
      }
    }

    const total = dias.length * porDia;
    const detalhes: string[] = [];
    detalhes.push(
      `${pend.professor_nome} tem ${total - restritos - reservados} de ${total} horários do turno liberados` +
        ` (${restritos} bloqueados por indisponibilidade, livre docência ou reunião de fluxo` +
        (reservados > 0 ? `, ${reservados} reservados para planejamento` : '') +
        ').',
    );
    if (ocupadoEmOutraTurma > 0) {
      const top = [...conflitos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
      detalhes.push(
        `Em ${ocupadoEmOutraTurma} desses horários ele já está em sala` +
          (top.length ? ` — principalmente ${top.map(([t, n]) => `${t} (${n})`).join(', ')}.` : '.'),
      );
    }
    if (regraDia > 0) {
      detalhes.push(
        `Em ${regraDia} horários a aula caberia, mas amontoaria ${pend.componente_sigla || pend.componente_nome}` +
          ' no dia (aulas coladas ou acima do teto diário).',
      );
    }

    /**
     * Por que o buraco da turma não sai do lugar.
     *
     * É a pergunta que o coordenador realmente tem: "a aula cabe em 4 horários,
     * então por que não entra?". Porque nenhum desses 4 está VAZIO nesta turma,
     * e o vazio que ela tem está num horário em que o professor não pode. Para o
     * vazio andar, alguma aula da turma precisa se mudar para dentro dele — e
     * aqui se conta quantas poderiam e o que impede cada uma.
     */
    for (const vazio of buracosDaTurma(pend.turma_id, pend.turno_id)) {
      const contagem = new Map<string, number>();
      let candidatas = 0;
      for (const a of porTurma.get(pend.turma_id) ?? []) {
        const emp = motivoNaoMove(a, vazio);
        if (emp === null) candidatas++;
        else contagem.set(emp, (contagem.get(emp) ?? 0) + 1);
      }

      const rotuloEmpecilho: Record<string, string> = {
        travada: 'aula travada na série',
        turma_ocupada: 'a turma já tem aula nesse instante',
        restricao: 'o professor tem bloqueio ou livre docência nesse horário',
        professor_ocupado: 'o professor está em outra turma nesse horário',
        regra_do_dia: 'amontoaria a disciplina no dia',
      };
      const quebra = [...contagem.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => `${n} ${rotuloEmpecilho[k] ?? k}`)
        .join('; ');

      detalhes.push(
        candidatas > 0
          ? `O vazio da turma está em ${rotulo(vazio.dia, vazio.slot)} e ${candidatas} aula(s) da turma` +
            ' poderiam se mudar para lá, mas nenhuma cadeia a partir daí chegou a um horário livre do professor.'
          : `O vazio da turma está em ${rotulo(vazio.dia, vazio.slot)} e NENHUMA aula da turma pode se mudar para` +
            ` lá — ${quebra}. Enquanto o vazio não sair desse horário, esta aula não tem como entrar.`,
      );
    }

    let motivo: string;
    if (livresParaEle === 0 && restritos >= total - 1) {
      motivo = `${pend.professor_nome} está bloqueado em praticamente todo o turno; não sobra horário para esta aula.`;
    } else if (livresParaEle === 0) {
      motivo =
        `Não sobrou nenhum horário em que ${pend.professor_nome} esteja livre e a turma ${pend.turma_nome}` +
        ' tenha vaga ao mesmo tempo.';
    } else {
      motivo =
        `Existem ${livresParaEle} horários possíveis para ${pend.professor_nome}, mas nenhum deles é um vazio da` +
        ` turma ${pend.turma_nome}, e o buraco dela não conseguiu caminhar até lá em ${profundidadeUsada}` +
        ' movimentos sem quebrar outra turma.';
      detalhes.push(
        'Liberar um desses horários na turma — movendo à mão uma aula que hoje o ocupa — costuma destravar o caso.',
      );
    }
    if (reservados > 0 && livresParaEle === 0) {
      detalhes.push(
        `Há ainda ${reservados} horários de planejamento dele. O preenchimento automático não os usa; se a escola` +
          ' aceitar abrir mão de um, dá para encaixar a aula ali pelo refino de horário.',
      );
    }

    return {
      turma_nome: pend.turma_nome,
      componente_nome: pend.componente_nome,
      professor_nome: pend.professor_nome,
      motivo,
      detalhes,
    };
  }
}

function chaveDaPendencia(p: PendenciaVaga): string {
  return `${p.turma_id}|${p.componente_id}|${p.tipo}`;
}

function montarMensagem(
  resolvidas: number, total: number, movimentos: number, estourouTempo: boolean,
): string {
  if (total === 0) return 'Não há aulas pendentes neste horário.';
  if (resolvidas === 0) {
    return estourouTempo
      ? 'A busca esgotou o tempo sem encontrar rota. Veja abaixo o que trava cada aula.'
      : 'Nenhuma das aulas pendentes pôde ser encaixada. Veja abaixo o motivo de cada uma.';
  }
  const deslocamentos = movimentos - resolvidas;
  const parte =
    resolvidas === total
      ? `Todas as ${total} aulas pendentes cabem`
      : `${resolvidas} de ${total} aulas pendentes cabem`;
  return (
    `${parte}, deslocando ${deslocamentos} aula${deslocamentos === 1 ? '' : 's'} que já estava` +
    `${deslocamentos === 1 ? '' : 'm'} na grade.`
  );
}

/** "sexta 9ª" — como o coordenador lê o horário na tela. */
function rotulo(dia: string, slot: number): string {
  return `${dia} ${slot + 1}ª`;
}
