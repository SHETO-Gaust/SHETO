/**
 * Worker de geração de horário.
 *
 * `gerarHorarioAlgoritmico` é síncrona e roda por centenas de milhares de
 * iterações. Chamada na thread principal, ela congela o event loop do Node —
 * o processo para de atender qualquer requisição, inclusive o login, até
 * terminar. Aqui ela roda numa thread separada e a principal fica livre.
 *
 * Este arquivo NÃO é bundlado pelo Next. Ele é compilado à parte por
 * `tsconfig.worker.json` (script `npm run build:worker`, encadeado no `build`
 * e no `dev`) e carregado em runtime por caminho absoluto pelo
 * `timetabling-pool.ts`.
 *
 * Isso só funciona porque `timetabling.ts` importa apenas tipos de `./types`
 * — depois de compilado ele não tem nenhuma dependência de runtime. Se um dia
 * alguém adicionar um import de valor lá (um `@/lib/...` qualquer), a
 * compilação isolada quebra e será preciso um bundler de verdade.
 */

import { parentPort } from 'worker_threads';
import { inspect } from 'util';
import { gerarHorarioAlgoritmico } from './timetabling';

export type PedidoGeracao = {
  jobId: number;
  args: Parameters<typeof gerarHorarioAlgoritmico>;
};

export type RespostaGeracao =
  | { jobId: number; ok: true; resultado: ReturnType<typeof gerarHorarioAlgoritmico>; logs: string[] }
  | { jobId: number; ok: false; erro: string; logs: string[] };

/**
 * Captura o que o motor imprime durante um lote.
 *
 * `timetabling.ts` documenta a falha com dezenas de `console.log` (capacidade da
 * turma, bloqueio predominante por bloco pendente, etc.) — é o melhor material
 * de diagnóstico que existe no sistema. Rodando aqui dentro, isso ia parar no
 * stdout do processo pai, entrelaçado com o de todas as outras requisições.
 * Devolvendo as linhas junto da resposta, quem chamou grava tudo no log.txt
 * atribuído ao INEP certo.
 *
 * Em produção o `console.log` do motor deixa de ir para o stdout: o pool liga o
 * TIMETABLE_DEBUG nesta thread, e ecoar tudo encheria o log do pm2 com centenas
 * de linhas por lote sem nenhum ganho — o destino desse material é o log.txt.
 * Aviso e erro continuam ecoando, e em desenvolvimento nada muda: o terminal
 * segue mostrando o diagnóstico como sempre mostrou.
 */
function executarCapturandoConsole<T>(fn: () => T): { valor?: T; erro?: unknown; logs: string[] } {
  const logs: string[] = [];
  const originais = { log: console.log, warn: console.warn, error: console.error };
  const emProducao = process.env.NODE_ENV === 'production';

  const formatar = (args: unknown[]) =>
    args.map((a) => (typeof a === 'string' ? a : inspect(a, { depth: 3 }))).join(' ');

  const instalar = (nivel: 'log' | 'warn' | 'error', rotulo: string, ecoar: boolean) => {
    console[nivel] = (...args: unknown[]) => {
      logs.push(rotulo + formatar(args));
      if (ecoar) originais[nivel](...args);
    };
  };

  instalar('log', '', !emProducao);
  instalar('warn', 'AVISO: ', true);
  instalar('error', 'ERRO: ', true);

  try {
    return { valor: fn(), logs };
  } catch (erro) {
    return { erro, logs };
  } finally {
    console.log = originais.log;
    console.warn = originais.warn;
    console.error = originais.error;
  }
}

if (!parentPort) {
  throw new Error('timetabling.worker deve ser carregado como worker_thread, não como script solto.');
}

const porta = parentPort;

porta.on('message', (pedido: PedidoGeracao) => {
  const { valor, erro, logs } = executarCapturandoConsole(() => gerarHorarioAlgoritmico(...pedido.args));

  if (erro !== undefined) {
    // Um erro aqui não pode derrubar o worker: ele é reaproveitado entre jobs.
    // O stack vai junto dos logs — a mensagem sozinha raramente localiza a linha.
    if (erro instanceof Error && erro.stack) logs.push(`ERRO: ${erro.stack}`);
    porta.postMessage({
      jobId: pedido.jobId,
      ok: false,
      erro: erro instanceof Error ? erro.message : String(erro),
      logs,
    } satisfies RespostaGeracao);
    return;
  }

  porta.postMessage({
    jobId: pedido.jobId,
    ok: true,
    resultado: valor as ReturnType<typeof gerarHorarioAlgoritmico>,
    logs,
  } satisfies RespostaGeracao);
});
