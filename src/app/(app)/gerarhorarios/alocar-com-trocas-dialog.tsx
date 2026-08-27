'use client';

/**
 * Preencher uma aula vaga escolhendo uma cadeia de trocas de professor.
 *
 * A tela é deliberadamente a mesma experiência do refino de horário: cartões de
 * opção numerados, os passos de cada rota com origem e destino lado a lado, e um
 * botão que só aplica depois de escolhida. O que muda é o conteúdo dos passos —
 * lá origem e destino são horários, aqui são professores.
 *
 * Três escolhas em sequência, e nenhuma delas adivinhada: qual aula está
 * faltando, em qual horário vago ela entra, e qual rota seguir. A segunda
 * existe porque a turma costuma ter mais de um horário vago e a escolha muda o
 * resultado — colocar Matemática na 1ª ou na 7ª aula não dá na mesma.
 */

import { useEffect, useState } from 'react';
import { Loader2, ArrowRight, CheckCircle2, Star, AlertCircle, Users } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
    getVagasDoHorario,
    calcularAlocacao,
    aplicarAlocacao,
    type VagasDaTurma,
    type AulaFaltando,
    type SlotVago,
} from './alocacao-actions';
import type { OpcaoAlocacao, PassoAlocacao, ResultadoAlocacao } from '@/lib/refino-professores';

const DIA_LABEL: Record<string, string> = {
    segunda: 'Segunda', terca: 'Terça', quarta: 'Quarta',
    quinta: 'Quinta', sexta: 'Sexta', sabado: 'Sábado',
};

function PassoCard({ passo }: { passo: PassoAlocacao }) {
    return (
        <div className={cn(
            'rounded-lg border p-3 text-xs space-y-2',
            passo.isPrincipal
                ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-950/30 dark:border-indigo-900'
                : 'bg-muted/50 border-border'
        )}>
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                    {passo.isPrincipal && <Star className="w-3 h-3 text-indigo-500 fill-indigo-400" />}
                    <span className={cn(
                        'font-bold text-[11px] uppercase tracking-wide',
                        passo.isPrincipal ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-600 dark:text-slate-400'
                    )}>
                        {passo.isPrincipal ? 'A aula que estava vaga' : 'Troca de apoio'}
                    </span>
                </div>
                <Badge variant="outline" className="text-[9px] py-0">
                    {DIA_LABEL[passo.dia_semana] ?? passo.dia_semana} · {passo.aula_index + 1}ª
                </Badge>
            </div>

            <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                <div>
                    <span className="text-muted-foreground uppercase text-[9px]">Disciplina</span>
                    <p className="font-semibold text-foreground truncate" title={passo.componente_nome}>
                        {passo.componente_sigla || passo.componente_nome}
                    </p>
                </div>
                <div>
                    <span className="text-muted-foreground uppercase text-[9px]">Turma</span>
                    <p className="font-semibold text-foreground truncate">{passo.turma_nome}</p>
                </div>
            </div>

            <div className="flex items-center gap-2 pt-1 border-t border-current/10">
                <div className="flex-1 bg-red-50 border border-red-100 rounded px-2 py-1 text-center dark:bg-red-950/40 dark:border-red-900">
                    <div className="text-[9px] text-red-400 dark:text-red-500 uppercase font-bold mb-0.5">Estava com</div>
                    <div className="font-bold text-red-700 dark:text-red-400 truncate">
                        {passo.professorDe || 'ninguém'}
                    </div>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 bg-emerald-50 border border-emerald-100 rounded px-2 py-1 text-center dark:bg-emerald-950/40 dark:border-emerald-900">
                    <div className="text-[9px] text-emerald-400 dark:text-emerald-500 uppercase font-bold mb-0.5">Passa a ser</div>
                    <div className="font-bold text-emerald-700 dark:text-emerald-400 truncate">{passo.professorPara}</div>
                </div>
            </div>
        </div>
    );
}

function OpcaoCard({
    opcao, index, selecionada, onClick,
}: { opcao: OpcaoAlocacao; index: number; selecionada: boolean; onClick: () => void }) {
    const principal = opcao.passos.find(p => p.isPrincipal);
    return (
        <div
            onClick={onClick}
            className={cn(
                'border rounded-xl overflow-hidden cursor-pointer transition-all',
                selecionada ? 'border-indigo-500 ring-2 ring-indigo-400/30 shadow-md' : 'border-border hover:border-slate-300'
            )}
        >
            <div className={cn('px-3 py-2 flex items-center justify-between', selecionada ? 'bg-indigo-600' : 'bg-muted')}>
                <div className="flex items-center gap-2">
                    {selecionada
                        ? <CheckCircle2 className="w-4 h-4 text-white" />
                        : <div className="w-4 h-4 rounded-full border-2 border-slate-400" />}
                    <span className={cn('font-bold text-sm', selecionada ? 'text-white' : 'text-slate-700 dark:text-slate-300')}>
                        Opção {index + 1}
                    </span>
                    {principal && (
                        <span className={cn('text-[10px] opacity-80', selecionada ? 'text-indigo-100' : 'text-muted-foreground')}>
                            — {principal.professorPara} assume
                        </span>
                    )}
                </div>
                <span className={cn('text-[10px]', selecionada ? 'text-indigo-100' : 'text-muted-foreground')}>
                    {opcao.qtdMovimentos === 1
                        ? 'sem trocas'
                        : `${opcao.qtdMovimentos - 1} troca(s) · ${opcao.professoresEnvolvidos} professor(es)`}
                </span>
            </div>
            <div className="p-2 space-y-2 bg-background">
                {opcao.passos.map((p, i) => <PassoCard key={i} passo={p} />)}
            </div>
        </div>
    );
}

export function AlocarComTrocasDialog({
    horarioId, turmaNome, aberto, onOpenChange, onAplicado,
}: {
    horarioId: string;
    turmaNome: string | null;
    aberto: boolean;
    onOpenChange: (v: boolean) => void;
    onAplicado: () => void;
}) {
    const { toast } = useToast();
    const [carregando, setCarregando] = useState(false);
    const [vagas, setVagas] = useState<VagasDaTurma[]>([]);
    const [turmaId, setTurmaId] = useState<string | null>(null);
    const [faltaEscolhida, setFaltaEscolhida] = useState<AulaFaltando | null>(null);
    const [slotEscolhido, setSlotEscolhido] = useState<SlotVago | null>(null);
    const [resultado, setResultado] = useState<ResultadoAlocacao | null>(null);
    const [calculando, setCalculando] = useState(false);
    const [opcaoIndex, setOpcaoIndex] = useState(0);
    const [aplicando, setAplicando] = useState(false);

    useEffect(() => {
        if (!aberto) return;
        setCarregando(true);
        setFaltaEscolhida(null);
        setSlotEscolhido(null);
        setResultado(null);
        getVagasDoHorario(horarioId).then(r => {
            setCarregando(false);
            if (r.error || !r.data) {
                toast({ variant: 'destructive', title: 'Não foi possível ler as vagas', description: r.error });
                return;
            }
            setVagas(r.data);
            const alvo = r.data.find(v => v.turma_nome === turmaNome) ?? r.data[0];
            setTurmaId(alvo?.turma_id ?? null);
        });
    }, [aberto, horarioId, turmaNome, toast]);

    const turma = vagas.find(v => v.turma_id === turmaId) ?? null;

    const calcular = async (falta: AulaFaltando, slot: SlotVago) => {
        setCalculando(true);
        setResultado(null);
        const r = await calcularAlocacao(horarioId, {
            turma_id: turma!.turma_id,
            componente_id: falta.componente_id,
            tipo: falta.tipo,
            dia_semana: slot.dia_semana,
            aula_index: slot.aula_index,
        });
        setCalculando(false);
        if (r.error) {
            toast({ variant: 'destructive', title: 'Erro ao calcular', description: r.error });
            return;
        }
        setResultado(r.data ?? null);
        setOpcaoIndex(0);
    };

    const aplicar = async () => {
        if (!resultado || resultado.status !== 'opcoes') return;
        const opcao = resultado.opcoes[opcaoIndex];
        if (!opcao) return;
        setAplicando(true);
        const r = await aplicarAlocacao(horarioId, opcao.movimentos);
        setAplicando(false);
        if (r.error) {
            toast({ variant: 'destructive', title: 'Erro ao aplicar', description: r.error });
            return;
        }
        toast({ title: 'Aula alocada', description: 'A grade foi atualizada com as trocas escolhidas.' });
        onAplicado();
        onOpenChange(false);
    };

    return (
        <Dialog open={aberto} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" /> Alocar com trocas
                    </DialogTitle>
                    <DialogDescription>
                        Outro professor habilitado assume a aula que ficou vaga, e quem ficou sem ela recebe uma
                        aula equivalente — direto ou por uma cadeia de trocas. Nada é gravado até você confirmar.
                    </DialogDescription>
                </DialogHeader>

                {carregando && (
                    <div className="flex items-center justify-center py-10 text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin mr-2" /> lendo as vagas...
                    </div>
                )}

                {!carregando && vagas.length === 0 && (
                    <div className="py-10 text-center text-sm text-muted-foreground">
                        Nenhuma turma deste horário está com aula faltando.
                    </div>
                )}

                {!carregando && turma && (
                    <div className="space-y-5">
                        {vagas.length > 1 && (
                            <div className="flex flex-wrap gap-2">
                                {vagas.map(v => (
                                    <Button
                                        key={v.turma_id}
                                        size="sm"
                                        variant={v.turma_id === turmaId ? 'default' : 'outline'}
                                        onClick={() => {
                                            setTurmaId(v.turma_id);
                                            setFaltaEscolhida(null);
                                            setSlotEscolhido(null);
                                            setResultado(null);
                                        }}
                                    >
                                        {v.turma_nome}
                                    </Button>
                                ))}
                            </div>
                        )}

                        <div>
                            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
                                1. Qual aula ficou faltando
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {turma.faltando.map(f => (
                                    <button
                                        key={`${f.componente_id}|${f.tipo}`}
                                        type="button"
                                        onClick={() => { setFaltaEscolhida(f); setSlotEscolhido(null); setResultado(null); }}
                                        className={cn(
                                            'text-left border rounded-lg p-2.5 text-xs transition-colors',
                                            faltaEscolhida?.componente_id === f.componente_id && faltaEscolhida?.tipo === f.tipo
                                                ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30'
                                                : 'hover:bg-muted/50'
                                        )}
                                    >
                                        <p className="font-semibold">{f.componente_nome}</p>
                                        <p className="text-muted-foreground">
                                            {f.professor_nome} · {f.quantidade} aula(s) de fora
                                            {f.tipo === 'nao_presencial' ? ' · NP' : ''}
                                        </p>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {faltaEscolhida && (
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
                                    2. Em qual horário vago dela
                                </p>
                                {turma.slotsVagos.length === 0 ? (
                                    <p className="text-xs text-muted-foreground italic border border-dashed rounded-lg p-3">
                                        Esta turma não tem nenhum horário vago — a grade dela está cheia. A aula que
                                        falta só cabe abrindo espaço, o que é trabalho do refino de horário.
                                    </p>
                                ) : (
                                    <div className="flex flex-wrap gap-2">
                                        {turma.slotsVagos.map(s => (
                                            <button
                                                key={`${s.dia_semana}|${s.aula_index}`}
                                                type="button"
                                                onClick={() => { setSlotEscolhido(s); calcular(faltaEscolhida, s); }}
                                                className={cn(
                                                    'border rounded-lg px-3 py-2 text-xs transition-colors',
                                                    slotEscolhido?.dia_semana === s.dia_semana && slotEscolhido?.aula_index === s.aula_index
                                                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30'
                                                        : 'hover:bg-muted/50'
                                                )}
                                            >
                                                <span className="font-semibold">
                                                    {DIA_LABEL[s.dia_semana] ?? s.dia_semana} · {s.aula_index + 1}ª
                                                </span>
                                                {s.inicio && <span className="block text-[10px] text-muted-foreground">{s.inicio}–{s.fim}</span>}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {calculando && (
                            <div className="flex items-center justify-center py-8 text-muted-foreground">
                                <Loader2 className="h-5 w-5 animate-spin mr-2" /> procurando rotas de troca...
                            </div>
                        )}

                        {resultado && resultado.status === 'bloqueado' && (
                            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex gap-3">
                                <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                                <p className="text-sm text-destructive leading-relaxed">{resultado.mensagem}</p>
                            </div>
                        )}

                        {resultado && resultado.status === 'opcoes' && (
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
                                    3. Escolha a rota
                                </p>
                                <p className="text-xs text-muted-foreground mb-3">{resultado.mensagem}</p>
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                    {resultado.opcoes.map((o, i) => (
                                        <OpcaoCard
                                            key={o.id}
                                            opcao={o}
                                            index={i}
                                            selecionada={i === opcaoIndex}
                                            onClick={() => setOpcaoIndex(i)}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>
                    <Button
                        onClick={aplicar}
                        disabled={!resultado || resultado.status !== 'opcoes' || aplicando || calculando}
                    >
                        {aplicando && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        Aplicar rota escolhida
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
