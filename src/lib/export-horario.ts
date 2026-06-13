/**
 * Exporta a grade horária para um arquivo .xlsx.
 * Cada turma recebe uma aba; o arquivo inclui também uma aba "Por Dia".
 */

import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import type { HorarioCompleto, Turno } from '@/lib/types';

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

  for (let idx = 0; idx < turnoInfo.aulas_por_dia; idx++) {
    const hConfig = turnoInfo.horarios?.[idx];
    const inicio = hConfig?.inicio ?? '--:--';
    const fim    = hConfig?.fim    ?? '--:--';
    const row: (string | null)[] = [`${idx + 1}ª Aula`, `${inicio} - ${fim}`];

    for (const dia of diasAtivos) {
      const aula = aulas.find(a => a.dia_semana === dia.id && a.aula_index === idx);
      if (aula) {
        const sigla = aula.componente?.sigla || aula.componente?.nome || '';
        const prof  = aula.professor?.nome_horario || 'SEM PROF.';
        row.push(`${sigla} | ${prof}`);
      } else {
        row.push(null);
      }
    }

    rows.push(row);

    if (hConfig?.tem_intervalo_depois && idx < turnoInfo.aulas_por_dia - 1) {
      const proximoInicio = turnoInfo.horarios?.[idx + 1]?.inicio ?? '--:--';
      rows.push(['INTERVALO', `${fim} - ${proximoInicio}`, ...diasAtivos.map(() => null)]);
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 12 }, { wch: 18 }, ...diasAtivos.map(() => ({ wch: 24 }))];
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

  for (const [turmaId, turmaLabel] of turmas) {
    const ws = buildGradeSheet(turmaId, horario, turno, 'presencial');
    XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(`T-${turmaLabel}`));
  }

  if (!isIntegral && horario.turno_oposto) {
    for (const [turmaId, turmaLabel] of turmas) {
      const ws = buildGradeSheet(turmaId, horario, horario.turno_oposto, 'nao_presencial');
      XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(`CT-${turmaLabel}`));
    }
  }

  XLSX.utils.book_append_sheet(wb, buildPorDiaSheet(horario), 'Por Dia');
  return wb;
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

  horarios.forEach((horario, idx) => {
    const wb = buildWorkbook(horario);
    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
    const nomeArquivo = `Horario-${(horario.nome ?? 'Grade').replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;
    zip.file(nomeArquivo, buffer);
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
  const nomeArquivo = `Horario-${(horario.nome ?? 'Grade').replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;
  XLSX.writeFile(wb, nomeArquivo);
}
