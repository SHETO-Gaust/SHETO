/**
 * Pool de worker threads para a geração de horário.
 *
 * Motivo: `gerarHorarioAlgoritmico` é CPU-bound e síncrona. Enquanto ela roda
 * na thread principal, o Node não atende mais ninguém — foi o que derrubou a
 * produção. Aqui cada geração vai para uma thread separada.
 *
 * Os workers são reaproveitados entre chamadas de propósito: o orquestrador da
 * geração despacha centenas de rodadas seguidas, e criar uma thread por rodada
 * desperdiçaria dezenas de milissegundos em cada uma. O pool é um singleton em
 * `globalThis` pelo mesmo motivo do pool do Postgres: sobreviver ao hot-reload
 * do Next em desenvolvimento.
 *
 * Requer `npm run build:worker` (já encadeado no `build` e no `dev`).
 */

import os from 'os';
import path from 'path';
import { existsSync, statSync } from 'fs';
import { Worker } from 'worker_threads';
import type { gerarHorarioAlgoritmico } from './timetabling';

type ArgsGeracao = Parameters<typeof gerarHorarioAlgoritmico>;
type ResultadoGeracao = ReturnType<typeof gerarHorarioAlgoritmico>;

/** Recebe a saída que o motor imprimiu durante o lote, para quem chamou gravar no log.txt. */
export type AoReceberLogs = (linhas: string[]) => void;

type Job = {
  jobId: number;
  args: ArgsGeracao;
  resolve: (r: ResultadoGeracao) => void;
  reject: (e: Error) => void;
  onLog?: AoReceberLogs;
  timer?: NodeJS.Timeout;
};

/**
 * Deixa ao menos 2 núcleos livres: um para a thread principal do Next atender
 * requisições e outro para o Postgres, que roda na mesma VM. Ajustável por
 * SHETO_WORKERS quando o dimensionamento da máquina mudar.
 *
 * O teto era 4, herdado da época em que a tela despachava um lote por vez e
 * três destas threads ficavam paradas de qualquer jeito. Agora o orquestrador
 * despacha uma rodada por thread, então o teto é o que de fato dimensiona a
 * geração: na VM de 8 vCPU são 6 threads gerando e 2 núcleos livres.
 *
 * ATENÇÃO ao esperar ganho proporcional: NÃO é linear. Medido em máquina de 8
 * CPUs lógicas, 1.200 tentativas da mesma escola:
 *
 *     1 thread  32,9s   |   3 threads  14,6s (2,25x)
 *     2 threads 18,5s   |   4 threads  13,5s (2,44x)
 *                       |   6 threads  12,8s (2,57x)
 *
 * A curva satura por volta de 3–4 threads: o motor aloca muito por tentativa e
 * passa a disputar memória e GC, não CPU. Da quarta thread em diante o ganho é
 * de poucos por cento — se a máquina precisar de fôlego para atender as telas,
 * baixar SHETO_WORKERS para 4 custa quase nada em tempo de geração.
 */
export const NUM_WORKERS = Number(process.env.SHETO_WORKERS) || Math.max(1, Math.min(6, os.cpus().length - 2));

/**
 * Um lote que não termina seguraria um worker para sempre. O limite é
 * folgado de propósito — só existe para evitar vazamento, não para
 * interromper geração legítima.
 */
const TIMEOUT_MS = Number(process.env.SHETO_WORKER_TIMEOUT_MS) || 10 * 60 * 1000;

/**
 * Teto de heap por worker.
 *
 * Sem `resourceLimits` o worker compartilha os limites do processo, e um estouro
 * de memória durante a geração aborta o processo INTEIRO — o Next morre no meio
 * do lote, todo mundo é deslogado e só o pm2 levanta de novo. Com o limite
 * declarado, o mesmo estouro vira um evento 'error' neste worker: o job é
 * rejeitado com mensagem, os outros usuários nem percebem.
 */
const HEAP_MB = Number(process.env.SHETO_WORKER_HEAP_MB) || 1024;

function caminhoDoWorker(): string {
  const p = process.env.SHETO_WORKER_PATH
    ? path.resolve(process.env.SHETO_WORKER_PATH)
    : path.join(process.cwd(), 'workers', 'timetabling.worker.js');

  if (!existsSync(p)) {
    throw new Error(
      `Worker de geração de horário não encontrado em ${p}. ` +
        'Rode "npm run build:worker" (o "npm run build" já faz isso). ' +
        'Se o pm2 sobe o app de outro diretório, aponte SHETO_WORKER_PATH para o arquivo.'
    );
  }
  return p;
}

/**
 * Assinatura do build do worker: a data de modificacao do .js compilado.
 *
 * Existe por uma falha silenciosa que custou uma rodada de teste inteira. Os
 * workers sao threads longas — o pool os mantem vivos entre geracoes de
 * proposito — e cada thread carrega o `workers/timetabling.worker.js` do
 * instante em que foi criada. Alem disso o pool mora em `global`, para
 * sobreviver ao Fast Refresh. Resultado, em desenvolvimento: recompilar o motor
 * NAO troca o motor que esta rodando. O servidor devolvia grades do codigo de
 * ontem enquanto o arquivo em disco ja era outro, e nada na tela dizia isso.
 *
 * Comparar a mtime a cada despacho e barato perto de uma geracao, e transforma
 * "recompilei e nada mudou" num worker novo em vez de um diagnostico perdido.
 */
function assinaturaDoBuild(): number {
  try {
    return statSync(caminhoDoWorker()).mtimeMs;
  } catch {
    return 0;
  }
}

class TimetablingPool {
  private livres: Worker[] = [];
  private ocupados = new Set<Worker>();
  private fila: Job[] = [];
  private emExecucao = new Map<Worker, Job>();
  private proximoJobId = 1;

  /** Build que os workers atuais carregam. 0 = nenhum worker criado ainda. */
  private assinatura = 0;

  /**
   * Workers de um build anterior que ainda estao no meio de um job. Nao podem
   * ser mortos agora — matariam o job — mas tambem nao voltam para `livres`.
   */
  private obsoletos = new Set<Worker>();

  /**
   * Aposenta os workers que carregam um build antigo do motor.
   *
   * Os ociosos morrem na hora; os ocupados terminam o job que ja comecaram e
   * morrem ao devolver. O proximo despacho cria threads com o codigo novo.
   */
  private recolherBuildAntigo() {
    const atual = assinaturaDoBuild();
    if (atual === 0 || atual === this.assinatura) return;

    if (this.assinatura !== 0) {
      console.log('[timetabling-pool] worker recompilado: aposentando as threads do build anterior.');
      for (const w of this.livres.splice(0)) void w.terminate();
      for (const w of this.ocupados) this.obsoletos.add(w);
    }
    this.assinatura = atual;
  }

  private criarWorker(): Worker {
    const worker = new Worker(caminhoDoWorker(), {
      resourceLimits: { maxOldGenerationSizeMb: HEAP_MB },
      /**
       * O motor silencia todo o seu diagnóstico quando NODE_ENV=production — e é
       * justamente em produção que alguém precisa saber POR QUE a grade não
       * fecha. Ligar a flag só aqui dentro mantém o resto do app silencioso: esta
       * saída é capturada pelo worker e vai para o log.txt, não para o stdout do pm2.
       */
      env: { ...process.env, TIMETABLE_DEBUG: '1' },
    });

    worker.on(
      'message',
      (resp: { jobId: number; ok: boolean; resultado?: ResultadoGeracao; erro?: string; logs?: string[] }) => {
        const job = this.emExecucao.get(worker);
        // Resposta atrasada de um job que já sofreu timeout: ignorar.
        if (!job || job.jobId !== resp.jobId) return;

        this.finalizar(worker, job);

        // Entregue antes de resolver/rejeitar: no caminho de erro é justamente o
        // diagnóstico do motor que explica a falha, e ele não pode se perder.
        if (job.onLog && resp.logs?.length) {
          try {
            job.onLog(resp.logs);
          } catch (err) {
            console.error('[timetabling-pool] falha ao entregar os logs do lote:', err);
          }
        }

        if (resp.ok) job.resolve(resp.resultado as ResultadoGeracao);
        else job.reject(new Error(resp.erro ?? 'Falha desconhecida na geração.'));
      }
    );

    // 'error' e 'exit' cobrem morte do worker (ex.: estouro de heap). O job em
    // voo precisa ser rejeitado, senão a requisição fica pendurada para sempre.
    const aoMorrer = (motivo: Error) => {
      const job = this.emExecucao.get(worker);
      // O log é o que sobra quando o erro chega ao navegador já redigido pelo Next.
      console.error(`[timetabling-pool] worker morreu${job ? ` com o job ${job.jobId} em execução` : ' ocioso'}:`, motivo);
      this.descartar(worker);
      if (job) {
        if (job.timer) clearTimeout(job.timer);
        job.reject(motivo);
      }
      this.despachar();
    };

    worker.on('error', (err) => {
      // ERR_WORKER_OUT_OF_MEMORY não diz nada a quem está na tela; traduzir aqui
      // evita que o operador procure o problema nos dados do horário.
      const semMemoria = (err as NodeJS.ErrnoException)?.code === 'ERR_WORKER_OUT_OF_MEMORY';
      aoMorrer(
        semMemoria
          ? new Error(
              `A geração excedeu o limite de ${HEAP_MB} MB de memória e foi interrompida. ` +
                'Reduza o número de tentativas por lote ou aumente SHETO_WORKER_HEAP_MB.'
            )
          : err
      );
    });
    worker.on('exit', (code) => {
      if (code !== 0) aoMorrer(new Error(`Worker de geração encerrou com código ${code}.`));
    });

    return worker;
  }

  /** Devolve o worker ao pool após um job concluído com sucesso ou com erro tratado. */
  private finalizar(worker: Worker, job: Job) {
    if (job.timer) clearTimeout(job.timer);
    this.emExecucao.delete(worker);
    this.ocupados.delete(worker);
    // Thread de um build anterior nao volta para a fila: ela terminou este job
    // com o codigo velho, e reusa-la seria repetir o problema.
    if (this.obsoletos.delete(worker)) void worker.terminate();
    else this.livres.push(worker);
    this.despachar();
  }

  /** Remove um worker morto ou travado do pool, sem devolvê-lo à lista de livres. */
  private descartar(worker: Worker) {
    this.emExecucao.delete(worker);
    this.ocupados.delete(worker);
    this.obsoletos.delete(worker);
    this.livres = this.livres.filter((w) => w !== worker);
  }

  /**
   * `despachar` roda tanto na Server Action quanto dentro dos handlers de evento
   * do worker ('message', 'exit'). No segundo caso um throw aqui seria uma
   * exceção não tratada — ou seja, o processo do Next inteiro cai. Por isso tudo
   * que pode estourar (criar a thread, clonar os argumentos) fica dentro de
   * try/catch e vira a rejeição do job correspondente.
   */
  private despachar() {
    this.recolherBuildAntigo();

    while (this.fila.length > 0) {
      let worker = this.livres.pop();

      if (!worker) {
        if (this.ocupados.size >= NUM_WORKERS) return; // pool cheio: o job espera na fila
        try {
          worker = this.criarWorker();
        } catch (err) {
          const job = this.fila.shift()!;
          job.reject(err instanceof Error ? err : new Error(String(err)));
          continue;
        }
      }

      const job = this.fila.shift()!;
      this.ocupados.add(worker);
      this.emExecucao.set(worker, job);

      job.timer = setTimeout(() => {
        const travado = worker!;
        this.descartar(travado);
        void travado.terminate();
        job.reject(new Error(`A geração excedeu ${Math.round(TIMEOUT_MS / 1000)}s e foi interrompida.`));
        this.despachar();
      }, TIMEOUT_MS);

      try {
        worker.postMessage({ jobId: job.jobId, args: job.args });
      } catch (err) {
        // DataCloneError: algum dado vindo do banco não atravessa a fronteira de
        // thread. O worker continua sadio, só este job morre — devolvê-lo à lista
        // de livres aqui (em vez de chamar finalizar) evita despachar de novo no
        // meio deste mesmo laço.
        if (job.timer) clearTimeout(job.timer);
        this.emExecucao.delete(worker);
        this.ocupados.delete(worker);
        this.livres.push(worker);
        job.reject(
          new Error(
            `Não foi possível enviar os dados para a thread de geração: ${err instanceof Error ? err.message : String(err)}`
          )
        );
      }
    }
  }

  executar(args: ArgsGeracao, onLog?: AoReceberLogs): Promise<ResultadoGeracao> {
    return new Promise<ResultadoGeracao>((resolve, reject) => {
      this.fila.push({ jobId: this.proximoJobId++, args, resolve, reject, onLog });
      this.despachar();
    });
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __shetoTimetablingPool: TimetablingPool | undefined;
}

function getPool(): TimetablingPool {
  if (!global.__shetoTimetablingPool) {
    global.__shetoTimetablingPool = new TimetablingPool();
  }
  return global.__shetoTimetablingPool;
}

/**
 * Mesmos argumentos de `gerarHorarioAlgoritmico`, porém assíncrona e fora da
 * thread principal. É esta função que as Server Actions devem chamar.
 *
 * `onLog` recebe tudo que o motor imprimiu durante o lote — inclusive quando ele
 * falha, caso em que o diagnóstico é a informação mais valiosa que existe.
 */
export function gerarHorarioEmWorker(args: ArgsGeracao, onLog?: AoReceberLogs): Promise<ResultadoGeracao> {
  return getPool().executar(args, onLog);
}
