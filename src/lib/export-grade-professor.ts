/**
 * Relatório de Professores (Individual): a semana inteira de um docente numa
 * folha só.
 *
 * A grade da tela desenha uma tabela por turno. Em papel isso vira duas tabelas
 * desencontradas para quem dá aula de manhã e à tarde — o professor precisa ler
 * o dia dele de cima a baixo. Aqui os turnos são fundidos numa única coluna de
 * horários, ordenada pelo relógio, com uma linha tracejada onde um turno acaba
 * e o outro começa.
 */

import type { Turno } from '@/lib/types';
import { timeToMinutes } from '@/lib/horario-slots';
import { etiquetaDoSlot, type ProfessorRestricoes } from '@/lib/restricoes-slot';
import { abrirImpressaoPDF, cabecalhoPDF, dataPorExtenso, esc, rodapePDF } from '@/lib/pdf-layout';

const DIAS_MAP = [
  { id: 'segunda', label: 'Seg' },
  { id: 'terca',   label: 'Ter' },
  { id: 'quarta',  label: 'Qua' },
  { id: 'quinta',  label: 'Qui' },
  { id: 'sexta',   label: 'Sex' },
  { id: 'sabado',  label: 'Sáb' },
];

/** O que o relatório precisa saber de uma aula. */
export type AulaProfessorPDF = {
  dia_semana: string;
  aula_index: number;
  turma?: { nome?: string | null } | null;
  componente?: { nome?: string | null; sigla?: string | null } | null;
};

/** Um turno onde o professor tem carga, com as aulas dele naquele turno. */
export type BlocoTurnoProfessor = {
  turno: Turno;
  aulas: AulaProfessorPDF[];
};

export type ProfessorPDF = ProfessorRestricoes & {
  nome_horario?: string | null;
  nome_completo?: string | null;
};

/** Uma faixa de horário da semana e os slots (turno + índice) que caem nela. */
type Linha = {
  inicio: string;
  fim: string;
  slots: { blocoIdx: number; aulaIdx: number }[];
};

/**
 * Funde os slots de todos os turnos numa única régua de horários.
 *
 * Dois turnos que começam no mesmo minuto viram uma linha só — é o caso do
 * Integral com o Matutino na mesma unidade. O resto entra em ordem de relógio.
 */
function montarLinhas(blocos: BlocoTurnoProfessor[]): Linha[] {
  const porFaixa = new Map<string, Linha>();

  blocos.forEach((bloco, blocoIdx) => {
    for (let aulaIdx = 0; aulaIdx < bloco.turno.aulas_por_dia; aulaIdx++) {
      const config = bloco.turno.horarios?.[aulaIdx];
      const inicio = config?.inicio || '--:--';
      const fim = config?.fim || '--:--';
      const chave = `${inicio}|${fim}`;
      const linha = porFaixa.get(chave) ?? { inicio, fim, slots: [] };
      linha.slots.push({ blocoIdx, aulaIdx });
      porFaixa.set(chave, linha);
    }
  });

  // Turno sem horários configurados devolve -1 em tudo; essas linhas vão para o
  // fim em vez de embaralhar as que têm hora de verdade.
  const ordem = (hhmm: string) => {
    const min = timeToMinutes(hhmm);
    return min < 0 ? Number.MAX_SAFE_INTEGER : min;
  };

  return Array.from(porFaixa.values()).sort((a, b) => ordem(a.inicio) - ordem(b.inicio));
}

/** Conteúdo de uma célula: aula alocada, restrição cadastrada, ou nada. */
function conteudoCelula(
  professor: ProfessorPDF,
  blocos: BlocoTurnoProfessor[],
  linha: Linha,
  diaId: string,
): { html: string; classe: string } {
  let restricao: { html: string; classe: string } | null = null;

  for (const slot of linha.slots) {
    const bloco = blocos[slot.blocoIdx];
    if (!bloco.turno.dias_semana.includes(diaId)) continue;

    const aula = bloco.aulas.find(a => a.dia_semana === diaId && a.aula_index === slot.aulaIdx);
    if (aula) {
      const turma = aula.turma?.nome || '—';
      const componente = aula.componente?.nome || aula.componente?.sigla || '—';
      // Turma em negrito: numa coluna estreita ela é a informação que o
      // professor procura primeiro, e o nome do componente se repete.
      return {
        html: `<b>${esc(turma.toUpperCase())}</b>/${esc(componente.toUpperCase())}`,
        classe: 'aula',
      };
    }

    // A restrição só vale se nenhum outro turno tiver aula nesta faixa — por
    // isso ela fica guardada e o laço continua.
    if (!restricao) {
      const etiqueta = etiquetaDoSlot(professor, bloco.turno, diaId, slot.aulaIdx);
      if (etiqueta) restricao = { html: esc(etiqueta.label.toUpperCase()), classe: 'restricao' };
    }
  }

  return restricao ?? { html: '', classe: 'vazia' };
}

const CSS = `
  .professor-bloco {
    border-bottom: 1.5px solid #111827;
    padding-bottom: 7px;
    margin-bottom: 12px;
    break-after: avoid;
  }
  h2.professor {
    font-size: 14px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: .03em;
    margin: 0;
  }
  p.professor-sub {
    font-size: 8.5px;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: .07em;
    margin: 4px 0 0;
  }

  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td {
    border: 1px solid #d1d5db;
    padding: 6px 7px;
    font-size: 9px;
    text-align: center;
    vertical-align: middle;
    word-break: break-word;
  }
  thead th {
    background: #f3f4f6;
    border-color: #9ca3af;
    padding: 7px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .07em;
    color: #374151;
  }
  th.hora, td.hora { width: 52px; background: #f9fafb; font-weight: 700; color: #374151; }
  tbody tr:nth-child(even) td { background: #fafafa; }
  tbody tr:nth-child(even) td.hora { background: #f3f4f6; }
  td.aula b { font-weight: 700; }
  /* Restrição tem peso menor que aula: o que o professor procura é onde ele dá aula. */
  td.restricao { color: #6b7280; font-weight: 600; font-size: 8.5px; letter-spacing: .04em; }
  td.vazia span {
    display: block;
    border-top: 1px dashed #d1d5db;
    width: 55%;
    height: 1px;
    margin: 0 auto;
  }
  tbody tr.corte td { background: #f3f4f6; padding: 3px 7px; }
  tbody tr.corte td span {
    display: block;
    border-top: 1px dashed #9ca3af;
    height: 1px;
    margin: 0 6px;
    width: auto;
  }
  p.sem-aulas { font-size: 10px; color: #6b7280; font-style: italic; }
`;

/**
 * Abre a impressão da semana de um professor. O usuário escolhe
 * "Salvar como PDF" no diálogo do navegador.
 */
export function exportarGradeProfessorPDF(params: {
  professor: ProfessorPDF;
  blocos: BlocoTurnoProfessor[];
  escolaNome?: string | null;
}): void {
  const { professor, blocos, escolaNome } = params;
  // Nome completo no documento oficial; nome_horario é só a abreviação de grade.
  const nome = (professor.nome_completo || professor.nome_horario || 'Professor').toUpperCase();

  const cabecalho = cabecalhoPDF({
    escolaNome,
    titulo: 'Relatório de Professores (Individual)',
    subtitulo: `Gerado em ${dataPorExtenso()}`,
  });

  const totalAulas = blocos.reduce((soma, b) => soma + b.aulas.length, 0);
  const turnos = blocos.map(b => b.turno.nome).join(' · ');
  const blocoNome = `
    <div class="professor-bloco">
      <h2 class="professor">${esc(nome)}</h2>
      ${blocos.length > 0
        ? `<p class="professor-sub">${esc(turnos)} &middot; ${totalAulas} aula(s) na semana</p>`
        : ''}
    </div>`;

  if (blocos.length === 0) {
    abrirImpressaoPDF({
      titulo: `Horário — ${nome}`,
      css: CSS,
      corpo: `${cabecalho}${blocoNome}
        <p class="sem-aulas">Este professor não possui aulas ou restrições em nenhum turno publicado.</p>
        ${rodapePDF()}`,
    });
    return;
  }

  // Dia que não existe em turno nenhum não vira coluna; dia que existe mas está
  // vazio vira coluna tracejada, como a quinta-feira de quem não trabalha nela.
  const diasAtivos = DIAS_MAP.filter(d => blocos.some(b => b.turno.dias_semana.includes(d.id)));
  const linhas = montarLinhas(blocos);

  const corpoLinhas: string[] = [];

  linhas.forEach((linha, i) => {
    const anterior = linhas[i - 1];
    if (anterior) {
      const turnosAnterior = new Set(anterior.slots.map(s => s.blocoIdx));
      const mudouDeTurno = linha.slots.every(s => !turnosAnterior.has(s.blocoIdx));
      if (mudouDeTurno) {
        corpoLinhas.push(
          `<tr class="corte"><td class="hora"><span></span></td>` +
          diasAtivos.map(() => '<td><span></span></td>').join('') +
          `</tr>`
        );
      }
    }

    const celulas = diasAtivos.map(dia => {
      const { html, classe } = conteudoCelula(professor, blocos, linha, dia.id);
      return html
        ? `<td class="${classe}">${html}</td>`
        : `<td class="vazia"><span></span></td>`;
    }).join('');

    corpoLinhas.push(`<tr><td class="hora">${esc(linha.inicio)}</td>${celulas}</tr>`);
  });

  const tabela = `
    <table>
      <thead>
        <tr><th class="hora">Hor</th>${diasAtivos.map(d => `<th>${esc(d.label)}</th>`).join('')}</tr>
      </thead>
      <tbody>${corpoLinhas.join('')}</tbody>
    </table>`;

  abrirImpressaoPDF({
    titulo: `Horário — ${nome}`,
    css: CSS,
    corpo: `${cabecalho}${blocoNome}${tabela}${rodapePDF()}`,
  });
}
