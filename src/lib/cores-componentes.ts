/**
 * Cor por disciplina nos horários impressos.
 *
 * Uma grade em preto e branco se lê célula a célula: para achar as aulas de
 * Matemática na semana, o olho precisa passar por todas as outras. Com cor, o
 * bloco de uma disciplina aparece inteiro de uma vez — que é como a coordenação
 * lê o horário na parede.
 *
 * A cor é opcional e escolhida na hora de gerar: nem toda unidade imprime
 * colorido, e um PDF policromático numa impressora monocromática sai pior que o
 * preto e branco original.
 */

import { esc } from '@/lib/pdf-layout';

/** `componente_id` → cor de fundo em `#rrggbb`. */
export type CoresPorComponente = Record<string, string>;

/** Uma disciplina que pode receber cor. */
export type ComponenteColorivel = {
  id: string;
  nome: string;
  sigla: string;
};

/**
 * Ponto de partida quando o usuário vai escolher as cores na mão.
 *
 * São tons claros de propósito: o texto da célula é preto, e o que precisa
 * sobreviver à impressão é a LEITURA, não a cor. Fundos saturados transformam
 * "3ºA/MAT" em algo que só se lê de perto — e, numa laser monocromática,
 * viram um cinza chapado que apaga a letra.
 */
export const PALETA_PADRAO: readonly string[] = [
  '#dbeafe', // azul
  '#fee2e2', // vermelho
  '#dcfce7', // verde
  '#fef3c7', // âmbar
  '#f3e8ff', // roxo
  '#ffe4e6', // rosa
  '#cffafe', // ciano
  '#ecfccb', // lima
  '#ffedd5', // laranja
  '#e0e7ff', // índigo
  '#ccfbf1', // turquesa
  '#fae8ff', // fúcsia
];

function doisDigitos(n: number): string {
  return Math.round(n).toString(16).padStart(2, '0');
}

/** HSL (h em graus, s e l em %) → `#rrggbb`. */
function hslParaHex(h: number, s: number, l: number): string {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;

  const [r, g, b] =
    h < 60 ? [c, x, 0] :
    h < 120 ? [x, c, 0] :
    h < 180 ? [0, c, x] :
    h < 240 ? [0, x, c] :
    h < 300 ? [x, 0, c] :
    [c, 0, x];

  return `#${doisDigitos((r + m) * 255)}${doisDigitos((g + m) * 255)}${doisDigitos((b + m) * 255)}`;
}

/**
 * Um tom claro e distinto para cada disciplina, sorteado a cada chamada.
 *
 * Não é `Math.random()` por canal, e a diferença importa. Cor aleatória de
 * verdade produz, numa lista de doze disciplinas, dois azuis quase iguais e um
 * roxo escuro demais para ler por cima — justamente as duas coisas que a cor
 * existe para evitar. Aqui o sorteio é do PONTO DE PARTIDA na roda de cores e da
 * ordem em que as disciplinas a percorrem; o espaçamento entre matizes é fixo,
 * então duas disciplinas nunca saem parecidas, e saturação e luminosidade ficam
 * na faixa que imprime bem.
 *
 * Duas faixas de luminosidade alternadas dão a separação que falta quando há
 * muitas disciplinas e o passo de matiz fica curto.
 */
export function gerarCoresAleatorias(ids: string[]): CoresPorComponente {
  const cores: CoresPorComponente = {};
  if (ids.length === 0) return cores;

  const ordem = [...ids];
  for (let i = ordem.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ordem[i], ordem[j]] = [ordem[j], ordem[i]];
  }

  const inicio = Math.random() * 360;
  const passo = 360 / ordem.length;

  ordem.forEach((id, i) => {
    const matiz = (inicio + i * passo) % 360;
    cores[id] = hslParaHex(matiz, 68, i % 2 === 0 ? 87 : 79);
  });

  return cores;
}

/** A paleta fixa distribuída na ordem da lista, para o modo manual começar de algum lugar. */
export function coresDaPaleta(ids: string[]): CoresPorComponente {
  const cores: CoresPorComponente = {};
  ids.forEach((id, i) => { cores[id] = PALETA_PADRAO[i % PALETA_PADRAO.length]; });
  return cores;
}

/**
 * Preto ou branco sobre aquele fundo, pelo que se lê melhor.
 *
 * A paleta padrão e o sorteio só produzem tons claros, mas o seletor de cor do
 * navegador aceita qualquer coisa — inclusive um azul-marinho onde o texto
 * preto some. A conta é a luminância relativa do WCAG.
 *
 * O corte é 0,179 porque é ONDE OS DOIS CONTRASTES SE IGUALAM: preto sobre um
 * fundo de luminância L rende `(L + .05) / .05`, branco rende `1,05 / (L + .05)`,
 * e as duas curvas se cruzam ali. Um corte mais alto (0,45, por exemplo) troca
 * para branco em fundos que ainda leem melhor com preto — um lilás claro do
 * próprio sorteio saía com texto branco em cima, que é o contrário do que esta
 * função existe para garantir.
 */
const LUMINANCIA_DE_CORTE = 0.179;

export function corDoTexto(fundo: string): string {
  const hex = fundo.replace('#', '');
  if (hex.length !== 6) return '#111827';

  const canal = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };

  const luminancia = 0.2126 * canal(0) + 0.7152 * canal(2) + 0.0722 * canal(4);
  return luminancia > LUMINANCIA_DE_CORTE ? '#111827' : '#ffffff';
}

/**
 * O `style` da célula de uma aula. String vazia quando a disciplina não tem cor
 * — o PDF sem cores continua saindo exatamente como saía.
 */
export function estiloDaCelula(cores: CoresPorComponente | null | undefined, componenteId?: string | null): string {
  if (!cores || !componenteId) return '';
  const fundo = cores[componenteId];
  if (!fundo) return '';
  return ` style="background:${esc(fundo)};color:${corDoTexto(fundo)}"`;
}

/**
 * CSS que faz a cor sobreviver à impressão.
 *
 * Sem `print-color-adjust: exact` o navegador descarta fundos ao imprimir — e o
 * PDF sai idêntico ao preto e branco, sem nenhum aviso de que a opção não
 * pegou. É a regra que faz esta funcionalidade existir em papel.
 */
export const CSS_CORES_PDF = `
  td[style*="background"] {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .legenda-cores {
    display: flex;
    flex-wrap: wrap;
    gap: 5px 10px;
    margin: 0 0 18px;
    padding: 10px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    break-inside: avoid;
  }
  .legenda-cores span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 8.5px;
    text-transform: uppercase;
    letter-spacing: .04em;
    color: #374151;
  }
  .legenda-cores i {
    width: 11px;
    height: 11px;
    border-radius: 3px;
    border: 1px solid rgba(0, 0, 0, .18);
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
`;

/**
 * A legenda impressa: o nome de cada disciplina ao lado do seu tom.
 *
 * Existe porque a sigla na célula é abreviada — quem recebe a folha e não montou
 * o horário precisa de um lugar para descobrir que "LPT" é o quadrado azul.
 * Só as disciplinas que de fato receberam cor entram.
 */
export function legendaCoresPDF(
  componentes: ComponenteColorivel[],
  cores: CoresPorComponente | null | undefined,
): string {
  if (!cores) return '';

  const itens = componentes
    .filter(c => cores[c.id])
    .map(c =>
      `<span><i style="background:${esc(cores[c.id])}"></i>${esc(c.sigla || c.nome)}` +
      `${c.sigla && c.nome && c.sigla !== c.nome ? ` — ${esc(c.nome)}` : ''}</span>`
    );

  if (itens.length === 0) return '';
  return `<div class="legenda-cores">${itens.join('')}</div>`;
}
