/**
 * Cliente do Gemini para o chat de suporte.
 *
 * Fala direto com a API REST, sem o Genkit: o que importa aqui e controlar o
 * revezamento entre chaves e modelos, e o plugin do Genkit fixa uma chave por
 * instancia.
 *
 * Duas falhas diferentes, dois revezamentos:
 * - Chave: GEMINI_API_KEY_1, _2 e _3 em rodizio (para espalhar a cota do plano
 *   gratuito). Cota estourada (429) ou chave recusada passa para a proxima
 *   chave; a que estourou fica de castigo por um minuto.
 * - Modelo: "alta demanda" (503), timeout ou modelo retirado (404) e problema do
 *   modelo, nao da chave - trocar de chave nao adianta, entao vai para o proximo
 *   modelo da lista. Em out/2026 o Google tirou o gemini-2.5 de chaves novas e o
 *   3.8-flash passava minutos seguidos em 503: sem esta cadeia o chat ficaria
 *   mudo justamente nos picos.
 */

/** Ordem de preferencia. GEMINI_MODELOS (separados por virgula) substitui. */
const MODELOS_PADRAO = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.1-flash-lite'];

/**
 * Espera maxima por modelo antes de pular para o proximo. Curta de proposito:
 * em pico de demanda o modelo nao responde nunca, e cada segundo aqui e um
 * segundo da pessoa olhando "Pensando...". O ultimo modelo da lista usa o que
 * sobrar do prazo total.
 */
const TIMEOUT_TENTATIVA_MS = 12_000;
/** Teto da pergunta inteira: alem disso a pessoa ja desistiu de esperar. */
const TIMEOUT_TOTAL_MS = 50_000;
const CASTIGO_COTA_MS = 60_000;

export type PapelChat = 'usuario' | 'ia';
export type MensagemChat = { papel: PapelChat; texto: string };

export type TipoAtendimento = 'duvida' | 'erro' | 'fora_de_escopo' | 'resolvido';

export type RespostaIA = {
  resposta: string;
  tipo: TipoAtendimento;
  sugerir_chamado: boolean;
  resumo: string;
};

/** Esquema de saida estruturada (dialeto OpenAPI do Gemini). */
const ESQUEMA_RESPOSTA = {
  type: 'OBJECT',
  properties: {
    resposta: { type: 'STRING' },
    tipo: { type: 'STRING', enum: ['duvida', 'erro', 'fora_de_escopo', 'resolvido'] },
    sugerir_chamado: { type: 'BOOLEAN' },
    resumo: { type: 'STRING' },
  },
  required: ['resposta', 'tipo', 'sugerir_chamado', 'resumo'],
  propertyOrdering: ['resposta', 'tipo', 'sugerir_chamado', 'resumo'],
};

function chaves(): string[] {
  return [process.env.GEMINI_API_KEY_1, process.env.GEMINI_API_KEY_2, process.env.GEMINI_API_KEY_3]
    .map(c => c?.trim())
    .filter((c): c is string => !!c);
}

function modelos(): string[] {
  const doEnv = (process.env.GEMINI_MODELOS || process.env.GEMINI_MODEL || '')
    .split(',')
    .map(m => m.trim())
    .filter(Boolean);
  return doEnv.length > 0 ? doEnv : MODELOS_PADRAO;
}

/**
 * Atendimento nao precisa de raciocinio longo, e cada token de pensamento e
 * espera a mais para quem esta do outro lado. A geracao 3 so aceita
 * `thinkingLevel` ("minimal" nao existe em todos os modelos; "low" sim); a 2.5
 * so aceita `thinkingBudget`.
 */
function configuracaoDeRaciocinio(modelo: string) {
  return /^gemini-2\./.test(modelo) ? { thinkingBudget: 0 } : { thinkingLevel: 'low' };
}

export function iaConfigurada(): boolean {
  return chaves().length > 0;
}

// Estado do rodizio. Vive no processo: reiniciar o servidor zera, e tudo bem.
let proximaChave = 0;
const castigoAte = new Map<number, number>();
/** Modelo que deu 503/timeout vai para o fim da fila por um tempo: so a primeira pergunta do pico paga a espera. */
const castigoModeloAte = new Map<string, number>();
const CASTIGO_MODELO_MS = 2 * 60_000;

/** Para onde a falha manda a proxima tentativa. */
type Destino = 'outra_chave' | 'outro_modelo';

class ErroGemini extends Error {
  constructor(message: string, readonly status: number, readonly destino: Destino) {
    super(message);
  }
}

function classificar(status: number, corpo: string): Destino {
  if (status === 429) return 'outra_chave';
  if (status === 401 || status === 403) return 'outra_chave';
  if (status === 400 && /API key|API_KEY/i.test(corpo)) return 'outra_chave';
  // 404 (modelo retirado), 400 de parametro, 5xx (alta demanda): e o modelo.
  return 'outro_modelo';
}

async function chamar(
  chave: string,
  modelo: string,
  prompt: string,
  conversa: MensagemChat[],
  limiteMs: number
): Promise<RespostaIA> {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), Math.max(1_000, limiteMs));

  try {
    let resposta: Response;
    try {
      resposta = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
        method: 'POST',
        signal: controle.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': chave },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: prompt }] },
          contents: conversa.map(m => ({
            role: m.papel === 'ia' ? 'model' : 'user',
            parts: [{ text: m.texto }],
          })),
          generationConfig: {
            temperature: 0.3,
            // O raciocinio conta dentro deste teto; com pouco espaco o JSON sai cortado.
            maxOutputTokens: 2048,
            responseMimeType: 'application/json',
            responseSchema: ESQUEMA_RESPOSTA,
            thinkingConfig: configuracaoDeRaciocinio(modelo),
          },
        }),
      });
    } catch (erro) {
      // Timeout ou rede: tratado como problema do modelo (lento demais agora).
      throw new ErroGemini(`Sem resposta de ${modelo}: ${erro instanceof Error ? erro.name : erro}`, 504, 'outro_modelo');
    }

    if (!resposta.ok) {
      const corpo = await resposta.text().catch(() => '');
      throw new ErroGemini(
        `${modelo} respondeu ${resposta.status}: ${corpo.replace(/\s+/g, ' ').slice(0, 200)}`,
        resposta.status,
        classificar(resposta.status, corpo)
      );
    }

    const json = await resposta.json();
    const partes: { text?: string; thought?: boolean }[] = json?.candidates?.[0]?.content?.parts ?? [];
    const texto = partes.filter(p => !p.thought && p.text).map(p => p.text).join('');
    if (!texto) {
      const motivo = json?.candidates?.[0]?.finishReason ?? json?.promptFeedback?.blockReason ?? 'sem conteudo';
      throw new ErroGemini(`${modelo} nao devolveu texto (${motivo}).`, 502, 'outro_modelo');
    }

    let dados: Partial<RespostaIA>;
    try {
      dados = JSON.parse(texto);
    } catch {
      throw new ErroGemini(`${modelo} devolveu JSON invalido.`, 502, 'outro_modelo');
    }
    if (typeof dados.resposta !== 'string' || !dados.resposta.trim()) {
      throw new ErroGemini(`${modelo} devolveu JSON sem "resposta".`, 502, 'outro_modelo');
    }

    const tipos: TipoAtendimento[] = ['duvida', 'erro', 'fora_de_escopo', 'resolvido'];
    return {
      resposta: dados.resposta.trim(),
      tipo: tipos.includes(dados.tipo as TipoAtendimento) ? (dados.tipo as TipoAtendimento) : 'duvida',
      sugerir_chamado: dados.sugerir_chamado === true,
      resumo: typeof dados.resumo === 'string' ? dados.resumo.trim() : '',
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Pergunta ao Gemini percorrendo modelos e chaves ate alguem responder.
 * Lanca erro so quando tudo falhou ou o prazo acabou - quem chama decide o que mostrar.
 */
export async function perguntarAoGemini(prompt: string, conversa: MensagemChat[]): Promise<RespostaIA> {
  const lista = chaves();
  if (lista.length === 0) {
    throw new Error('Nenhuma chave do Gemini configurada (GEMINI_API_KEY_1, _2, _3).');
  }

  const prazo = Date.now() + TIMEOUT_TOTAL_MS;
  const inicio = proximaChave % lista.length;
  proximaChave = inicio + 1;

  // Chaves de castigo vao para o fim da fila, mas nao saem dela: se todas
  // estiverem de castigo, ainda vale tentar.
  const agora = Date.now();
  const ordemChaves = lista
    .map((_, i) => (inicio + i) % lista.length)
    .sort((a, b) => Number((castigoAte.get(a) ?? 0) > agora) - Number((castigoAte.get(b) ?? 0) > agora));

  let ultimoErro: unknown;
  let posicaoChave = 0;

  // Mesma ideia das chaves: modelo de castigo vai para o fim, mas continua na fila.
  const cadeia = modelos().sort(
    (a, b) => Number((castigoModeloAte.get(a) ?? 0) > agora) - Number((castigoModeloAte.get(b) ?? 0) > agora)
  );
  for (const [posicaoModelo, modelo] of cadeia.entries()) {
    const ultimoModelo = posicaoModelo === cadeia.length - 1;
    // Cada modelo comeca na chave em que o anterior parou: a falha do modelo
    // nao diz nada sobre a chave.
    while (posicaoChave < ordemChaves.length) {
      if (Date.now() >= prazo) {
        throw ultimoErro instanceof Error ? ultimoErro : new Error('Tempo esgotado consultando o Gemini.');
      }
      const indice = ordemChaves[posicaoChave];
      try {
        const resta = prazo - Date.now();
        return await chamar(lista[indice], modelo, prompt, conversa, ultimoModelo ? resta : Math.min(TIMEOUT_TENTATIVA_MS, resta));
      } catch (erro) {
        ultimoErro = erro;
        // Sem o valor da chave no log: so a posicao dela.
        console.error(`[suporte] Falha no Gemini (chave ${indice + 1}):`, erro instanceof Error ? erro.message : erro);
        if (erro instanceof ErroGemini && erro.destino === 'outra_chave') {
          if (erro.status === 429) castigoAte.set(indice, Date.now() + CASTIGO_COTA_MS);
          posicaoChave++;
          continue;
        }
        if (erro instanceof ErroGemini && erro.status >= 500) {
          castigoModeloAte.set(modelo, Date.now() + CASTIGO_MODELO_MS);
        }
        break; // problema do modelo: proximo modelo, mesma chave
      }
    }
    if (posicaoChave >= ordemChaves.length) break; // todas as chaves recusadas
  }
  throw ultimoErro instanceof Error ? ultimoErro : new Error('Falha ao consultar o Gemini.');
}
