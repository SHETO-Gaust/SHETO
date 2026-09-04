/**
 * Moldura comum a todo PDF gerado pelo sistema.
 *
 * Todos saem pelo diálogo de impressão do navegador, de propósito: a VM do
 * estado onde o sistema roda não tem acesso à internet (ver
 * `migracao/ESTADO.md`), e o "Salvar como PDF" do navegador existe em qualquer
 * máquina. O que este módulo padroniza é o que vinha divergindo de relatório
 * para relatório — cabeçalho com as duas logos e o nome da unidade, e o rodapé
 * igual ao das telas.
 */

import { LINK_PRIVACIDADE, LOGO_BRASAO, LOGO_SISTEMA, RODAPE_SISTEMA } from '@/lib/branding';

/** Escapa texto vindo do banco antes de entrar no HTML da impressão. */
export function esc(valor: unknown): string {
  return String(valor ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * A janela de impressão nasce de `about:blank` e não tem base para resolver
 * caminho relativo: com `/img/brasao_pb.png` as duas logos saem quebradas.
 */
function urlAbsoluta(caminho: string): string {
  const origem = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origem}${caminho}`;
}

export function dataPorExtenso(): string {
  return new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

/** Estilos do cabeçalho e do rodapé. Vão em todo documento de impressão. */
export const CSS_PDF_BASE = `
  * { box-sizing: border-box; }
  body {
    font-family: system-ui, -apple-system, 'Segoe UI', Arial, sans-serif;
    color: #111827;
    padding: 28px 32px;
    margin: 0;
    line-height: 1.35;
  }
  .pdf-cabecalho {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    border: 1px solid #d1d5db;
    border-radius: 10px;
    padding: 14px 22px;
    margin-bottom: 24px;
    break-inside: avoid;
  }
  .pdf-cabecalho img.pdf-logo { width: auto; object-fit: contain; flex: none; }
  .pdf-cabecalho img.pdf-logo-sistema { height: 36px; }
  .pdf-cabecalho img.pdf-logo-brasao { height: 52px; }
  .pdf-identificacao { flex: 1; text-align: center; }
  .pdf-identificacao h1 {
    font-size: 13px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .06em; margin: 0; line-height: 1.3;
  }
  .pdf-identificacao p.pdf-titulo { font-size: 11px; color: #374151; margin: 7px 0 0; }
  .pdf-identificacao p.pdf-sub { font-size: 9px; color: #9ca3af; margin: 4px 0 0; }
  .pdf-rodape {
    margin-top: 28px;
    border-top: 1px solid #e5e7eb;
    padding-top: 10px;
    text-align: center;
    font-size: 8.5px;
    color: #6b7280;
    break-inside: avoid;
  }
  .pdf-rodape a { color: inherit; text-decoration: underline; }
  @media print { body { padding: 0; } }

  /*
   * A "folha": tabela de uma coluna que embrulha o documento inteiro.
   *
   * É o único jeito de repetir o cabeçalho no topo de TODA página saindo pelo
   * diálogo do navegador — linha de <thead> o navegador repete a cada quebra,
   * um <header> solto sai só na primeira folha. Daí as regras abaixo: a tabela
   * não pode parecer tabela, e o CSS de cada relatório estiliza \`table\`/\`td\`
   * sem escopo (bordas, fundo listrado, table-layout fixo). Os seletores são
   * propositalmente específicos para vencer aquelas regras, que entram depois
   * desta folha de estilo.
   */
  table.pdf-folha { width: 100%; border-collapse: collapse; border: 0; table-layout: auto; }
  table.pdf-folha > thead { display: table-header-group; }
  table.pdf-folha > thead > tr > td.pdf-folha-topo,
  table.pdf-folha > tbody > tr > td.pdf-folha-corpo {
    border: 0;
    padding: 0;
    background: none;
    text-align: left;
    vertical-align: top;
    font-size: inherit;
    letter-spacing: normal;
    text-transform: none;
    width: auto;
  }
`;

export type CabecalhoPDF = {
  /** Nome da unidade escolar. Sem ele a linha some — nada de "—" no título. */
  escolaNome?: string | null;
  titulo: string;
  subtitulo?: string;
};

/**
 * Vai para o campo `cabecalho` de `abrirImpressaoPDF`, que o repete no topo de
 * cada página. Colado dentro de `corpo` ele sai só na primeira folha.
 */
export function cabecalhoPDF({ escolaNome, titulo, subtitulo }: CabecalhoPDF): string {
  return `
  <header class="pdf-cabecalho">
    <img class="pdf-logo pdf-logo-sistema" src="${urlAbsoluta(LOGO_SISTEMA)}" alt="SHE — Sistema de Horário Escolar do Tocantins">
    <div class="pdf-identificacao">
      ${escolaNome ? `<h1>${esc(escolaNome)}</h1>` : ''}
      <p class="pdf-titulo">${esc(titulo)}</p>
      ${subtitulo ? `<p class="pdf-sub">${esc(subtitulo)}</p>` : ''}
    </div>
    <img class="pdf-logo pdf-logo-brasao" src="${urlAbsoluta(LOGO_BRASAO)}" alt="Brasão do Estado do Tocantins">
  </header>`;
}

/** Mesmo rodapé das telas do sistema. */
export function rodapePDF(): string {
  return `
  <footer class="pdf-rodape">
    ${esc(RODAPE_SISTEMA)} &middot;
    <a href="${urlAbsoluta(LINK_PRIVACIDADE)}">Política de Privacidade</a>
  </footer>`;
}

/**
 * Abre a janela de impressão já montada. Devolve `false` (e avisa o usuário)
 * quando o pop-up foi bloqueado — o retorno silencioso fazia o botão parecer
 * quebrado.
 */
export function abrirImpressaoPDF(opts: {
  titulo: string;
  corpo: string;
  /**
   * HTML de `cabecalhoPDF`. Passado aqui — e não colado no início de `corpo` —
   * ele sai no topo de TODA página do PDF, não só da primeira.
   */
  cabecalho?: string;
  css?: string;
  /** Padrão A4 retrato; grades largas pedem paisagem. */
  orientacao?: 'retrato' | 'paisagem';
}): boolean {
  const win = window.open('', '_blank');
  if (!win) {
    alert('O navegador bloqueou a janela de impressão. Libere os pop-ups para este site e tente de novo.');
    return false;
  }

  const size = opts.orientacao === 'paisagem' ? 'A4 landscape' : 'A4 portrait';

  const corpo = opts.cabecalho
    ? `<table class="pdf-folha">
  <thead><tr><td class="pdf-folha-topo">${opts.cabecalho}</td></tr></thead>
  <tbody><tr><td class="pdf-folha-corpo">${opts.corpo}</td></tr></tbody>
</table>`
    : opts.corpo;

  win.document.open();
  win.document.write(`<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(opts.titulo)}</title>
<style>
${CSS_PDF_BASE}
@page { size: ${size}; margin: 12mm; }
${opts.css ?? ''}
</style></head>
<body>${corpo}</body></html>`);
  win.document.close();

  /**
   * A impressão é disparada daqui, não por um `<script>` dentro da aba.
   *
   * O documento da aba nasce de `about:blank` já carregado; quando o
   * `document.write` acontece o evento `load` pode já ter passado, e um
   * `window.onload` escrito lá dentro nunca chega a rodar — a aba abre com o
   * relatório e o diálogo de impressão simplesmente não aparece. Daqui a gente
   * controla o momento: espera as imagens do cabeçalho e chama `print()`.
   */
  const imagens = Array.from(win.document.images);
  const carregadas = imagens.map(img =>
    img.complete
      ? Promise.resolve()
      : new Promise<void>(resolve => {
          img.onload = () => resolve();
          img.onerror = () => resolve(); // logo quebrada não pode travar a impressão
        })
  );

  // Rede lenta não pode deixar o usuário olhando para uma aba parada: passados
  // 3s imprime do jeito que estiver.
  const limite = new Promise<void>(resolve => setTimeout(resolve, 3000));

  Promise.race([Promise.all(carregadas), limite]).then(() => {
    if (win.closed) return;
    win.onafterprint = () => win.close();
    win.focus();
    win.print();
  });

  return true;
}
