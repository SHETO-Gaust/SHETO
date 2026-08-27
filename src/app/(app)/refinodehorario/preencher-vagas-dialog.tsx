'use client';

/**
 * "Preencher vagas" — um clique que tenta encaixar tudo que ficou de fora.
 *
 * A tela mostra o PLANO antes de gravar, e não um "pronto!" depois. O plano
 * costuma deslocar meia dúzia de aulas que já estavam certas, em turmas que o
 * coordenador já revisou; entregar isso como fato consumado é o jeito mais
 * rápido de a escola desligar a automação e voltar a fazer tudo à mão.
 *
 * E quando não dá, o motivo aparece com o mesmo destaque do plano. "Não foi
 * possível" sem explicação joga para a pessoa o trabalho de refazer a conta na
 * mão — exatamente o trabalho que esta tela existe para poupar.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
    AlertTriangle,
    ArrowRight,
    Check,
    Loader2,
    MoveRight,
    Sparkles,
    Wand2,
} from 'lucide-react';
import {
    calcularPreenchimentoDeVagas,
    aplicarPreenchimentoDeVagas,
} from '../gerarhorarios/alocacao-actions';
import type { PassoPreenchimento, ResultadoPreenchimento } from '@/lib/preencher-vagas';

const DIA_LABELS: Record<string, string> = {
    segunda: 'Segunda', terca: 'Terça', quarta: 'Quarta',
    quinta: 'Quinta', sexta: 'Sexta', sabado: 'Sábado',
};

const rotuloSlot = (dia: string, slot: number) => `${DIA_LABELS[dia] ?? dia} · ${slot + 1}ª`;

/** Um passo do plano: ou uma aula que anda, ou a aula que finalmente nasce. */
function PassoLinha({ passo }: { passo: PassoPreenchimento }) {
    const nascimento = passo.acao === 'criar';

    return (
        <div
            className={cn(
                'flex items-center gap-3 rounded-md border p-3 text-sm',
                nascimento
                    ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40'
                    : 'bg-background',
            )}
        >
            <div
                className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                    nascimento
                        ? 'bg-emerald-600 text-white'
                        : 'bg-muted text-muted-foreground',
                )}
            >
                {nascimento ? <Sparkles className="h-3.5 w-3.5" /> : <MoveRight className="h-3.5 w-3.5" />}
            </div>

            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="font-mono text-[11px]">{passo.turma_nome}</Badge>
                    <span className="font-semibold">{passo.componente_sigla || passo.componente_nome}</span>
                    <span className="text-xs text-muted-foreground">{passo.professor_nome}</span>
                </div>

                <div className="mt-1 flex items-center gap-2 text-xs">
                    {nascimento ? (
                        <span className="font-medium text-emerald-700 dark:text-emerald-400">
                            entra em {rotuloSlot(passo.destinoDia, passo.destinoSlot)} — era esta a aula que faltava
                        </span>
                    ) : (
                        <>
                            <span className="text-muted-foreground">
                                {rotuloSlot(passo.origemDia!, passo.origemSlot!)}
                            </span>
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            <span className="font-medium">{rotuloSlot(passo.destinoDia, passo.destinoSlot)}</span>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export function PreencherVagasDialog({
    horarioId,
    aoAplicar,
}: {
    horarioId: string;
    /** Recarrega a grade da tela: o plano mexeu em aulas que ela está mostrando. */
    aoAplicar: () => void;
}) {
    const { toast } = useToast();
    const [aberto, setAberto] = useState(false);
    const [calculando, setCalculando] = useState(false);
    const [aplicando, setAplicando] = useState(false);
    const [resultado, setResultado] = useState<ResultadoPreenchimento | null>(null);

    const calcular = async () => {
        setAberto(true);
        setResultado(null);
        setCalculando(true);
        const r = await calcularPreenchimentoDeVagas(horarioId);
        setCalculando(false);
        if (r.error) {
            toast({ variant: 'destructive', title: 'Não foi possível calcular', description: r.error });
            setAberto(false);
            return;
        }
        setResultado(r.data ?? null);
    };

    const aplicar = async () => {
        if (!resultado || resultado.movimentos.length === 0) return;
        setAplicando(true);
        const r = await aplicarPreenchimentoDeVagas(horarioId, resultado.movimentos);
        setAplicando(false);
        if (r.error) {
            toast({ variant: 'destructive', title: 'Nada foi gravado', description: r.error });
            return;
        }
        toast({
            title: 'Horário atualizado',
            description: `${resultado.resolvidas} aula(s) encaixada(s).`,
        });
        setAberto(false);
        setResultado(null);
        aoAplicar();
    };

    const temPlano = !!resultado && resultado.movimentos.length > 0;

    return (
        <>
            <Button variant="outline" onClick={calcular} disabled={!horarioId}>
                <Wand2 className="mr-2 h-4 w-4" />
                Preencher vagas
            </Button>

            <Dialog open={aberto} onOpenChange={o => { if (!aplicando) setAberto(o); }}>
                <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Preencher as aulas que ficaram de fora</DialogTitle>
                        <DialogDescription>
                            O sistema procura, para cada aula pendente, uma cadeia de remanejamentos que abra
                            lugar para ela sem quebrar restrição de professor nem amontoar a disciplina no dia.
                        </DialogDescription>
                    </DialogHeader>

                    {calculando && (
                        <div className="flex items-center justify-center gap-3 py-12 text-muted-foreground">
                            <Loader2 className="h-5 w-5 animate-spin" />
                            Procurando as cadeias possíveis…
                        </div>
                    )}

                    {resultado && !calculando && (
                        <div className="space-y-4">
                            <div
                                className={cn(
                                    'rounded-md border p-3 text-sm',
                                    temPlano
                                        ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40'
                                        : 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40',
                                )}
                            >
                                {resultado.mensagem}
                            </div>

                            {temPlano && (
                                <div className="space-y-2">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                        O que vai mudar
                                    </p>
                                    {resultado.passos.map(p => (
                                        <PassoLinha key={`${p.ordem}`} passo={p} />
                                    ))}
                                </div>
                            )}

                            {resultado.falhas.length > 0 && (
                                <div className="space-y-2">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                        {temPlano ? 'O que ainda não coube' : 'Por que não coube'}
                                    </p>
                                    {resultado.falhas.map((f, i) => (
                                        <div
                                            key={i}
                                            className="rounded-md border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900 dark:bg-amber-950/30"
                                        >
                                            <div className="flex items-center gap-2">
                                                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
                                                <span className="text-sm font-semibold">
                                                    {f.turma_nome} · {f.componente_nome}
                                                </span>
                                                <span className="text-xs text-muted-foreground">{f.professor_nome}</span>
                                            </div>
                                            <p className="mt-2 text-sm">{f.motivo}</p>
                                            <ul className="mt-2 space-y-1">
                                                {f.detalhes.map((d, j) => (
                                                    <li key={j} className="text-xs text-muted-foreground">· {d}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setAberto(false)} disabled={aplicando}>
                            Fechar
                        </Button>
                        <Button onClick={aplicar} disabled={!temPlano || aplicando}>
                            {aplicando
                                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Gravando…</>
                                : <><Check className="mr-2 h-4 w-4" /> Aplicar o plano</>}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
