/**
 * Exporta a grade horária para um arquivo .xlsx.
 * Cada turma recebe uma aba; o arquivo inclui também uma aba "Por Dia".
 */

import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import type { HorarioCompleto, Turno } from '@/lib/types';
import { abrirImpressaoPDF, cabecalhoPDF, dataPorExtenso, esc, rodapePDF } from '@/lib/pdf-layout';
import {
  CSS_CORES_PDF,
  estiloDaCelula,
  legendaCoresPDF,
  type ComponenteColorivel,
  type CoresPorComponente,
} from '@/lib/cores-componentes';

/** Remove caracteres proibidos em nomes de aba do Excel: : \ / ? * [ ] */
function sanitizeSheetName(name: string): string {
  return name.replace(/[:\\/?*[\]]/g, '_').slice(0, 31);
}

const DIAS_MAP = [
  { id: 'segunda', label: 'Segunda' },
  { id: 'terca',   label: 'Terça'   },
  { id: 'quarta',  label: 'Quarta'  },
  { id: 'quinta',  label: 'Quinta'  },
  { id: 'sexta',   label: 'Sexta'   },
  { id: 'sabado',  label: 'Sábado'  },
];

/** Texto de uma aula numa célula: "SIGLA | Professor". */
function rotuloAula(aula: HorarioCompleto['aulas'][number]): string {
  const sigla = aula.componente?.sigla || aula.componente?.nome || '';
  const prof = aula.professor?.nome_horario || 'SEM PROF.';
  return `${sigla} | ${prof}`;
}

function buildGradeSheet(
  turmaId: string,
  horario: HorarioCompleto,
  turnoInfo: Turno,
  tipo: 'presencial' | 'nao_presencial'
): XLSX.WorkSheet {
  const diasAtivos = DIAS_MAP.filter(d => turnoInfo.dias_semana.includes(d.id));
  const aulas = horario.aulas.filter(a => a.turma_id === turmaId && a.tipo === tipo);

  const header = ['Horário', 'Início - Fim', ...diasAtivos.map(d => d.label)];
  const rows: (string | null)[][] = [header];

  /**
   * Toda aula que chegou a ser desenhada. O que sobrar no fim não coube em
   * nenhuma célula da grade — e some do arquivo sem deixar rastro se ninguém
   * for atrás (ver o bloco "FORA DA GRADE" abaixo).
   */
  const desenhadas = new Set<typeof aulas[number]>();

  for (let idx = 0; idx < turnoInfo.aulas_por_dia; idx++) {
    const hConfig = turnoInfo.horarios?.[idx];
    const inicio = hConfig?.inicio ?? '--:--';
    const fim    = hConfig?.fim    ?? '--:--';
    const row: (string | null)[] = [`${idx + 1}ª Aula`, `${inicio} - ${fim}`];

    for (const dia of diasAtivos) {
      /**
       * `filter`, não `find`.
       *
       * Grade com defeito pode ter duas aulas no mesmo slot da mesma turma — na
       * base de hoje há quatro casos assim. Com `find` a segunda simplesmente
       * não existia no arquivo: a planilha saía plausível, com uma aula a menos
       * e nada indicando o choque. Agora as duas aparecem, marcadas.
       */
      const noSlot = aulas.filter(a => a.dia_semana === dia.id && a.aula_index === idx);
      noSlot.forEach(a => desenhadas.add(a));

      if (noSlot.length === 0) row.push(null);
      else if (noSlot.length === 1) row.push(rotuloAula(noSlot[0]));
      else row.push(`⚠ CHOQUE (${noSlot.length}): ${noSlot.map(rotuloAula).join('  //  ')}`);
    }

    rows.push(row);

    if (hConfig?.tem_intervalo_depois && idx < turnoInfo.aulas_por_dia - 1) {
      const proximoInicio = turnoInfo.horarios?.[idx + 1]?.inicio ?? '--:--';
      rows.push(['INTERVALO', `${fim} - ${proximoInicio}`, ...diasAtivos.map(() => null)]);
    }
  }

  /**
   * Aulas que a grade não comporta: índice além de `aulas_por_dia`, ou dia que o
   * turno não tem. Elas existem no banco, não cabem em nenhuma célula, e por
   * isso eram invisíveis na planilha, na tela e no PDF ao mesmo tempo — a base
   * de hoje tem uma aula com índice 6 num turno de 5 aulas. Sair listado no fim
   * do arquivo é feio, mas é melhor do que o número de aulas não fechar e
   * ninguém saber por quê.
   */
  const foraDaGrade = aulas.filter(a => !desenhadas.has(a));
  if (foraDaGrade.length > 0) {
    rows.push([]);
    rows.push([`⚠ FORA DA GRADE (${foraDaGrade.length}) — estas aulas estão salvas mas não cabem neste turno`]);
    rows.push(['Dia', 'Aula nº', 'Disciplina / Professor']);
    for (const a of foraDaGrade) {
      const dia = DIAS_MAP.find(d => d.id === a.dia_semana)?.label ?? a.dia_semana;
      rows.push([dia, `${a.aula_index + 1}ª`, rotuloAula(a)]);
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 12 }, { wch: 18 }, ...diasAtivos.map(() => ({ wch: 28 }))];
  return ws;
}

function buildPorDiaSheet(horario: HorarioCompleto): XLSX.WorkSheet {
  const turno = horario.turno;
  const diasAtivos = DIAS_MAP.filter(d => turno.dias_semana.includes(d.id));

  const turmasMap = new Map<string, string>();
  horario.aulas.forEach(a => {
    if (!turmasMap.has(a.turma_id) && a.turma) turmasMap.set(a.turma_id, a.turma.nome);
  });
  const turmas = Array.from(turmasMap.entries()).sort((a, b) => a[1].localeCompare(b[1]));

  const allRows: (string | null)[][] = [];

  for (const dia of diasAtivos) {
    allRows.push([`=== ${dia.label.toUpperCase()} ===`]);
    allRows.push(['Horário', 'Início - Fim', ...turmas.map(([, nome]) => `Turma ${nome}`)]);

    for (let idx = 0; idx < turno.aulas_por_dia; idx++) {
      const hConfig = turno.horarios?.[idx];
      const inicio = hConfig?.inicio ?? '--:--';
      const fim    = hConfig?.fim    ?? '--:--';
      const row: (string | null)[] = [`${idx + 1}ª Aula`, `${inicio} - ${fim}`];

      for (const [turmaId] of turmas) {
        const aula = horario.aulas.find(
          a => a.turma_id === turmaId && a.dia_semana === dia.id && a.aula_index === idx && a.tipo === 'presencial'
        );
        row.push(aula
          ? `${aula.componente?.sigla || aula.componente?.nome || ''} / ${aula.professor?.nome_horario || 'SEM PROF.'}`
          : null
        );
      }

      allRows.push(row);
    }

    allRows.push([]);
  }

  const ws = XLSX.utils.aoa_to_sheet(allRows);
  ws['!cols'] = [{ wch: 12 }, { wch: 18 }, ...turmas.map(() => ({ wch: 28 }))];
  return ws;
}

/**
 * Gera o workbook de um horário e retorna os bytes sem acionar download.
 * Usado internamente pela exportação em lote.
 */
function buildWorkbook(horario: HorarioCompleto): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const turno = horario.turno;
  const isIntegral = turno.nome.toLowerCase().includes('integral');

  const turmasMap = new Map<string, string>();
  horario.aulas.forEach(a => {
    if (!turmasMap.has(a.turma_id) && a.turma) turmasMap.set(a.turma_id, a.turma.nome);
  });
  const turmas = Array.from(turmasMap.entries()).sort((a, b) => a[1].localeCompare(b[1]));

  /**
   * Nomes de aba precisam ser únicos e caber em 31 caracteres.
   *
   * `sanitizeSheetName` corta em 31, e nomes de turma longos batem nesse limite
   * com frequência ("13.01/EM.MAT-ANL-INTEGRAL-A" e "-B" viram a mesma coisa).
   * `book_append_sheet` lança em nome repetido, o que derruba a exportação
   * inteira do arquivo — e, no caminho do .zip, a de todos os outros junto.
   */
  const usados = new Set<string>();
  const nomeAbaUnico = (base: string) => {
    let nome = sanitizeSheetName(base);
    let n = 2;
    while (usados.has(nome)) {
      const sufixo = `~${n++}`;
      nome = sanitizeSheetName(base).slice(0, 31 - sufixo.length) + sufixo;
    }
    usados.add(nome);
    return nome;
  };

  for (const [turmaId, turmaLabel] of turmas) {
    const ws = buildGradeSheet(turmaId, horario, turno, 'presencial');
    XLSX.utils.book_append_sheet(wb, ws, nomeAbaUnico(`T-${turmaLabel}`));
  }

  /**
   * Contraturno.
   *
   * A condição era `!isIntegral && horario.turno_oposto`: numa escola de turno
   * único `turno_oposto` vem indefinido, e TODAS as aulas não presenciais
   * sumiam do arquivo sem uma linha de aviso — a planilha saía com menos aulas
   * do que a grade tem e parecia completa. Agora, se existe aula não
   * presencial, a aba sai; na falta do turno oposto usa-se a grade do próprio
   * turno como régua, o que desloca os horários mas não perde aula nenhuma.
   */
  const temNaoPresencial = horario.aulas.some(a => a.tipo === 'nao_presencial');
  if (temNaoPresencial && !isIntegral) {
    const turnoCT = horario.turno_oposto ?? turno;
    for (const [turmaId, turmaLabel] of turmas) {
      const ws = buildGradeSheet(turmaId, horario, turnoCT, 'nao_presencial');
      XLSX.utils.book_append_sheet(wb, ws, nomeAbaUnico(`CT-${turmaLabel}`));
    }
  }

  XLSX.utils.book_append_sheet(wb, buildPorDiaSheet(horario), nomeAbaUnico('Por Dia'));
  return wb;
}

/**
 * Nome de arquivo único dentro de um mesmo .zip.
 *
 * Dois horários de turnos diferentes podem ter exatamente o mesmo nome — na
 * base de hoje, a escola 17004977 tem "Horário V1" no Matutino e "Horário V1"
 * no Vespertino. Como `zip.file()` SOBRESCREVE entradas homônimas, o .zip saía
 * com um arquivo onde deveria haver dois, e a grade do outro turno
 * desaparecia sem erro nenhum. O turno entra no nome, e um contador resolve o
 * que ainda restar.
 */
function nomeArquivoUnico(horario: HorarioCompleto, usados: Set<string>): string {
  const limpar = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '_');
  const turnoNome = horario.turno?.nome ? `-${limpar(horario.turno.nome)}` : '';
  const base = `Horario-${limpar(horario.nome ?? 'Grade')}${turnoNome}`;

  let nome = `${base}.xlsx`;
  let n = 2;
  while (usados.has(nome)) nome = `${base}_${n++}.xlsx`;
  usados.add(nome);
  return nome;
}

/**
 * Baixa um .zip contendo um .xlsx por horário.
 * onProgress(idx, total) é chamado a cada arquivo processado.
 */
export async function exportarTodosHorariosZIP(
  horarios: HorarioCompleto[],
  onProgress?: (idx: number, total: number) => void
): Promise<void> {
  const zip = new JSZip();
  const usados = new Set<string>();

  horarios.forEach((horario, idx) => {
    const wb = buildWorkbook(horario);
    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
    zip.file(nomeArquivoUnico(horario, usados), buffer);
    onProgress?.(idx + 1, horarios.length);
  });

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Horarios_${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportarHorarioXLSX(horario: HorarioCompleto): void {
  const wb = buildWorkbook(horario);
  XLSX.writeFile(wb, nomeArquivoUnico(horario, new Set()));
}

// ─── PDF ────────────────────────────────────────────────────────────────────

/** Uma tabela de grade (uma turma, um tipo) como HTML. */
function tabelaHTML(
  turmaId: string,
  turmaLabel: string,
  horario: HorarioCompleto,
  turnoInfo: Turno,
  tipo: 'presencial' | 'nao_presencial',
  rotulo: string,
  /** Cor de fundo por disciplina. `null` = o preto e branco de sempre. */
  cores?: CoresPorComponente | null,
): string {
  const diasAtivos = DIAS_MAP.filter(d => turnoInfo.dias_semana.includes(d.id));
  const aulas = horario.aulas.filter(a => a.turma_id === turmaId && a.tipo === tipo);
  if (aulas.length === 0) return '';

  const desenhadas = new Set<typeof aulas[number]>();
  const linhas: string[] = [];

  for (let idx = 0; idx < turnoInfo.aulas_por_dia; idx++) {
    const hConfig = turnoInfo.horarios?.[idx];
    const inicio = hConfig?.inicio ?? '--:--';
    const fim = hConfig?.fim ?? '--:--';

    const celulas = diasAtivos.map(dia => {
      const noSlot = aulas.filter(a => a.dia_semana === dia.id && a.aula_index === idx);
      noSlot.forEach(a => desenhadas.add(a));
      if (noSlot.length === 0) return '<td class="vazia"></td>';
      const conteudo = noSlot
        .map(a => `<span class="disc">${esc(a.componente?.sigla || a.componente?.nome || '')}</span>` +
          `<span class="prof">${esc(a.professor?.nome_horario || 'SEM PROF.')}</span>`)
        .join('<hr class="sep">');
      /*
       * Célula com choque não recebe cor: ali o fundo vermelho e a borda são o
       * aviso, e pintá-la com o tom da disciplina apagaria justamente o que
       * precisa saltar aos olhos. Com duas aulas no slot não há uma disciplina
       * a representar, de todo modo.
       */
      const estilo = noSlot.length > 1 ? '' : estiloDaCelula(cores, noSlot[0].componente?.id);
      return `<td class="${noSlot.length > 1 ? 'choque' : ''}"${estilo}>${conteudo}</td>`;
    }).join('');

    linhas.push(
      `<tr><th class="hora">${idx + 1}ª<small>${esc(inicio)} - ${esc(fim)}</small></th>${celulas}</tr>`
    );

    if (hConfig?.tem_intervalo_depois && idx < turnoInfo.aulas_por_dia - 1) {
      linhas.push(
        `<tr class="intervalo"><td colspan="${diasAtivos.length + 1}">INTERVALO</td></tr>`
      );
    }
  }

  // Mesma rede de segurança da planilha: aula salva que não cabe na grade não
  // pode simplesmente não aparecer.
  const foraDaGrade = aulas.filter(a => !desenhadas.has(a));
  const avisoFora = foraDaGrade.length > 0
    ? `<p class="fora">⚠ ${foraDaGrade.length} aula(s) fora da grade deste turno: ` +
      foraDaGrade.map(a => `${esc(DIAS_MAP.find(d => d.id === a.dia_semana)?.label ?? a.dia_semana)} ` +
        `${a.aula_index + 1}ª (${esc(a.componente?.sigla || '')})`).join('; ') + '</p>'
    : '';

  return `
    <section class="grade">
      <h2>${esc(turmaLabel)} <small>${esc(rotulo)}</small></h2>
      <table>
        <thead><tr><th class="hora">Horário</th>${diasAtivos.map(d => `<th>${esc(d.label)}</th>`).join('')}</tr></thead>
        <tbody>${linhas.join('')}</tbody>
      </table>
      ${avisoFora}
    </section>`;
}

const CSS_GRADE = `
  .grade { margin-bottom: 22px; break-inside: avoid; page-break-inside: avoid; }
  .grade h2 { font-size: 13px; margin: 0 0 6px; text-transform: uppercase; letter-spacing: .04em; }
  .grade h2 small { font-weight: 500; text-transform: none; color: #6b7280; margin-left: 8px; letter-spacing: 0; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #d1d5db; padding: 5px 6px; font-size: 10px; text-align: center; vertical-align: middle; }
  thead th { background: #f3f4f6; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
  th.hora { width: 78px; background: #f9fafb; font-weight: 700; }
  th.hora small { display: block; font-weight: 400; color: #6b7280; font-size: 8px; }
  td .disc { display: block; font-weight: 700; }
  td .prof { display: block; color: #4b5563; font-size: 9px; }
  td.vazia { background: #fafafa; }
  td.choque { background: #fef2f2; outline: 1.5px solid #dc2626; }
  hr.sep { border: 0; border-top: 1px dashed #dc2626; margin: 3px 0; }
  tr.intervalo td { background: #f9fafb; font-size: 9px; letter-spacing: .18em; color: #6b7280; padding: 2px; }
  p.fora { font-size: 9px; color: #b45309; margin: 4px 0 0; }
${CSS_CORES_PDF}
`;

/**
 * Abre a janela de impressão com o horário COMPLETO — todas as turmas, e o
 * contraturno quando existe. O usuário escolhe "Salvar como PDF".
 *
 * Sem biblioteca de PDF de propósito: a VM do estado onde o sistema roda não
 * tem acesso à internet (ver `migracao/ESTADO.md`), e o diálogo de impressão do
 * navegador já gera PDF em qualquer máquina. Cabeçalho e rodapé vêm de
 * `@/lib/pdf-layout`, comuns a todos os relatórios.
 */
export function exportarHorarioPDF(
  horario: HorarioCompleto,
  escolaNome?: string | null,
  /** Cor de fundo por disciplina, escolhida no diálogo de opções. */
  cores?: CoresPorComponente | null,
): void {
  const turno = horario.turno;
  const isIntegral = turno.nome.toLowerCase().includes('integral');

  const turmasMap = new Map<string, string>();
  horario.aulas.forEach(a => {
    if (!turmasMap.has(a.turma_id) && a.turma) turmasMap.set(a.turma_id, a.turma.nome);
  });
  const turmas = Array.from(turmasMap.entries()).sort((a, b) => a[1].localeCompare(b[1]));

  if (turmas.length === 0) {
    alert('Este horário não tem aulas para imprimir.');
    return;
  }

  const temNaoPresencial = horario.aulas.some(a => a.tipo === 'nao_presencial');
  const turnoCT = horario.turno_oposto ?? turno;

  const secoes = turmas.map(([turmaId, turmaLabel]) => {
    const regular = tabelaHTML(turmaId, turmaLabel, horario, turno, 'presencial', `Turno ${turno.nome}`, cores);
    const contraturno = (temNaoPresencial && !isIntegral)
      ? tabelaHTML(turmaId, turmaLabel, horario, turnoCT, 'nao_presencial',
          `Contraturno${horario.turno_oposto ? ` — ${turnoCT.nome}` : ' (turno oposto não configurado)'}`, cores)
      : '';
    return regular + contraturno;
  }).join('');

  const legenda = legendaCoresPDF(componentesDoHorario(horario), cores);

  const cabecalho = cabecalhoPDF({
    escolaNome,
    titulo: `${horario.nome} — Turno ${turno.nome}`,
    subtitulo: `${turmas.length} turma(s) · gerado em ${dataPorExtenso()}`,
  });

  abrirImpressaoPDF({
    titulo: horario.nome,
    css: CSS_GRADE,
    orientacao: 'paisagem',
    cabecalho,
    corpo: `${legenda}${secoes}${rodapePDF()}`,
  });
}

/**
 * As disciplinas que aparecem num horário, sem repetição e em ordem alfabética.
 *
 * É a lista que o diálogo de opções oferece para colorir e a que a legenda
 * imprime — as duas precisam sair da mesma leitura das aulas, senão o PDF pinta
 * uma disciplina que o usuário nunca viu na tela de escolha.
 */
export function componentesDoHorario(horario: HorarioCompleto): ComponenteColorivel[] {
  const porId = new Map<string, ComponenteColorivel>();

  for (const aula of horario.aulas) {
    const c = aula.componente;
    if (!c?.id || porId.has(c.id)) continue;
    porId.set(c.id, { id: c.id, nome: c.nome || c.sigla || 'Disciplina', sigla: c.sigla || c.nome || '' });
  }

  return Array.from(porId.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}
