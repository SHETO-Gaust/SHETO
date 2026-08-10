/**
 * Log em arquivo do motor de geração de horários.
 *
 * Por que existe: a geração roda em centenas de lotes, dentro de uma worker
 * thread, disparada por Server Action. Quando algo quebra no meio, o Next
 * redige a exceção antes de ela chegar ao navegador e o `console.log` do motor
 * se perde no stdout do pm2 misturado com o de todas as outras requisições.
 * Este arquivo é o rastro que sobrevive ao incidente.
 *
 * Formato de cada linha: `INEP | mensagem`. O INEP vem primeiro porque a
 * pergunta que se faz num incidente é sempre "o que aconteceu na escola X" —
 * assim um `findstr 17004977 log.txt` isola a geração inteira de uma unidade.
 * Mensagens de várias linhas (os diagnósticos do motor são assim) recebem o
 * prefixo em TODAS as linhas, senão o filtro por INEP cortaria o meio delas.
 */

import fs from 'fs';
import path from 'path';

/** Raiz do projeto por padrão; ajustável quando o pm2 sobe o app de outro diretório. */
const CAMINHO = process.env.SHETO_LOG_PATH
  ? path.resolve(process.env.SHETO_LOG_PATH)
  : path.join(process.cwd(), 'log.txt');

/**
 * O motor despeja um diagnóstico completo a cada lote que falha; sem teto, uma
 * geração difícil enche o disco da VM. Ao estourar, o arquivo vira `log.txt.1`
 * (que é sobrescrito) e um novo começa — sempre sobra pelo menos o incidente atual.
 */
const TAMANHO_MAX_BYTES = (Number(process.env.SHETO_LOG_MAX_MB) || 20) * 1024 * 1024;

/**
 * Appends encadeados num único Promise: duas Server Actions concorrentes
 * escrevendo ao mesmo tempo embaralhariam linhas no arquivo. Assíncrono de
 * propósito — `appendFileSync` bloquearia o event loop, exatamente o problema
 * que tirou a geração da thread principal.
 */
let fila: Promise<void> = Promise.resolve();

function agora(): string {
  const d = new Date();
  const p = (n: number, casas = 2) => String(n).padStart(casas, '0');
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`
  );
}

function montarLinhas(inep: string, mensagem: string): string {
  const carimbo = agora();
  return (
    mensagem
      .split('\n')
      .map((linha) => `${inep} | [${carimbo}] ${linha.trimEnd()}`)
      .join('\n') + '\n'
  );
}

async function rotacionarSeNecessario(): Promise<void> {
  try {
    const info = await fs.promises.stat(CAMINHO);
    if (info.size < TAMANHO_MAX_BYTES) return;
    await fs.promises.rename(CAMINHO, `${CAMINHO}.1`);
  } catch {
    // Arquivo ainda não existe (primeira escrita) ou rename falhou por corrida:
    // em nenhum dos casos vale perder a linha que está sendo gravada.
  }
}

/**
 * Grava uma mensagem. Nunca lança: um erro de escrita em log não pode derrubar
 * a geração de horário que ele deveria apenas observar.
 */
export function registrarLog(inep: string | number | null | undefined, mensagem: string): void {
  const prefixo = String(inep ?? 'sem-inep');
  const conteudo = montarLinhas(prefixo, mensagem);

  fila = fila
    .then(async () => {
      await rotacionarSeNecessario();
      await fs.promises.appendFile(CAMINHO, conteudo, 'utf8');
    })
    .catch((err) => {
      console.error('[log-geracao] falha ao gravar em', CAMINHO, err);
    });
}

/** Grava um bloco de mensagens (ex.: a saída inteira que o worker acumulou num lote). */
export function registrarLogs(inep: string | number | null | undefined, mensagens: string[]): void {
  if (mensagens.length === 0) return;
  registrarLog(inep, mensagens.join('\n'));
}

/** Caminho efetivo do arquivo — usado nas mensagens que orientam quem for investigar. */
export function caminhoDoLog(): string {
  return CAMINHO;
}
