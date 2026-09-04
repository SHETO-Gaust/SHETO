
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertCircle, Info, Ban, Users2, Star, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const DIAS_LABELS: Record<string, string> = {
    segunda: 'Seg', terca: 'Ter', quarta: 'Qua', quinta: 'Qui', sexta: 'Sex', sabado: 'Sáb'
};

const DIAS_LONGOS: Record<string, string> = {
    segunda: 'Segunda', terca: 'Terça', quarta: 'Quarta', quinta: 'Quinta', sexta: 'Sexta', sabado: 'Sábado'
};

/** Os três impedimentos que o motor nunca relaxa, na mesma ordem do certificado. */
const MOTIVOS = [
    { id: 'indisponivel',  label: 'Bloqueio',         icon: Ban,    color: 'text-red-600 dark:text-red-400' },
    { id: 'reuniao_fluxo', label: 'Planejamento coletivo', icon: Users2, color: 'text-purple-600 dark:text-purple-400' },
    { id: 'livre_docencia',label: 'Livre docência',   icon: Star,   color: 'text-amber-600 dark:text-amber-400' },
] as const;

const MOTIVO_LABEL: Record<string, string> = {
    indisponivel: 'Bloqueio', reuniao_fluxo: 'Planejamento coletivo', livre_docencia: 'Livre docência'
};

export function BottleneckReport({ data }: { data: any }) {
  const {
    heatmap, numTurmas, turnoNome, verificacoes = [],
    turmasSemFolga = 0, totalProfessoresTurno = 0, professoresVinculados = 0, capacidade = 0,
  } = data;

  return (
    <TooltipProvider delayDuration={150}>
    <div className="space-y-6">
      <Alert className="bg-primary/5 border-primary/20">
        <Info className="h-4 w-4 text-primary" />
        <AlertTitle className="font-bold text-primary">Como ler este mapa?</AlertTitle>
        <AlertDescription className="text-sm space-y-2">
          <p>
            Cada célula mostra <strong>quantas das suas {numTurmas} turmas conseguem ter aula ao mesmo tempo</strong>{' '}
            naquele horário do turno <strong>{turnoNome}</strong> — não quantos professores estão livres. A diferença
            importa: cinco professores livres que lecionam todos na mesma turma atendem <em>uma</em> turma, não cinco.
            Células em <span className="text-destructive font-bold">vermelho</span> não fecham sem ajustes no cadastro.
          </p>
          <p>
            Entram na conta como <strong>impossibilitadores</strong> — exatamente como no gerador, que nunca os
            ignora — <strong>bloqueio (indisponível)</strong>, <strong>planejamento coletivo</strong> e{' '}
            <strong>livre docência</strong> (na livre docência o <em>período inteiro</em> fica vedado, não só a aula
            marcada). <strong>Planejamento</strong> não é impedimento: o motor pode invadi-lo como último recurso, e
            por isso aparece à parte.
          </p>
          <p>
            Os selos de impedimento contam apenas professores que lecionam em turma deste turno — os únicos que
            mudam o resultado. Por isso <strong>{professoresVinculados} com turma no turno</strong> menos os selos dá
            exatamente o número de professores aptos mostrado na célula.
          </p>
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Turmas no turno" value={numTurmas} hint={`${capacidade} horários por turma`} />
        <StatCard label="Turmas sem folga" value={turmasSemFolga} hint="precisam de aula em todos os horários" alert={turmasSemFolga > 0} />
        <StatCard label="Professores no turno" value={totalProfessoresTurno} />
        <StatCard label="Com turma no turno" value={professoresVinculados} hint="os únicos que cobrem horário" alert={professoresVinculados < numTurmas} />
      </div>

      {verificacoes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Verificações</CardTitle>
            <CardDescription>O que está derrubando a contagem de professores disponíveis.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {verificacoes.map((v: any, i: number) => {
              const Icon = v.tipo === 'erro' ? XCircle : v.tipo === 'alerta' ? AlertTriangle : CheckCircle2;
              return (
                <div
                  key={i}
                  className={cn(
                    "flex gap-3 rounded-lg border p-4",
                    v.tipo === 'erro' ? "border-destructive/30 bg-destructive/5" :
                    v.tipo === 'alerta' ? "border-amber-300 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20" :
                    "border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20"
                  )}
                >
                  <Icon className={cn(
                    "h-5 w-5 shrink-0 mt-0.5",
                    v.tipo === 'erro' ? "text-destructive" :
                    v.tipo === 'alerta' ? "text-amber-600 dark:text-amber-400" :
                    "text-green-600 dark:text-green-400"
                  )} />
                  <div className="space-y-1">
                    <p className="font-bold text-sm leading-snug">{v.titulo}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{v.detalhe}</p>
                    {v.acao && (
                      <p className="text-xs font-semibold text-foreground/80 pt-1">→ {v.acao}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Mapa de Disponibilidade Docente</CardTitle>
          <CardDescription>
            Gargalos por horário, considerando bloqueio, planejamento coletivo e livre docência. Passe o mouse na célula
            para ver quem foi impedido.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            {MOTIVOS.map(m => (
              <span key={m.id} className="flex items-center gap-1.5">
                <m.icon className={cn("h-3.5 w-3.5", m.color)} /> {m.label}
              </span>
            ))}
          </div>

          <div className="rounded-xl border overflow-hidden bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="p-4 text-left border-r w-32 font-bold">Horário</th>
                    {heatmap.map((d: any) => (
                      <th key={d.dia} className="p-4 text-center font-bold">{DIAS_LABELS[d.dia] || d.dia}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {heatmap[0]?.slots.map((_: any, aulaIdx: number) => (
                    <tr key={aulaIdx} className="border-b last:border-0">
                      <td className="p-4 font-bold bg-muted/20 border-r">{aulaIdx + 1}ª Aula</td>
                      {heatmap.map((d: any) => {
                        const slot = d.slots[aulaIdx];
                        const isCritical = slot.conflito;
                        const totalImpedidos = MOTIVOS.reduce((s, m) => s + (slot.porMotivo?.[m.id] || 0), 0);
                        const selo = slot.impossivel ? 'IMPOSSÍVEL'
                            : slot.concentracao ? 'CONCENTRADO'
                            : `FALTA ${slot.necessarios - slot.atendiveis}`;

                        return (
                          <td key={d.dia} className={cn("p-2 text-center align-top transition-colors", isCritical ? "bg-destructive/10" : "bg-green-50/30 dark:bg-green-950/10")}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className={cn(
                                    "flex flex-col items-center justify-center gap-0.5 p-2 rounded-lg border shadow-sm cursor-help",
                                    slot.impossivel ? "border-destructive bg-background ring-1 ring-destructive/30" :
                                    isCritical ? "border-destructive/30 bg-background" :
                                    "border-green-200 bg-background dark:border-green-900"
                                )}>
                                    <span className={cn("text-lg font-black leading-none", isCritical ? "text-destructive" : "text-green-700 dark:text-green-400")}>
                                        {slot.atendiveis}
                                    </span>
                                    <span className="text-[9px] uppercase font-bold text-muted-foreground tracking-tighter">
                                        Turmas / {slot.necessarios}
                                    </span>
                                    <span className="text-[9px] text-muted-foreground tracking-tighter">
                                        {slot.aptos} prof. aptos
                                    </span>

                                    {totalImpedidos > 0 && (
                                      <div className="mt-1 flex items-center justify-center gap-1.5 flex-wrap">
                                        {MOTIVOS.map(m => {
                                          const n = slot.porMotivo?.[m.id] || 0;
                                          if (!n) return null;
                                          return (
                                            <span key={m.id} className={cn("flex items-center gap-0.5 text-[9px] font-bold", m.color)}>
                                              <m.icon className="h-2.5 w-2.5" />{n}
                                            </span>
                                          );
                                        })}
                                      </div>
                                    )}

                                    {slot.planejamento > 0 && (
                                      <span className="text-[9px] font-semibold text-blue-600 dark:text-blue-400">
                                        +{slot.planejamento} em planejamento
                                      </span>
                                    )}

                                    {isCritical && (
                                        <div className="mt-1 flex items-center gap-1 text-[9px] font-black text-destructive">
                                            <AlertCircle className="h-2 w-2" />
                                            {selo}
                                        </div>
                                    )}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="right" className="max-w-xs">
                                <SlotDetalhe dia={d.dia} slot={slot} />
                              </TooltipContent>
                            </Tooltip>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
    </TooltipProvider>
  );
}

function StatCard({ label, value, hint, alert }: { label: string; value: number; hint?: string; alert?: boolean }) {
  return (
    <div className={cn("rounded-lg border p-3", alert && "border-amber-300 dark:border-amber-900")}>
      <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{label}</p>
      <p className="text-2xl font-black">{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground leading-tight">{hint}</p>}
    </div>
  );
}

function SlotDetalhe({ dia, slot }: { dia: string; slot: any }) {
  return (
    <div className="space-y-2 text-xs">
      <p className="font-bold">{DIAS_LONGOS[dia] || dia}, {slot.aula}ª aula</p>
      <p>
        <strong>{slot.atendiveis}</strong> de {slot.necessarios} turmas conseguem ter aula ao mesmo tempo aqui,
        com <strong>{slot.aptos}</strong> professor(es) aptos.
      </p>
      {slot.concentracao && (
        <p className="text-destructive font-semibold">
          Há professores livres em número suficiente, mas eles lecionam nas mesmas turmas — não dá para dar um
          professor diferente a cada uma.
        </p>
      )}
      {slot.semImpedimentoNoTurno !== slot.aptos && (
        <p className="text-muted-foreground">
          Outros {slot.semImpedimentoNoTurno - slot.aptos} estão sem impedimento, mas não lecionam em turma deste turno.
        </p>
      )}
      {slot.impedidos?.length > 0 ? (
        <div className="space-y-0.5">
          <p className="font-semibold">Impedidos neste horário:</p>
          <ul className="space-y-0.5">
            {slot.impedidos.map((i: any, k: number) => (
              <li key={k}>• {i.nome} — {MOTIVO_LABEL[i.motivo] || i.motivo}</li>
            ))}
            {slot.impedidosOcultos > 0 && (
              <li className="text-muted-foreground">…e mais {slot.impedidosOcultos}</li>
            )}
          </ul>
        </div>
      ) : (
        <p className="text-muted-foreground">Nenhum professor com turma neste turno está impedido aqui.</p>
      )}
      {slot.planejamento > 0 && (
        <p className="text-muted-foreground">
          {slot.planejamento} em planejamento — não conta como impedimento, mas o motor só usa em último recurso.
        </p>
      )}
    </div>
  );
}
