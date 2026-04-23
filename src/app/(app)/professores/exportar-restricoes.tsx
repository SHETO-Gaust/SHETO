'use client';

import { useRef } from 'react';
import type { ProfessorComDados, Turno, LivreDocenciaPeriodo } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { FileDown } from 'lucide-react';

const DIAS_SEMANA_ORDERED = [
  { id: 'segunda', label: 'Segunda' },
  { id: 'terca',   label: 'Terça' },
  { id: 'quarta',  label: 'Quarta' },
  { id: 'quinta',  label: 'Quinta' },
  { id: 'sexta',   label: 'Sexta' },
  { id: 'sabado',  label: 'Sábado' },
];

const PERIODOS_LABELS: Record<LivreDocenciaPeriodo, string> = {
  matutino:   'Manhã',
  vespertino: 'Tarde',
  noturno:    'Noite',
};

interface ExportarRestricoesProps {
  professores: ProfessorComDados[];
  turnosDaEscola: Turno[];
}

export function ExportarRestricoes({ professores, turnosDaEscola }: ExportarRestricoesProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const handleExport = () => {
    if (!printRef.current) return;

    const printContent = printRef.current.innerHTML;
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return;

    win.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Restrições de Horário — Professores</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 11px;
      color: #1a1a2e;
      background: #fff;
      padding: 24px;
    }

    .print-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 3px solid #4f46e5;
      padding-bottom: 12px;
      margin-bottom: 24px;
    }
    .print-header h1 {
      font-size: 20px;
      font-weight: 900;
      color: #4f46e5;
      letter-spacing: -0.5px;
    }
    .print-header .subtitle {
      font-size: 10px;
      color: #6b7280;
      margin-top: 2px;
    }
    .print-header .date {
      font-size: 10px;
      color: #9ca3af;
      text-align: right;
    }

    /* --- Professor card --- */
    .professor-card {
      break-inside: avoid;
      page-break-inside: avoid;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      margin-bottom: 20px;
      overflow: hidden;
    }

    .prof-header {
      background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
      color: #fff;
      padding: 10px 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .prof-name {
      font-size: 13px;
      font-weight: 800;
      letter-spacing: -0.3px;
    }
    .prof-meta {
      font-size: 9px;
      opacity: 0.85;
      margin-top: 2px;
    }
    .prof-tags {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .tag {
      background: rgba(255,255,255,0.2);
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.3px;
    }

    .prof-body {
      padding: 12px;
    }

    /* --- Seção Livre Docência --- */
    .section-title {
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: #6b7280;
      margin-bottom: 8px;
      padding-bottom: 4px;
      border-bottom: 1px solid #f3f4f6;
    }

    .ld-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 12px;
    }
    .ld-pill {
      background: #ede9fe;
      color: #5b21b6;
      padding: 3px 10px;
      border-radius: 999px;
      font-size: 9px;
      font-weight: 700;
    }
    .sem-preferencia {
      color: #9ca3af;
      font-style: italic;
      font-size: 10px;
    }

    /* --- Dias preferidos --- */
    .dias-grid {
      display: flex;
      gap: 5px;
      flex-wrap: wrap;
      margin-bottom: 12px;
    }
    .dia-pill {
      background: #f3e8ff;
      color: #7c3aed;
      padding: 2px 9px;
      border-radius: 6px;
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
    }

    /* --- Grade de restrições por turno --- */
    .turno-block {
      margin-top: 10px;
    }
    .turno-name {
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: #4f46e5;
      margin-bottom: 6px;
    }

    table.restricoes {
      width: 100%;
      border-collapse: collapse;
      font-size: 9px;
    }
    table.restricoes th {
      background: #f9fafb;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 5px 4px;
      border: 1px solid #e5e7eb;
      text-align: center;
      color: #374151;
    }
    table.restricoes td {
      border: 1px solid #e5e7eb;
      padding: 4px;
      text-align: center;
      height: 26px;
      min-width: 60px;
    }
    table.restricoes td.slot-idx {
      background: #f9fafb;
      font-weight: 700;
      color: #6b7280;
      font-size: 9px;
      text-align: left;
      padding-left: 6px;
    }
    td.ban {
      background: #fef2f2;
    }
    td.plan {
      background: #eff6ff;
    }
    .ban-dot {
      display: inline-block;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #ef4444;
    }
    .plan-dot {
      display: inline-block;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #3b82f6;
    }
    .ban-text {
      font-weight: 800;
      color: #dc2626;
      font-size: 8px;
    }
    .plan-text {
      font-weight: 800;
      color: #2563eb;
      font-size: 8px;
    }
    .livre-text {
      color: #d1d5db;
      font-size: 10px;
    }

    .no-restrictions {
      color: #9ca3af;
      font-style: italic;
      font-size: 10px;
      padding: 8px 0;
    }

    /* --- Legenda --- */
    .legend {
      margin-top: 24px;
      padding: 10px 14px;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      break-inside: avoid;
    }
    .legend-title {
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      color: #6b7280;
      margin-bottom: 6px;
    }
    .legend-items {
      display: flex;
      gap: 20px;
      flex-wrap: wrap;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 10px;
    }

    /* Footer */
    .print-footer {
      margin-top: 28px;
      text-align: center;
      font-size: 9px;
      color: #d1d5db;
      border-top: 1px solid #f3f4f6;
      padding-top: 10px;
    }

    @media print {
      body { padding: 16px; }
      .professor-card { break-inside: avoid; }
    }
  </style>
</head>
<body>
  ${printContent}
  <script>
    window.onload = function() {
      window.print();
      window.onafterprint = function() { window.close(); };
    };
  </script>
</body>
</html>`);
    win.document.close();
  };

  // Renderiza o conteúdo invisível que será clonado para a janela de impressão
  const now = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  return (
    <>
      <Button variant="outline" onClick={handleExport} id="btn-exportar-restricoes" className="gap-2">
        <FileDown className="h-4 w-4" />
        Exportar Restrições (PDF)
      </Button>

      {/* Conteúdo oculto para impressão — renderizado no DOM mas invisível */}
      <div ref={printRef} style={{ display: 'none' }}>
        {/* Cabeçalho */}
        <div className="print-header">
          <div>
            <h1>Restrições de Horário</h1>
            <div className="subtitle">Relatório consolidado de disponibilidades, livre docência e indisponibilidades</div>
          </div>
          <div className="date">Gerado em {now}</div>
        </div>

        {/* Um card por professor */}
        {professores.map((prof) => {
          const temRestricoes = prof.turnos.some((turno) => {
            const restricoesTurno = prof.restricoes?.[turno.id];
            if (!restricoesTurno) return false;
            return turno.dias_semana.some((dia) => {
              const restricoesDia = restricoesTurno[dia];
              if (!restricoesDia) return false;
              return Object.values(restricoesDia).some((v) => v === 'indisponivel' || v === 'planejamento');
            });
          });

          const livreDocencia = prof.livre_docencia || [];
          const diasPreferidos = prof.dias_preferidos || [];

          return (
            <div key={prof.id} className="professor-card">
              {/* Cabeçalho do professor */}
              <div className="prof-header">
                <div>
                  <div className="prof-name">{prof.nome_completo}</div>
                  <div className="prof-meta">
                    {prof.nome_horario}
                    {prof.email ? ` · ${prof.email}` : ''}
                  </div>
                </div>
                <div className="prof-tags">
                  {prof.componentes.map((c) => (
                    <span key={c.id} className="tag">{c.sigla}</span>
                  ))}
                  {prof.turnos.map((t) => (
                    <span key={t.id} className="tag">{t.nome}</span>
                  ))}
                </div>
              </div>

              <div className="prof-body">
                {/* Livre Docência */}
                <div className="section-title">⭐ Livre Docência</div>
                {prof.sem_preferencia_livre_docencia === true ? (
                  <div className="sem-preferencia ld-grid">Sem preferência de livre docência definida</div>
                ) : livreDocencia.length > 0 ? (
                  <div className="ld-grid">
                    {livreDocencia.map((ld, i) => {
                      const diaLabel = DIAS_SEMANA_ORDERED.find((d) => d.id === ld.dia)?.label || ld.dia;
                      const periodoLabel = PERIODOS_LABELS[ld.periodo] || ld.periodo;
                      return (
                        <span key={i} className="ld-pill">
                          {diaLabel} — {periodoLabel}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <div className="sem-preferencia ld-grid">Não configurado</div>
                )}

                {/* Dias Preferidos */}
                {diasPreferidos.length > 0 && (
                  <>
                    <div className="section-title">📅 Dias Preferidos para Concentração</div>
                    <div className="dias-grid">
                      {diasPreferidos.map((dId) => {
                        const diaLabel = DIAS_SEMANA_ORDERED.find((d) => d.id === dId)?.label || dId;
                        return <span key={dId} className="dia-pill">{diaLabel}</span>;
                      })}
                    </div>
                  </>
                )}

                {/* Grade de restrições por turno */}
                <div className="section-title">🚫 Indisponibilidades e Planejamento</div>
                {!temRestricoes ? (
                  <div className="no-restrictions">Nenhuma restrição cadastrada</div>
                ) : (
                  prof.turnos.map((turno) => {
                    // Checar se este turno tem alguma restrição
                    const restricoesTurno = prof.restricoes?.[turno.id];
                    const diasDoTurno = DIAS_SEMANA_ORDERED.filter((d) =>
                      turno.dias_semana.includes(d.id)
                    );

                    const temAlgo = diasDoTurno.some((dia) => {
                      const rd = restricoesTurno?.[dia.id];
                      return rd && Object.values(rd).some((v) => v === 'indisponivel' || v === 'planejamento');
                    });

                    if (!temAlgo) return null;

                    return (
                      <div key={turno.id} className="turno-block">
                        <div className="turno-name">{turno.nome}</div>
                        <table className="restricoes">
                          <thead>
                            <tr>
                              <th style={{ width: '60px' }}>Aula</th>
                              {diasDoTurno.map((dia) => (
                                <th key={dia.id}>{dia.label}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {Array.from({ length: turno.aulas_por_dia }).map((_, aulaIdx) => (
                              <tr key={aulaIdx}>
                                <td className="slot-idx">
                                  {aulaIdx + 1}ª
                                  {turno.horarios?.[aulaIdx]?.inicio && (
                                    <span style={{ color: '#9ca3af', marginLeft: 3 }}>
                                      {turno.horarios[aulaIdx].inicio}
                                    </span>
                                  )}
                                </td>
                                {diasDoTurno.map((dia) => {
                                  const val = restricoesTurno?.[dia.id]?.[aulaIdx];
                                  if (val === 'indisponivel') {
                                    return (
                                      <td key={dia.id} className="ban">
                                        <span className="ban-text">✕ INDISPON.</span>
                                      </td>
                                    );
                                  }
                                  if (val === 'planejamento') {
                                    return (
                                      <td key={dia.id} className="plan">
                                        <span className="plan-text">PLAN.</span>
                                      </td>
                                    );
                                  }
                                  return (
                                    <td key={dia.id}>
                                      <span className="livre-text">·</span>
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}

        {/* Legenda */}
        <div className="legend">
          <div className="legend-title">Legenda</div>
          <div className="legend-items">
            <div className="legend-item">
              <span className="ban-dot" />
              <span>Indisponível — professor não pode ter aula neste slot (hard constraint)</span>
            </div>
            <div className="legend-item">
              <span className="plan-dot" />
              <span>Planejamento — slot reservado para planejamento pedagógico (soft constraint)</span>
            </div>
            <div className="legend-item">
              <span style={{ color: '#a78bfa', fontWeight: 800 }}>⭐</span>
              <span>Livre Docência — período de folga preferencial do professor</span>
            </div>
          </div>
        </div>

        {/* Rodapé */}
        <div className="print-footer">
          Sistema de Gestão de Horários · Exportado em {now} · {professores.length} professor(es) listados
        </div>
      </div>
    </>
  );
}
