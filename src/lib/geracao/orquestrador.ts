/**
 * Orquestrador da geração de horário.
 *
 * Este é o laço que antes vivia no NAVEGADOR: a tela chamava uma Server Action
 * por lote de 100 tentativas, centenas de vezes seguidas. Fechar a aba matava a
 * geração, e cada lote era uma requisição longa que o proxy da SEDUC cortava aos
 * 60s. Agora o laço roda aqui, no servidor, e a tela apenas observa a linha de
 * `geracao_jobs`.
 *
 * Duas propriedades do motor tornam isto simples:
 *
 *   1. cada tentativa é um restart aleatório independente, semeado pelo seu
 *      índice global — então repartir o orçamento entre N threads é só dividir a
 *      faixa de índices, sem coordenação nenhuma entre elas;
 *   2. a fase de relaxamento é função do índice global, então todos os pedaços
 *      de uma mesma rodada buscam sob as mesmas regras.
 */

import { NUM_WORKERS, gerarHorarioEmWorker } from '@/lib/timetabling-pool';
import { registrarLog, registrarLogs } from '@/lib/log-geracao';
import type { Turno } from '@/lib/types';
import type { GeminacaoQuebrada } from '@/lib/timetabling';
import { carregarDadosDaGeracao, inepDaEscola, mensagemDeErro } from './dados';
import { gravarMemoria, registrarPadroes } from './memoria';
import { certificar } from './certificado';
import { converterPreProducao, salvarGrade } from './salvar-grade';
import {
    atualizarProgresso,
    finalizarJob,
    registrarHorarioGerado,
    registrarParcial,
    type GeracaoJob,
} from './job-store';

/**
 * Tamanho do pedaço despachado a cada thread, em tentativas.
 *
 * É apenas o ponto de partida: o custo de uma tentativa varia de menos de 1ms a
 * centenas de ms conforme o tamanho da escola, então o valor é reajustado a cada
 * rodada para mirar `ALVO_RODADA_MS` (ver o ajuste dentro de `gerarTurno`).
 */
const CHUNK_INICIAL = Number(process.env.SHETO_CHUNK_TENTATIVAS) || 25;
const CHUNK_MIN = 5;
const CHUNK_MAX = 5000;

/**
 * Duração alvo de uma rodada. Define de quanto em quanto tempo a barra de
 * progresso anda e — por a rodada ser indivisível — o pior caso de espera para
 * o cancelamento fazer efeito.
 */
const ALVO_RODADA_MS = Number(process.env.SHETO_ALVO_RODADA_MS) || 8000;

/**
 * Intervalo do pulso de vida (heartbeat + leitura do pedido de cancelamento).
 *
 * Por relógio, não por rodada concluída: uma rodada pode passar de um minuto
 * numa escola grande, e o job seria marcado como órfão estando vivo.
 */
const PULSO_MS = Number(process.env.SHETO_PULSO_MS) || 10000;

/** Orçamento total de tentativas por turno. */
export const ORCAMENTO_PADRAO = Number(process.env.SHETO_ORCAMENTO_TENTATIVAS) || 100000;

/**
 * Parada, agora medida em TEMPO e não em tentativas.
 *
 * Contar tentativas nunca disse muita coisa: uma tentativa custa menos de 1ms
 * numa escola pequena e centenas de ms numa grande, então o mesmo número
 * significava dez segundos aqui e vinte minutos ali. Com a busca partindo da
 * melhor grade, a pergunta certa também mudou — não é "quantas vezes tentou" e
 * sim "há quanto tempo não melhora".
 *
 * `SHETO_TEMPO_MAX_TURNO_S` é o teto duro por turno; `SHETO_ESTAGNACAO_S` é o
 * tempo sem reduzir uma única pendência depois do qual não vale mais insistir.
 * Grade fácil fecha em segundos e nenhum dos dois chega a valer.
 */
const TEMPO_MAX_TURNO_MS = (Number(process.env.SHETO_TEMPO_MAX_TURNO_S) || 7200) * 1000;
const ESTAGNACAO_MS = (Number(process.env.SHETO_ESTAGNACAO_S) || 600) * 1000;

/**
 * A estagnação só é armada depois que todas as relaxações entraram (último
 * limiar: `SHETO_RELAX_DIAS`). Antes disso a busca ainda está sob restrições que
 * ela mesma vai afrouxar, e um platô ali não significa nada.
 */
const PLATEAU_ARMA_APOS = Number(process.env.SHETO_RELAX_DIAS) || 0.70;

/**
 * Jobs em execução neste processo. Só para diagnóstico e para impedir que um
 * mesmo job seja executado duas vezes pela mesma instância — a verdade do estado
 * é a tabela, justamente para que a tela funcione mesmo que o poll caia em outra
 * instância do pm2 ou depois de o processo ter morrido.
 */
declare global {
    // eslint-disable-next-line no-var
    var __shetoGeracaoAtiva: Set<string> | undefined;
}

function jobsAtivos(): Set<string> {
    if (!global.__shetoGeracaoAtiva) global.__shetoGeracaoAtiva = new Set();
    return global.__shetoGeracaoAtiva;
}

/**
 * Dispara a execução do job e retorna IMEDIATAMENTE — é isto que faz a geração
 * sobreviver ao fim da requisição (e ao fechamento da aba).
 *
 * O `.catch()` não é zelo: uma rejeição sem tratamento numa promise órfã derruba
 * o processo inteiro do Next, e com ele todas as sessões abertas.
 */
export function dispararJob(job: GeracaoJob): void {
    if (jobsAtivos().has(job.id)) return;
    jobsAtivos().add(job.id);

    void executarJob(job)
        .catch(async (err) => {
            console.error(`[geracao] job ${job.id} morreu de forma inesperada:`, err);
            try {
                await finalizarJob(job.id, 'falhou', { erro: mensagemDeErro(err) });
            } catch (err2) {
                console.error(`[geracao] job ${job.id}: falha ao registrar o próprio erro:`, err2);
            }
        })
        .finally(() => {
            jobsAtivos().delete(job.id);
        });
}

type ResultadoTurno =
    | {
        tipo: 'sucesso';
        aulas: any[];
        tentativas: number;
        pesos: Record<string, number>;
        /**
         * Grade fechada, mas sem uma ou mais geminações pedidas.
         *
         * Sucesso parcial existe e precisa de nome próprio: a grade não tem
         * buraco nenhum — todas as aulas estão lá — só que a disciplina saiu
         * espalhada em vez de geminada. Sem este campo a perda chegaria à tela
         * como um sucesso comum, que é exatamente como ela vinha passando.
         */
        geminacoesQuebradas: GeminacaoQuebrada[];
    }
    | { tipo: 'falha'; tentativas: number; erro: string; diagnostico?: any; aulasParciais: any[]; pesos: Record<string, number> }
    | { tipo: 'cancelado'; tentativas: number; aulasParciais: any[] };

/** Frase pronta sobre as geminações perdidas, para log e para a tela. */
function descreverGeminacoes(quebradas: GeminacaoQuebrada[]): string {
    return quebradas
        .map(g => `${g.turma_nome}/${g.componente_nome} (${g.tamanho}x)`)
        .join(', ');
}

async function executarJob(job: GeracaoJob): Promise<void> {
    const inep = await inepDaEscola(job.escola_id);
    const { nome, configGerminacao, permitirMesmoProfDisciplinasMesmoDia } = job.config;
    const isMulti = job.turno_ids.length > 1;

    registrarLog(
        inep,
        `JOB INICIADO | id=${job.id} | "${nome}" | ${job.turno_ids.length} turno(s) | ` +
            `orcamento=${job.orcamento} | ${NUM_WORKERS} thread(s) | rodada mirando ${ALVO_RODADA_MS}ms`
    );

    // Grades salvas como pré-produção durante a execução: elas existem para que o
    // turno seguinte enxergue as ocupações do anterior, e viram rascunho no fim —
    // inclusive quando o job é cancelado no meio, porque são grades válidas.
    const idsPreProducao: string[] = [];
    const turnosConcluidos: string[] = [];
    let tentativasAcumuladas = 0;
    let ultimaFalha: { erro: string; diagnostico?: any } | null = null;
    /**
     * Turnos que fecharam a grade mas não cumpriram alguma geminação pedida.
     *
     * Sobe até a mensagem final do job porque não há outro lugar onde o usuário
     * veria isso: a grade está completa, não há pendência, não há diagnóstico de
     * falha — e a disciplina que ele mandou geminar saiu espalhada pela semana.
     */
    const avisosGeminacao: string[] = [];

    for (const [indice, turnoId] of job.turno_ids.entries()) {
        const dados = await carregarDadosDaGeracao(job.escola_id, turnoId, ['publicado', 'pre_producao']);
        const turno = dados.turnoData as Turno;

        registrarLog(
            inep,
            `TURNO INICIADO | job=${job.id} | "${turno.nome}" (${turnoId}) | ` +
                `turmas=${dados.turmasDoTurno.length} | professores=${dados.allProfessores.length} | ` +
                `ocupacoes_externas=${dados.ocupacoes.length} | aulas_fixas=${dados.aulasFixas.length} | ` +
                `geminacao=${configGerminacao.filter(c => c.geminar).length} disciplina(s) | ` +
                `mesmo_prof_disciplinas_mesmo_dia=${permitirMesmoProfDisciplinasMesmoDia ? 'permitido' : 'bloqueado'}`
        );

        const resultado = await gerarTurno({
            job,
            inep,
            turno,
            dados,
            configGerminacao,
            permitirMesmoProfDisciplinasMesmoDia,
            turnosConcluidos: indice,
        });

        tentativasAcumuladas += resultado.tentativas;

        /**
         * Guarda o aprendizado deste turno.
         *
         * Cancelamento não grava: a busca parou no meio e a grade dali não
         * representa o que ela teria alcançado. Falha grava — uma grade com 3
         * pendências é um ponto de partida excelente para a próxima tentativa,
         * muito melhor do que começar do zero de novo.
         */
        if (resultado.tipo !== 'cancelado') {
            const grade = resultado.tipo === 'sucesso' ? resultado.aulas : resultado.aulasParciais;
            const pendentes = resultado.tipo === 'sucesso'
                ? 0
                : Math.max(0, (resultado.diagnostico?.pendenciasDetalhadas?.length ?? 0));

            await gravarMemoria({
                escolaId: job.escola_id,
                turnoId,
                impressao: dados.impressao,
                grade,
                pendentes,
                pesos: resultado.pesos,
            }).catch(err => console.error('[geracao] falha ao gravar a memoria do turno:', err));

            // O perfil agregado da rede só aprende com grade que fechou: grade com
            // buraco não é exemplo de nada.
            if (resultado.tipo === 'sucesso') {
                const siglas = new Map<string, string>();
                for (const t of dados.turmasDoTurno) {
                    for (const c of t.serie?.componentes || []) {
                        const sigla = c.componente?.sigla;
                        if (sigla) siglas.set(c.componente_id, sigla);
                    }
                }
                await registrarPadroes(grade, siglas)
                    .catch(err => console.error('[geracao] falha ao registrar padroes da rede:', err));
            }
        }

        if (resultado.tipo === 'cancelado') {
            registrarLog(inep, `JOB CANCELADO | id=${job.id} | durante "${turno.nome}" | ${tentativasAcumuladas} tentativa(s)`);
            await registrarParcial(job.id, turnoId, turno.nome, resultado.aulasParciais);
            await converterPreProducao(idsPreProducao);
            await finalizarJob(job.id, 'cancelado', {
                erro: turnosConcluidos.length > 0
                    ? `Geração interrompida. Turnos já concluídos e salvos: ${turnosConcluidos.join(', ')}.`
                    : 'Geração interrompida antes de qualquer turno ser concluído.',
            });
            return;
        }

        if (resultado.tipo === 'falha') {
            /**
             * Antes de devolver a falha, tenta PROVAR que a grade é impossível.
             *
             * Sem isto a tela só sabe dizer "não consegui", e o operador não tem
             * como distinguir um cadastro inviável de uma busca azarada — foi
             * exatamente essa dúvida que apareceu na escola 17032717, onde a grade
             * era possível o tempo todo. Roda uma vez, no fim, e é barato.
             */
            let certificado;
            try {
                certificado = certificar(dados);
                registrarLog(
                    inep,
                    `CERTIFICADO | job=${job.id} | "${turno.nome}" | ${certificado.veredito}` +
                        (certificado.causas.length ? ` | ${certificado.causas.map(c => c.titulo).join(' ; ')}` : '')
                );
            } catch (err) {
                console.error('[geracao] falha ao certificar a inviabilidade:', err);
            }

            const diagnosticoComCertificado = certificado
                ? { ...(resultado.diagnostico ?? { causasIdentificadas: [], pendenciasDetalhadas: [] }), certificado }
                : resultado.diagnostico;

            ultimaFalha = { erro: resultado.erro, diagnostico: diagnosticoComCertificado };
            // Guarda a melhor tentativa para o botão "Forçar Salvamento" da tela.
            await registrarParcial(job.id, turnoId, turno.nome, resultado.aulasParciais);
            registrarLog(
                inep,
                `TURNO SEM SOLUCAO | job=${job.id} | "${turno.nome}" | ${resultado.tentativas} tentativa(s) | ` +
                    `${resultado.aulasParciais.length} aulas alocadas na melhor tentativa`
            );
            // Um turno que não fecha não impede os demais: numa geração de vários
            // turnos, entregar 3 de 4 grades é melhor do que não entregar nenhuma.
            continue;
        }

        const nomeFinal = isMulti ? `${nome} - ${turno.nome}` : nome;
        const statusSalvar = isMulti ? 'pre_producao' : 'em_rascunho';
        const salvo = await salvarGrade(job.escola_id, turnoId, nomeFinal, resultado.aulas, statusSalvar, inep);

        if (salvo.error) {
            ultimaFalha = { erro: `Turno "${turno.nome}": ${salvo.error}` };
            registrarLog(inep, `TURNO NAO SALVO | job=${job.id} | "${turno.nome}" | ${salvo.error}`);
            continue;
        }

        turnosConcluidos.push(turno.nome);
        if (salvo.data?.id) {
            await registrarHorarioGerado(job.id, salvo.data.id);
            if (isMulti) idsPreProducao.push(salvo.data.id);
        }
        if (resultado.geminacoesQuebradas.length > 0) {
            avisosGeminacao.push(
                `No turno "${turno.nome}", ${resultado.geminacoesQuebradas.length} geminação(ões) ` +
                    `não couberam e as aulas ficaram separadas: ` +
                    `${descreverGeminacoes(resultado.geminacoesQuebradas)}.`
            );
        }

        registrarLog(
            inep,
            `TURNO OK | job=${job.id} | "${turno.nome}" | grade fechada com ${resultado.aulas.length} aulas ` +
                `em ${resultado.tentativas} tentativa(s)` +
                (resultado.geminacoesQuebradas.length
                    ? ` | ATENCAO: ${resultado.geminacoesQuebradas.length} geminacao(oes) nao cumprida(s)`
                    : '')
        );
    }

    const erroConversao = (await converterPreProducao(idsPreProducao)).error;
    if (erroConversao) registrarLog(inep, `JOB AVISO | id=${job.id} | ${erroConversao}`);

    if (turnosConcluidos.length === 0) {
        await finalizarJob(job.id, 'falhou', {
            erro: ultimaFalha?.erro ?? 'Não foi possível fechar nenhuma grade.',
            diagnostico: ultimaFalha?.diagnostico,
        });
        registrarLog(inep, `JOB FALHOU | id=${job.id} | ${tentativasAcumuladas} tentativa(s) | nenhuma grade fechada`);
        return;
    }

    // Numa geração multi-turno em que parte dos turnos falhou, o desfecho é
    // "concluído", mas o motivo da falha parcial não pode sumir da tela. O mesmo
    // vale para a geminação que não coube: a grade fechou, e é justamente por
    // isso que o aviso precisa vir junto — não haveria outro sinal.
    const partesDaMensagem = [
        turnosConcluidos.length < job.turno_ids.length
            ? `Grades geradas: ${turnosConcluidos.join(', ')}. ${ultimaFalha?.erro ?? ''}`.trim()
            : '',
        ...avisosGeminacao,
    ].filter(Boolean);

    await finalizarJob(job.id, 'concluido', {
        erro: partesDaMensagem.length > 0 ? partesDaMensagem.join(' ') : null,
        diagnostico: ultimaFalha?.diagnostico,
    });
    registrarLog(
        inep,
        `JOB CONCLUIDO | id=${job.id} | ${turnosConcluidos.length}/${job.turno_ids.length} turno(s) | ` +
            `${tentativasAcumuladas} tentativa(s)`
    );
}

/**
 * Gera um turno, rodada a rodada.
 *
 * Cada rodada despacha `NUM_WORKERS` pedaços de `CHUNK` tentativas em faixas de
 * índice disjuntas e consecutivas, todos na mesma fase de relaxamento. É aqui
 * que estão os 6x de ganho: antes, das threads do pool só uma trabalhava.
 */
async function gerarTurno(ctx: {
    job: GeracaoJob;
    inep: string;
    turno: Turno;
    dados: Awaited<ReturnType<typeof carregarDadosDaGeracao>>;
    configGerminacao: GeracaoJob['config']['configGerminacao'];
    permitirMesmoProfDisciplinasMesmoDia: boolean;
    turnosConcluidos: number;
}): Promise<ResultadoTurno> {
    const { job, inep, turno, dados } = ctx;
    const orcamento = job.orcamento;

    let melhorGlobal = Number.POSITIVE_INFINITY;
    let melhorAulas: any[] = [];
    /**
     * Geminações que a melhor grade conhecida deixou de cumprir.
     *
     * Anda junto de `melhorAulas` porque é uma propriedade DAQUELA grade, não da
     * busca: trocar a grade sem trocar este número faria a tela descrever a
     * geminação de uma grade que já foi substituída.
     */
    let melhorGeminacoes: GeminacaoQuebrada[] = [];
    /**
     * Pesos aprendidos, somados entre as threads a cada rodada.
     *
     * É a memória da busca dentro deste turno: quantas vezes cada aula ficou de
     * fora. Redistribuída no começo da rodada seguinte, ela faz as quatro threads
     * concordarem sobre onde está o gargalo em vez de cada uma redescobri-lo.
     */
    let pesosGlobais: Record<string, number> = {};
    let offset = 0;
    const inicioTurno = Date.now();

    /**
     * Warm start: a busca começa de onde a geração anterior parou.
     *
     * Com o cadastro inalterado, a grade guardada vale inteira e o turno fecha em
     * segundos. Com o cadastro alterado — que é o caso comum, mexer num professor
     * e gerar de novo — ela entra do mesmo jeito: o motor revalida aula por aula
     * na semeadura, mantém o que continua legal e recoloca o resto. Reparar é
     * muito mais barato do que redescobrir.
     *
     * `pendentes` só é herdado junto quando a grade ainda corresponde ao cadastro;
     * senão o custo real é desconhecido e deixá-lo em aberto evita que uma grade
     * velha seja tratada como boa e bloqueie uma melhor.
     */
    if (dados.memoria && dados.memoria.grade.length > 0) {
        melhorAulas = dados.memoria.grade;
        pesosGlobais = { ...dados.memoria.pesos };
        if (dados.memoria.atual) melhorGlobal = dados.memoria.pendentes;

        registrarLog(
            inep,
            `MEMORIA | job=${job.id} | "${turno.nome}" | ${dados.memoria.grade.length} aula(s) de ` +
                `${dados.memoria.geracoes} geracao(oes) anteriores | cadastro ` +
                `${dados.memoria.atual ? 'inalterado (grade vale inteira)' : 'alterado (grade sera reparada)'}`
        );
    }
    /** Momento da última vez que `melhorGlobal` caiu. Base da parada por estagnação. */
    let ultimaMelhora = Date.now();
    let erroFinal = 'Algumas aulas não puderam ser alocadas devido a conflitos de professores ou restrições de horários.';
    let chunkAtual = CHUNK_INICIAL;
    let cancelamentoPedido = false;

    /**
     * Pulso de vida, independente das rodadas.
     *
     * Amarrar o heartbeat ao fim da rodada foi um erro que só apareceu ao medir:
     * numa escola com 22 turmas uma rodada de 100 tentativas levou 70 SEGUNDOS,
     * a um passo do limite de 90s que marca o job como órfão — o job seria
     * declarado morto estando vivo. Aqui o pulso é por relógio, não por trabalho
     * concluído, e o cancelamento é percebido dentro de um pulso mesmo que a
     * rodada demore.
     */
    const pulso = setInterval(() => {
        void atualizarProgresso(job.id, {
            tentativas: offset,
            turnoAtualId: turno.id,
            turnoAtualNome: turno.nome,
            turnosConcluidos: ctx.turnosConcluidos,
            melhorPendentes: Number.isFinite(melhorGlobal) ? melhorGlobal : null,
        })
            .then(r => { if (r.cancelamentoSolicitado) cancelamentoPedido = true; })
            .catch(err => console.error('[geracao] pulso falhou:', err));
    }, PULSO_MS);

    try {
        while (offset < orcamento) {
            const tentativasDaRodada = Math.min(NUM_WORKERS * chunkAtual, orcamento - offset);
            const pedacos: number[] = [];
            for (let inicio = offset; inicio < offset + tentativasDaRodada; inicio += chunkAtual) {
                pedacos.push(inicio);
            }

            const inicioRodada = Date.now();

            const resultados = await Promise.all(
                pedacos.map((inicio, i) =>
                    gerarHorarioEmWorker(
                        [
                            dados.turnoData as any,
                            dados.turmasDoTurno,
                            dados.allProfessores,
                            dados.allTurnos,
                            ctx.configGerminacao,
                            false,
                            dados.ocupacoes,
                            Math.min(chunkAtual, offset + tentativasDaRodada - inicio),
                            inicio,
                            dados.aulasFixas,
                            ctx.permitirMesmoProfDisciplinasMesmoDia,
                            orcamento,
                            // Nenhuma rodada calcula diagnóstico: ele sai de uma
                            // execução dirigida, no fim, sobre a tentativa vencedora.
                            false,
                            // As threads deixam de ser ilhas. Cada uma recebe a melhor
                            // grade que qualquer uma delas já encontrou e os pesos
                            // somados de todas — e volta a melhorar a partir dali, em
                            // vez de recomeçar do zero numa faixa de sementes própria.
                            melhorAulas.length > 0 ? melhorAulas : null,
                            pesosGlobais,
                            melhorGlobal,
                            dados.padroes,
                        ],
                        // Um pedaço só por rodada escreve no log.txt: várias threads
                        // despejando a saída do motor em paralelo tornariam o arquivo
                        // ilegível e ainda embaralhariam as linhas entre si.
                        i === 0 && deveRegistrarSaidaDoMotor(offset) ? (linhas) => registrarLogs(inep, linhas) : undefined
                    )
                )
            );

            const duracaoRodada = Date.now() - inicioRodada;
            offset += tentativasDaRodada;

            /**
             * Vence o pedaço de menor offset — com várias threads achando soluções
             * na mesma rodada, escolher pelo índice mantém o resultado
             * reproduzível. Entre as que fecharam, porém, uma grade com a
             * geminação inteira vale mais do que uma sem: as duas têm zero
             * pendências, e sem este critério a escolha entre elas era o acaso da
             * ordem das threads.
             */
            const fechados = resultados
                .map((r, i) => ({ r, i }))
                .filter(({ r }) => r.success);

            if (fechados.length > 0) {
                const vencedor = fechados.reduce((a, b) =>
                    b.r.geminacoesQuebradas.length < a.r.geminacoesQuebradas.length ? b : a
                );
                const r = vencedor.r;

                if (r.geminacoesQuebradas.length > 0) {
                    registrarLog(
                        inep,
                        `GEMINACAO NAO CUMPRIDA | job=${job.id} | "${turno.nome}" | grade fechada sem ` +
                            `${r.geminacoesQuebradas.length} geminacao(oes): ${descreverGeminacoes(r.geminacoesQuebradas)}`
                    );
                }

                return {
                    tipo: 'sucesso',
                    aulas: r.aulas,
                    tentativas: pedacos[vencedor.i] + r.attemptsMade,
                    pesos: pesosGlobais,
                    geminacoesQuebradas: r.geminacoesQuebradas,
                };
            }

            // Somar os pesos das quatro threads antes de redistribuí-los: cada uma
            // penalizou os blocos que a atrapalharam, e a soma é o retrato de onde o
            // gargalo está de verdade.
            for (const r of resultados) {
                for (const [chave, peso] of Object.entries(r.pesos ?? {})) {
                    pesosGlobais[chave] = (pesosGlobais[chave] ?? 0) + peso;
                }
            }

            // Vence o pedaço de menor offset entre os empatados, para o resultado
            // não depender da ordem em que as threads terminaram.
            const maisPerto = resultados.reduce((a, b) => (b.melhorPendentes < a.melhorPendentes ? b : a));
            if (maisPerto.melhorPendentes < melhorGlobal) {
                melhorGlobal = maisPerto.melhorPendentes;
                melhorAulas = maisPerto.aulas;
                melhorGeminacoes = maisPerto.geminacoesQuebradas;
                ultimaMelhora = Date.now();
            } else if (maisPerto.melhorPendentes === melhorGlobal && maisPerto.aulas.length > 0) {
                /**
                 * Empate em pendências: adota a grade mesmo assim. São arranjos
                 * diferentes com o mesmo custo, e trocar de um para outro é o que
                 * faz a busca andar pelo platô em vez de remoer a mesma
                 * configuração.
                 *
                 * A exceção é a geminação: trocar por um arranjo que cumpre MENOS
                 * geminações não é andar pelo platô, é descer. Dentro de um pedaço
                 * o motor já sabe disso (ver `custoDe`); aqui, entre pedaços, o
                 * critério precisa ser repetido.
                 */
                if (maisPerto.geminacoesQuebradas.length <= melhorGeminacoes.length) {
                    melhorAulas = maisPerto.aulas;
                    melhorGeminacoes = maisPerto.geminacoesQuebradas;
                }
            }
            if (maisPerto.error) erroFinal = maisPerto.error;

            // `tentativas` é o progresso DO TURNO ATUAL: é o que a barra da tela
            // compara com o orçamento. O andamento entre turnos vai em
            // `turnos_concluidos`, e o total da execução fica no log.
            const { cancelamentoSolicitado } = await atualizarProgresso(job.id, {
                tentativas: offset,
                turnoAtualId: turno.id,
                turnoAtualNome: turno.nome,
                turnosConcluidos: ctx.turnosConcluidos,
                melhorPendentes: Number.isFinite(melhorGlobal) ? melhorGlobal : null,
            });

            if (process.env.NODE_ENV !== 'production' || process.env.TIMETABLE_DEBUG === '1') {
                console.log(
                    `[GERADOR] rodada ${offset}/${orcamento} (${turno.nome}): ${pedacos.length} thread(s) x ` +
                        `${chunkAtual} tentativas em ${duracaoRodada}ms | pendentes=${melhorGlobal}`
                );
            }

            // A melhor tentativa vai junto: quem interrompe uma geração longa não
            // deve perder a grade mais completa que ela chegou a montar.
            if (cancelamentoSolicitado || cancelamentoPedido) {
                return { tipo: 'cancelado', tentativas: offset, aulasParciais: melhorAulas };
            }

            /**
             * Ajuste do tamanho do pedaço.
             *
             * O custo de uma tentativa varia em duas ordens de grandeza entre escolas
             * — medido: de menos de 1ms a ~700ms com as seis threads disputando a
             * máquina. Com um tamanho fixo, a mesma configuração ou atualizava a tela
             * dez vezes por segundo (escola pequena) ou a deixava congelada por mais
             * de um minuto (escola grande, o que também atrasava o cancelamento).
             * Mirar um tempo de rodada mantém as duas pontas utilizáveis.
             *
             * O fator é limitado a 4x por rodada para o tamanho convergir sem oscilar.
             */
            const fator = Math.max(0.25, Math.min(4, ALVO_RODADA_MS / Math.max(duracaoRodada, 1)));
            chunkAtual = Math.max(CHUNK_MIN, Math.min(CHUNK_MAX, Math.round(chunkAtual * fator)));

            const decorrido = Date.now() - inicioTurno;
            const semMelhora = Date.now() - ultimaMelhora;
            const progresso = offset / orcamento;

            if (decorrido >= TEMPO_MAX_TURNO_MS) {
                registrarLog(
                    inep,
                    `TURNO NO TETO DE TEMPO | job=${job.id} | "${turno.nome}" | ` +
                        `${Math.round(decorrido / 60000)} min | ${offset} tentativa(s) | ` +
                        `parou com ${melhorGlobal} bloco(s) pendente(s)`
                );
                break;
            }

            if (progresso > PLATEAU_ARMA_APOS && semMelhora >= ESTAGNACAO_MS) {
                registrarLog(
                    inep,
                    `TURNO ESTAGNADO | job=${job.id} | "${turno.nome}" | ${offset} tentativa(s) | ` +
                        `${Math.round(semMelhora / 60000)} min sem reduzir os ${melhorGlobal} ` +
                        `bloco(s) pendente(s) — encerrando`
                );
                break;
            }
        }

        /**
         * Diagnóstico da grade que o usuário vai ver, e de nenhuma outra.
         *
         * Uma execução dirigida: um pedaço de UMA tentativa, recebendo a melhor
         * grade encontrada. Nesse modo o motor apenas semeia essa grade e analisa
         * o que faltou nela — não explora nem desmonta. Grade e pendências saem
         * juntas da mesma execução, que é a única forma de a lista bater com as
         * células vazias.
         *
         * Antes o diagnóstico vinha de uma tentativa de descarte à parte. Numa
         * geração real da escola 17032717 a grade tinha 9 células vazias e a
         * lista trazia 18 pendências, seis delas numa turma cujo horário havia
         * fechado por completo. Depois passou a repetir a semente vencedora — o
         * que deixou de funcionar quando a busca virou incremental, porque agora o
         * resultado depende da grade herdada, não só da semente.
         */
        let diagnosticoFinal: any = undefined;
        if (melhorAulas.length > 0 && !cancelamentoPedido) {
            const doVencedor = await gerarHorarioEmWorker(
                [
                    dados.turnoData as any, dados.turmasDoTurno, dados.allProfessores, dados.allTurnos,
                    ctx.configGerminacao, false, dados.ocupacoes,
                    1, offset, dados.aulasFixas, ctx.permitirMesmoProfDisciplinasMesmoDia,
                    orcamento, true,
                    melhorAulas, pesosGlobais, melhorGlobal, dados.padroes,
                ],
                (linhas) => registrarLogs(inep, linhas)
            );

            // Pode acontecer: a semeadura recoloca as pendências num arranjo que a
            // busca não tinha visitado. Grade fechada vale mais que relatório.
            if (doVencedor.success) {
                if (doVencedor.geminacoesQuebradas.length > 0) {
                    registrarLog(
                        inep,
                        `GEMINACAO NAO CUMPRIDA | job=${job.id} | "${turno.nome}" | grade fechada sem ` +
                            `${doVencedor.geminacoesQuebradas.length} geminacao(oes): ` +
                            descreverGeminacoes(doVencedor.geminacoesQuebradas)
                    );
                }
                return {
                    tipo: 'sucesso',
                    aulas: doVencedor.aulas,
                    tentativas: offset,
                    pesos: pesosGlobais,
                    geminacoesQuebradas: doVencedor.geminacoesQuebradas,
                };
            }

            diagnosticoFinal = doVencedor.diagnostico;
            melhorAulas = doVencedor.aulas;
            melhorGeminacoes = doVencedor.geminacoesQuebradas;
            if (doVencedor.error) erroFinal = doVencedor.error;

            registrarLog(
                inep,
                `DIAGNOSTICO | job=${job.id} | "${turno.nome}" | ${melhorAulas.length} aula(s) | ` +
                    `${diagnosticoFinal?.pendenciasDetalhadas?.length ?? 0} pendencia(s)` +
                    (melhorGeminacoes.length
                        ? ` | ${melhorGeminacoes.length} geminacao(oes) nao cumprida(s): ${descreverGeminacoes(melhorGeminacoes)}`
                        : '')
            );
        }

        return {
            tipo: 'falha',
            tentativas: offset,
            erro: erroFinal,
            diagnostico: diagnosticoFinal,
            aulasParciais: melhorAulas,
            pesos: pesosGlobais,
        };
    } finally {
        clearInterval(pulso);
    }
}

/**
 * Decide se a saída do motor entra no log.txt nesta rodada.
 *
 * O motor fala bastante durante a busca (reparos, avisos das aulas travadas) e
 * repete as mesmas linhas rodada após rodada. Gravá-las centenas de vezes só
 * consome a rotação do arquivo e esconde o que interessa. Por padrão registra-se
 * a primeira rodada; `SHETO_LOG_MOTOR_TODOS_LOTES=1` força o registro de todas
 * quando se está caçando algo que muda com a progressão do relaxamento.
 *
 * O diagnóstico propriamente dito não passa por aqui: ele sai da execução
 * dirigida sobre a tentativa vencedora, no fim do turno, e é sempre registrado.
 */
function deveRegistrarSaidaDoMotor(offset: number): boolean {
    if (process.env.SHETO_LOG_MOTOR_TODOS_LOTES === '1') return true;
    return offset === 0;
}
