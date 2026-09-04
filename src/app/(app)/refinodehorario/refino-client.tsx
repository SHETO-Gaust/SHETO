'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { getDadosRefinoHorario, aplicarMudancasRefino } from './actions';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, CheckCircle2, ArrowRightLeft, Check, ArrowRight, Star, MoveRight, Maximize2, Lock, Info } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import {
    analisarMovimento,
    analisarTroca,
    type ContextoRefino,
    type ImpactoAnalise,
    type AulaRefino,
    type Move,
    type PassoDetalhado,
    type ProfessorRefino,
    type ResultadoTroca,
} from '@/lib/refino-horario';
import { chaveProfessor } from '@/lib/refino/professor';
import {
    rotuloDoStatus,
    SEM_REFERENCIA,
    type GradeCandidata,
    type ReferenciaResolvida,
} from '@/lib/refino/grades-de-referencia';
import { PreencherVagasDialog } from './preencher-vagas-dialog';
import { useToast } from '@/hooks/use-toast';
import type { Turno } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type RefinoClientProps = {
  escolaId: string;
  horariosParaRefino: GradeCandidata[];
};

const DIAS: string[] = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
const DIA_LABELS: Record<string, string> = { segunda: 'Segunda', terca: 'Terça', quarta: 'Quarta', quinta: 'Quinta', sexta: 'Sexta', sabado: 'Sábado' };
const DIA_SHORT: Record<string, string> = { segunda: 'Seg', terca: 'Ter', quarta: 'Qua', quinta: 'Qui', sexta: 'Sex', sabado: 'Sáb' };

function ordinal(n: number) { return `${n}ª`; }

/**
 * A aula é deste professor?
 *
 * Compara pela identidade da PESSOA (o CPF), não pelo id do cadastro: nas
 * grades de referência ele pode aparecer por outro cadastro com o mesmo CPF, e
 * é justamente essa aula que precisa aparecer na agenda dele — é ela que
 * denuncia o choque entre turnos.
 */
function professorEmFoco(aula: AulaRefino, professorId: string, professores: ProfessorRefino[]): boolean {
    if (!professorId) return false;
    if (aula.professor_id === professorId) return true;
    const escolhido = professores.find(p => p.id === professorId);
    const chave = chaveProfessor(professorId, escolhido?.cpf);
    return !!chave && chaveProfessor(aula.professor_id, aula.professor_cpf) === chave;
}

/**
 * A aula escolhida levanta da grade e é puxada na direção do cursor.
 *
 * Serve para não perder de vista o que está selecionado numa grade de cinco
 * colunas por dez linhas — e porque mover aula devia ser uma coisa gostosa de
 * fazer.
 *
 * O transform é escrito direto no nó, fora do React: o mouse dispara dezenas de
 * eventos por segundo e re-renderizar a grade inteira a cada um deles engasgaria
 * a tela. `requestAnimationFrame` limita a uma escrita por quadro, e a transição
 * curta no CSS dá o atraso que faz o cartão parecer preso por um elástico em vez
 * de grudado no ponteiro.
 *
 * Quem pediu para reduzir animação no sistema não recebe nada disso.
 */
function useImaDoCursor(ativo: boolean) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const semAnimacao = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (!ativo || semAnimacao) {
      el.style.transform = '';
      return;
    }

    /** Distância em que o ímã deixa de puxar. */
    const ALCANCE = 240;
    /** O quanto o cartão anda, no máximo. */
    const PUXAO = 7;

    let quadro = 0;
    const seguir = (e: MouseEvent) => {
      if (quadro) return;
      quadro = requestAnimationFrame(() => {
        quadro = 0;
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        const dist = Math.hypot(dx, dy) || 1;
        // Perto puxa forte, longe não puxa: é o que dá a sensação de campo.
        const forca = Math.max(0, 1 - dist / ALCANCE);
        const x = (dx / dist) * PUXAO * forca;
        const y = (dy / dist) * PUXAO * forca - 3 * forca;
        const giro = (dx / ALCANCE) * 2.5 * forca;
        el.style.transform =
          `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${(1 + 0.05 * forca).toFixed(3)}) rotate(${giro.toFixed(2)}deg)`;
      });
    };

    window.addEventListener('mousemove', seguir);
    return () => {
      window.removeEventListener('mousemove', seguir);
      if (quadro) cancelAnimationFrame(quadro);
      el.style.transform = '';
    };
  }, [ativo]);

  return ref;
}

/** Uma aula desenhada na grade. */
function CartaoAula({
  aula,
  modo,
  elevada,
}: {
  aula: AulaRefino;
  modo: 'professor' | 'turma' | 'slot';
  /** Escolhida como origem ou como a outra ponta da troca. */
  elevada: boolean;
}) {
  const ref = useImaDoCursor(elevada);
  const referencia = aula.movel === false;

  return (
    <div
      ref={ref}
      style={{ willChange: elevada ? 'transform' : undefined }}
      className={cn(
        'border rounded flex flex-col items-center justify-center p-1 w-full h-full relative',
        'transition-[transform,box-shadow] duration-150 ease-out',
        referencia
          ? 'bg-muted border-dashed border-muted-foreground/30 text-muted-foreground'
          : aula.tipo === 'presencial'
            ? 'bg-primary/10 hover:bg-primary/20 border-primary/20 text-primary'
            : 'bg-orange-500/10 hover:bg-orange-500/20 border-orange-500/20 text-orange-600 dark:text-orange-400',
        elevada && 'z-20 shadow-lg shadow-indigo-500/25 ring-1 ring-current/30',
      )}
      title={referencia ? `${aula.componente_nome} — ${aula.turma_nome} (${aula.horario_nome || 'outra grade'})` : undefined}
    >
      {referencia && <Lock className="w-2.5 h-2.5 absolute top-1 right-1 opacity-60" />}
      <span className="text-[11px] font-bold leading-tight">{aula.componente_sigla || aula.componente_nome}</span>
      <span className="text-[9px] opacity-70 line-clamp-1">
        {modo === 'turma' ? aula.professor_nome : aula.turma_nome} • {aula.tipo === 'nao_presencial' ? 'NP' : 'P'}
      </span>
    </div>
  );
}

// ─── Rich move card displayed inside each option ────────────────────────────
function PassoCard({ passo, turnosById }: { passo: PassoDetalhado; turnosById: Map<string, Turno> }) {
    const origemTurno = turnosById.get(passo.destinoTurnoId); // same turno for origin (same physical shift)
    const origemHor = origemTurno?.horarios?.[passo.origemSlot];
    const destHor = origemTurno?.horarios?.[passo.destinoSlot];

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
                        {passo.isPrincipal ? 'Aula principal' : 'Movimento de apoio'}
                    </span>
                </div>
                <Badge
                    variant="outline"
                    className={cn(
                        'text-[9px] py-0',
                        passo.tipo === 'nao_presencial'
                            ? 'border-orange-300 text-orange-700 bg-orange-50 dark:border-orange-800 dark:text-orange-400 dark:bg-orange-950/30'
                            : 'border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-400'
                    )}
                >
                    {passo.tipo === 'nao_presencial' ? 'Não presencial' : 'Presencial'}
                </Badge>
            </div>

            {/* Discipline + class + teacher */}
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
                <div className="col-span-2">
                    <span className="text-muted-foreground uppercase text-[9px]">Professor</span>
                    <p className="font-semibold text-foreground truncate">{passo.professor_nome}</p>
                </div>
            </div>

            {/* Origin → Destination row */}
            <div className="flex items-center gap-2 pt-1 border-t border-current/10">
                <div className="flex-1 bg-red-50 border border-red-100 rounded px-2 py-1 text-center dark:bg-red-950/40 dark:border-red-900">
                    <div className="text-[9px] text-red-400 dark:text-red-500 uppercase font-bold mb-0.5">Origem</div>
                    <div className="font-bold text-red-700 dark:text-red-400">{DIA_SHORT[passo.origemDia]} {ordinal(passo.origemSlot + 1)}</div>
                    {origemHor && (
                        <div className="text-[9px] text-red-500 dark:text-red-400">{origemHor.inicio}–{origemHor.fim}</div>
                    )}
                </div>
                <MoveRight className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 bg-emerald-50 border border-emerald-100 rounded px-2 py-1 text-center dark:bg-emerald-950/40 dark:border-emerald-900">
                    <div className="text-[9px] text-emerald-400 dark:text-emerald-500 uppercase font-bold mb-0.5">Destino</div>
                    <div className="font-bold text-emerald-700 dark:text-emerald-400">{DIA_SHORT[passo.destinoDia]} {ordinal(passo.destinoSlot + 1)}</div>
                    {destHor && (
                        <div className="text-[9px] text-emerald-500 dark:text-emerald-400">{destHor.inicio}–{destHor.fim}</div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Single option card ──────────────────────────────────────────────────────
function OpcaoCard({
    possibilidade,
    index,
    isSelected,
    turnosById,
    onClick,
}: {
    possibilidade: { id: string; moves: any[]; passos: PassoDetalhado[]; impactoTurmas: number; impactoProfessores: number; qtdMovimentos: number };
    index: number;
    isSelected: boolean;
    turnosById: Map<string, Turno>;
    onClick: () => void;
}) {
    const principal = possibilidade.passos.find(p => p.isPrincipal);

    return (
        <div
            onClick={onClick}
            className={cn(
                'border rounded-xl overflow-hidden cursor-pointer transition-all',
                isSelected
                    ? 'border-indigo-500 ring-2 ring-indigo-400/30 shadow-md'
                    : 'border-border hover:border-slate-300 hover:shadow-sm'
            )}
        >
            {/* Header */}
            <div className={cn(
                'px-3 py-2 flex items-center justify-between',
                isSelected ? 'bg-indigo-600' : 'bg-muted'
            )}>
                <div className="flex items-center gap-2">
                    {isSelected
                        ? <CheckCircle2 className="w-4 h-4 text-white" />
                        : <div className="w-4 h-4 rounded-full border-2 border-slate-400" />
                    }
                    <span className={cn('font-bold text-sm', isSelected ? 'text-white' : 'text-slate-700 dark:text-slate-300')}>
                        Opção {index + 1}
                    </span>
                    {principal && (
                        <span className={cn('text-[10px] opacity-80', isSelected ? 'text-indigo-100' : 'text-muted-foreground')}>
                            — Move para {DIA_SHORT[principal.destinoDia]} {ordinal(principal.destinoSlot + 1)}
                        </span>
                    )}
                </div>
                <Badge
                    className={cn(
                        'text-[10px] font-bold',
                        isSelected
                            ? 'bg-indigo-500 text-white border-indigo-400'
                            : 'bg-slate-200 text-slate-600 border-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600'
                    )}
                    variant="outline"
                >
                    {possibilidade.qtdMovimentos} {possibilidade.qtdMovimentos === 1 ? 'mov.' : 'movs.'}
                </Badge>
            </div>

            {/* Moves */}
            <div className="p-3 space-y-2 bg-background">
                {possibilidade.passos.map((passo, i) => (
                    <PassoCard key={i} passo={passo} turnosById={turnosById} />
                ))}

                {/* Summary row */}
                <div className="flex items-center gap-3 pt-2 border-t text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                        <span className="font-bold text-slate-700">{possibilidade.impactoTurmas}</span> turma{possibilidade.impactoTurmas !== 1 ? 's' : ''}
                    </span>
                    <span className="text-muted-foreground/60">•</span>
                    <span className="flex items-center gap-1">
                        <span className="font-bold text-slate-700">{possibilidade.impactoProfessores}</span> professor{possibilidade.impactoProfessores !== 1 ? 'es' : ''}
                    </span>
                    <span className="text-muted-foreground/60">•</span>
                    <span className="text-emerald-600 font-semibold">Sem conflitos</span>
                </div>
            </div>
        </div>
    );
}

// ─── Main client component ───────────────────────────────────────────────────
export function RefinoClient({ escolaId, horariosParaRefino }: RefinoClientProps) {
    const { toast } = useToast();
    const [horarioId, setHorarioId] = useState<string>('');
    const [professorId, setProfessorId] = useState<string>('');

    const [loadingData, setLoadingData] = useState(false);
    /** Aulas da grade aberta: as únicas que podem ser movidas ou trocadas. */
    const [aulasMoveis, setAulasMoveis] = useState<AulaRefino[]>([]);
    /**
     * Aulas das outras grades escolhidas como referência — uma por turno.
     *
     * Elas não se movem: existem para o cálculo saber que o professor já está em
     * sala naquele instante, mesmo que seja num turno de nome diferente que
     * começa na mesma hora. Era o que faltava para o Integral e o Matutino se
     * enxergarem.
     */
    const [aulasReferencia, setAulasReferencia] = useState<AulaRefino[]>([]);
    const [professores, setProfessores] = useState<ProfessorRefino[]>([]);
    const [turmas, setTurmas] = useState<{id: string, nome: string}[]>([]);
    const [turnos, setTurnos] = useState<Turno[]>([]);
    const [referenciasResolvidas, setReferenciasResolvidas] = useState<ReferenciaResolvida[]>([]);
    const [avisos, setAvisos] = useState<string[]>([]);
    /** Escolha explícita do usuário por turno: turnoId → horarioId | 'nenhuma'. */
    const [referencias, setReferencias] = useState<Record<string, string>>({});

    /**
     * Por onde se entra na grade.
     *
     * O motor nao muda com isto: `analisarMovimento` sempre recebeu TODAS as
     * aulas da escola, nao so as do professor escolhido. O eixo e recorte de
     * tela, e era essa a razao de so existir um — ninguem tinha precisado dos
     * outros. O modo TURMA e o unico que mostra as celulas vazias dela, que e
     * onde uma aula que ficou de fora poderia entrar.
     */
    const [modo, setModo] = useState<'professor' | 'turma' | 'slot'>('professor');
    const [turmaId, setTurmaId] = useState<string>('');
    const [slotFoco, setSlotFoco] = useState<{ dia: string; slot: number; turnoId: string } | null>(null);
    const [turnosById, setTurnosById] = useState<Map<string, Turno>>(new Map());

    const [aulaSelecionadaId, setAulaSelecionadaId] = useState<string | null>(null);
    const [slotDestino, setSlotDestino] = useState<{ dia: string, slot: number, turnoId: string } | null>(null);
    /** A outra ponta da troca: uma aula ocupada clicada com outra já selecionada. */
    const [aulaTrocaId, setAulaTrocaId] = useState<string | null>(null);
    const [troca, setTroca] = useState<ResultadoTroca | null>(null);
    const [impacto, setImpacto] = useState<ImpactoAnalise | null>(null);
    const [applying, setApplying] = useState(false);
    const [calculating, setCalculating] = useState(false);
    const [possibilidadeSelecionadaIndex, setPossibilidadeSelecionadaIndex] = useState(0);

    /**
     * Sobe de um quando algo fora desta tela mexeu na grade — hoje, o
     * preenchimento automático de vagas. Sem isso o painel continuaria
     * calculando impacto sobre as posições antigas das aulas que acabaram de ser
     * remanejadas, e sugeriria rotas que já não existem.
     */
    const [recarga, setRecarga] = useState(0);

    /** Limpa origem, destino e tudo que foi calculado em cima deles. */
    const limparSelecao = () => {
        setAulaSelecionadaId(null);
        setSlotDestino(null);
        setAulaTrocaId(null);
        setTroca(null);
        setImpacto(null);
    };

    useEffect(() => {
        if (!horarioId) {
            setProfessores([]); setTurmas([]); setAulasMoveis([]); setAulasReferencia([]);
            setProfessorId(''); setTurmaId(''); setTurnos([]);
            setReferenciasResolvidas([]); setAvisos([]);
            return;
        }
        let active = true;
        setLoadingData(true);
        setProfessorId(''); setTurmaId(''); setSlotFoco(null);
        limparSelecao();

        getDadosRefinoHorario(escolaId, { horarioId, referencias }).then((res) => {
            if (!active) return;
            setLoadingData(false);
            if (res.error || !res.data) {
                toast({ variant: 'destructive', title: 'Erro', description: res.error || 'Erro ao carregar dados' });
                return;
            }
            setAulasMoveis(res.data.aulasMoveis);
            setAulasReferencia(res.data.aulasReferencia);
            setProfessores(res.data.professores);
            setTurmas(res.data.turmas ?? []);
            setTurnos(res.data.turnos);
            setReferenciasResolvidas(res.data.referencias);
            setAvisos(res.data.avisos ?? []);
            const map = new Map<string, Turno>();
            res.data.turnos.forEach(t => map.set(t.id, t));
            setTurnosById(map);
        });
        return () => { active = false; };
    }, [horarioId, escolaId, recarga, referencias]);

    /** Tudo que a tela desenha; só `aulasMoveis` pode mudar de lugar. */
    const todasAulas = useMemo(
        () => [...aulasMoveis, ...aulasReferencia],
        [aulasMoveis, aulasReferencia],
    );

    /**
     * O que o motor recebe. Um objeto só, memoizado: o cálculo guarda cache
     * ligado à identidade dele, e recriá-lo a cada render jogaria o cache fora.
     */
    const ctx: ContextoRefino = useMemo(() => ({
        aulasMoveis,
        aulasReferencia,
        turnosById,
        professoresById: new Map(professores.map(p => [p.id, p])),
    }), [aulasMoveis, aulasReferencia, turnosById, professores]);

    useEffect(() => {
        if (!aulaSelecionadaId || !slotDestino) {
            setImpacto(null);
            setPossibilidadeSelecionadaIndex(0);
            return;
        }

        const res = analisarMovimento(
            ctx,
            { aulaId: aulaSelecionadaId, dia: slotDestino.dia, slot: slotDestino.slot, turnoId: slotDestino.turnoId },
            false,
        );
        setImpacto(res);
    }, [aulaSelecionadaId, slotDestino, ctx]);

    /** Troca: resposta imediata, sem busca — são duas aulas e quatro perguntas. */
    useEffect(() => {
        if (!aulaSelecionadaId || !aulaTrocaId) {
            setTroca(null);
            return;
        }
        setTroca(analisarTroca(ctx, aulaSelecionadaId, aulaTrocaId));
    }, [aulaSelecionadaId, aulaTrocaId, ctx]);

    const handleCalculate = () => {
        if (!aulaSelecionadaId || !slotDestino) return;
        setCalculating(true);
        setTimeout(() => {
            const res = analisarMovimento(
                ctx,
                { aulaId: aulaSelecionadaId, dia: slotDestino.dia, slot: slotDestino.slot, turnoId: slotDestino.turnoId },
                true,
            );
            setImpacto(res);
            setPossibilidadeSelecionadaIndex(0);
            setCalculating(false);
        }, 50);
    };

    /** Grava uma lista de movimentos — a rota do motor ou os dois pés da troca. */
    const gravar = async (moves: Move[], titulo: string) => {
        if (moves.length === 0 || applying) return;

        setApplying(true);
        const res = await aplicarMudancasRefino(moves, horarioId);
        setApplying(false);

        if (res.error) {
            toast({ variant: 'destructive', title: 'Nada foi gravado', description: res.error });
            return;
        }

        toast({ title: titulo, description: 'O horário foi atualizado com sucesso.' });
        const mapMudancas = new Map(moves.map(m => [m.aulaId, m]));
        setAulasMoveis(prev => prev.map(a => {
            const m = mapMudancas.get(a.id);
            if (m) return { ...a, dia_semana: m.novoDia, aula_index: m.novoSlot, turno_id: m.novoTurnoId };
            return a;
        }));
        limparSelecao();
    };

    const handleApply = async () => {
        if (!impacto || !aulaSelecionadaId || impacto.status === 'bloqueado') return;

        let moves = impacto.mudancasNecessarias;
        if (impacto.status === 'possibilidades' && impacto.possibilidades && impacto.possibilidades.length > 0) {
            moves = impacto.possibilidades[possibilidadeSelecionadaIndex].moves;
        }

        await gravar(moves, 'Rota aplicada!');
    };

    const handleTrocar = async () => {
        if (!troca || troca.status !== 'ok') return;
        await gravar(troca.moves, 'Aulas trocadas!');
    };

    /**
     * As aulas que a grade da tela mostra, conforme o eixo escolhido.
     *
     * No modo Professor entram também as aulas dele nas grades de referência —
     * é ali que o choque entre turnos aparece para o olho humano, e escondê-las
     * seria mostrar uma agenda que não é a da pessoa.
     */
    const aulasEmFoco = modo === 'turma'
        ? todasAulas.filter(a => a.turma_id === turmaId)
        : todasAulas.filter(a => professorEmFoco(a, professorId, professores));
    const turnosEmFoco = Array.from(new Set(aulasEmFoco.map(a => a.turno_id)));

    /** Ha um recorte escolhido? E o que destrava a grade. */
    const temFoco = modo === 'turma' ? !!turmaId : modo === 'professor' ? !!professorId : !!slotFoco;

    /**
     * Modo SLOT: quem esta onde num horario, e quem esta livre nele.
     *
     * Nao usa a grade: a pergunta e outra. Aqui se olha uma coluna do dia
     * inteiro da escola de uma vez, que e como se procura espaco para encaixar
     * uma aula que ficou de fora.
     */
    const panoramaDoSlot = (() => {
        if (!slotFoco) return null;
        const turnoObj = turnosById.get(slotFoco.turnoId);
        const horario = turnoObj?.horarios?.[slotFoco.slot];
        const noSlot = todasAulas.filter(a =>
            a.dia_semana === slotFoco.dia && a.aula_index === slotFoco.slot && a.turno_id === slotFoco.turnoId);

        const ocupadas = new Map(noSlot.map(a => [a.turma_id, a]));
        const linhas = turmas.map(t => ({ turma: t, aula: ocupadas.get(t.id) ?? null }));

        const profsOcupados = new Set(noSlot.map(a => a.professor_id).filter(Boolean) as string[]);
        const livres = professores.filter(p => !profsOcupados.has(p.id));

        return { turnoObj, horario, linhas, livres };
    })();

    const [modalAberto, setModalAberto] = useState(false);

    const gradeEmEdicao = horariosParaRefino.find(h => h.id === horarioId) || null;

    /**
     * As grades que disputam o papel de referência, agrupadas por turno.
     *
     * O turno da grade aberta fica de fora: ali a autoridade é ela mesma, e
     * oferecer outra versão do mesmo turno seria comparar o horário consigo
     * próprio — cada slot bateria com ele mesmo e a tela acusaria choque em tudo.
     */
    const turnosDeReferencia = (() => {
        if (!gradeEmEdicao) return [];
        const porTurno = new Map<string, { turno_id: string; turno_nome: string; grades: GradeCandidata[] }>();
        for (const g of horariosParaRefino) {
            if (g.turno_id === gradeEmEdicao.turno_id) continue;
            const atual = porTurno.get(g.turno_id);
            if (atual) atual.grades.push(g);
            else porTurno.set(g.turno_id, { turno_id: g.turno_id, turno_nome: g.turno_nome, grades: [g] });
        }
        return Array.from(porTurno.values()).sort((a, b) => a.turno_nome.localeCompare(b.turno_nome));
    })();

    /** O que o seletor de um turno mostra: a escolha do usuário ou o padrão resolvido. */
    const referenciaDoTurno = (turnoId: string): string => {
        const escolhido = referencias[turnoId];
        if (escolhido) return escolhido;
        return referenciasResolvidas.find(r => r.turno_id === turnoId)?.horario_id ?? '';
    };

    const escolherReferencia = (turnoId: string, valor: string) => {
        limparSelecao();
        setReferencias(prev => ({ ...prev, [turnoId]: valor }));
    };

    const canApply =
        !!impacto &&
        impacto.status !== 'bloqueado' &&
        impacto.status !== 'atencao' &&
        !applying &&
        !calculating;

    return (
        <div className="flex flex-col h-full space-y-4">
            <div className="flex flex-col gap-4 p-4 border rounded-lg bg-muted/50">

                {/* ── Grades de referência: o que conta como ocupado ───────── */}
                {horarioId && turnosDeReferencia.length > 0 && (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                                Grades de referência
                            </p>
                            <span className="text-[11px] text-muted-foreground">
                                — uma por turno; é contra elas que o conflito é calculado
                            </span>
                        </div>
                        <div className="flex flex-wrap gap-3">
                            {turnosDeReferencia.map(({ turno_id, turno_nome, grades }) => {
                                const valor = referenciaDoTurno(turno_id);
                                const resolvida = referenciasResolvidas.find(r => r.turno_id === turno_id);
                                return (
                                    <div key={turno_id} className="flex items-center gap-2">
                                        <span className="text-xs font-semibold text-muted-foreground w-[90px] truncate" title={turno_nome}>
                                            {turno_nome}
                                        </span>
                                        <Select
                                            value={valor || SEM_REFERENCIA}
                                            onValueChange={v => escolherReferencia(turno_id, v)}
                                            disabled={loadingData}
                                        >
                                            <SelectTrigger className="w-[260px] h-9 text-xs">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value={SEM_REFERENCIA}>— não considerar —</SelectItem>
                                                {grades.map(g => (
                                                    <SelectItem key={g.id} value={g.id}>
                                                        {g.nome} ({rotuloDoStatus(g.status)})
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        {resolvida && !resolvida.escolhidaPeloUsuario && (
                                            <Badge variant="outline" className="text-[9px] py-0">padrão</Badge>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {avisos.length > 0 && (
                    <div className="flex flex-col gap-1 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
                        {avisos.map((a, i) => (
                            <p key={i} className="text-[11px] text-amber-800 dark:text-amber-300 flex gap-2">
                                <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
                                <span>{a}</span>
                            </p>
                        ))}
                    </div>
                )}

                <div className="flex flex-wrap gap-4 items-center">
                <div data-tutorial="refino-select-horario" className="w-[300px]">
                    <Select value={horarioId} onValueChange={v => { setReferencias({}); setHorarioId(v); }}>
                        <SelectTrigger><SelectValue placeholder="Selecione a grade a trabalhar..." /></SelectTrigger>
                        <SelectContent>
                            {horariosParaRefino.map(h => (
                                <SelectItem key={h.id} value={h.id}>
                                    {h.nome} — {h.turno_nome} ({rotuloDoStatus(h.status)})
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex rounded-lg border overflow-hidden">
                    {([['professor', 'Professor'], ['turma', 'Turma'], ['slot', 'Horário']] as const).map(([valor, rotulo]) => (
                        <button
                            key={valor}
                            type="button"
                            disabled={!horarioId || loadingData}
                            onClick={() => {
                                setModo(valor);
                                limparSelecao();
                            }}
                            className={cn(
                                'px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50',
                                modo === valor ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
                            )}
                        >
                            {rotulo}
                        </button>
                    ))}
                </div>

                {horarioId && (
                    <PreencherVagasDialog
                        horarioId={horarioId}
                        /* As mesmas grades da barra de cima: os dois botões da
                           tela precisam concordar sobre o que está ocupado. */
                        referenciasIds={referenciasResolvidas.map(r => r.horario_id)}
                        aoAplicar={() => {
                            limparSelecao();
                            setRecarga(n => n + 1);
                        }}
                    />
                )}

                {modo === 'professor' && (
                    <div data-tutorial="refino-select-professor" className="w-[300px]">
                        <Select value={professorId} onValueChange={setProfessorId} disabled={!horarioId || loadingData}>
                            <SelectTrigger>
                            {loadingData ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <SelectValue placeholder="Selecione o professor..." />}
                            </SelectTrigger>
                            <SelectContent>
                                {professores.map(p => (
                                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}

                {modo === 'turma' && (
                    <div className="w-[300px]">
                        <Select value={turmaId} onValueChange={setTurmaId} disabled={!horarioId || loadingData}>
                            <SelectTrigger>
                            {loadingData ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <SelectValue placeholder="Selecione a turma..." />}
                            </SelectTrigger>
                            <SelectContent>
                                {turmas.map(t => (
                                    <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}

                {modo === 'slot' && (
                    <div className="flex flex-wrap gap-2 items-center">
                        <Select
                            value={slotFoco ? `${slotFoco.turnoId}|${slotFoco.dia}|${slotFoco.slot}` : ''}
                            onValueChange={v => {
                                const [turnoId, dia, slot] = v.split('|');
                                setSlotFoco({ turnoId, dia, slot: Number(slot) });
                            }}
                            disabled={!horarioId || loadingData}
                        >
                            <SelectTrigger className="w-[300px]">
                                <SelectValue placeholder="Selecione o dia e a aula..." />
                            </SelectTrigger>
                            <SelectContent>
                                {/* Só os turnos que têm aula nesta grade: listar os quatro
                                    turnos cadastrados daria uma lista de quase duzentos itens,
                                    a maioria de horário que não existe. */}
                                {turnos.filter(t => todasAulas.some(a => a.turno_id === t.id)).flatMap(t =>
                                    [...(t.dias_semana || [])]
                                        .sort((a, b) => DIAS.indexOf(a) - DIAS.indexOf(b))
                                        .flatMap(d =>
                                            (t.horarios || []).map((h, i) => (
                                                <SelectItem key={`${t.id}|${d}|${i}`} value={`${t.id}|${d}|${i}`}>
                                                    {t.nome} — {DIA_LABELS[d]} {ordinal(i + 1)} ({h.inicio}–{h.fim})
                                                </SelectItem>
                                            ))
                                        )
                                )}
                            </SelectContent>
                        </Select>
                    </div>
                )}
                </div>
            </div>

            {modo === 'slot' && slotFoco && !loadingData && panoramaDoSlot && (
                <div className="border rounded-xl shadow-sm bg-background overflow-hidden">
                    <div className="bg-primary text-primary-foreground px-4 py-2 font-bold uppercase tracking-wider text-xs flex justify-between items-center">
                        <span>
                            {panoramaDoSlot.turnoObj?.nome} — {DIA_LABELS[slotFoco.dia]} {ordinal(slotFoco.slot + 1)}
                            {panoramaDoSlot.horario ? ` (${panoramaDoSlot.horario.inicio}–${panoramaDoSlot.horario.fim})` : ''}
                        </span>
                        <span className="opacity-70 font-normal">
                            {panoramaDoSlot.linhas.filter(l => !l.aula).length} turma(s) sem aula neste horário
                        </span>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-0">
                        <div className="lg:col-span-2 overflow-x-auto">
                            <table className="w-full text-sm text-left border-collapse">
                                <thead>
                                    <tr className="bg-muted/50 text-muted-foreground">
                                        <th className="border-b border-r p-2 font-semibold">Turma</th>
                                        <th className="border-b border-r p-2 font-semibold">Disciplina</th>
                                        <th className="border-b p-2 font-semibold">Professor</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {panoramaDoSlot.linhas.map(({ turma, aula }) => (
                                        <tr key={turma.id} className={cn('hover:bg-muted/40', !aula && 'bg-amber-50/60 dark:bg-amber-950/20')}>
                                            <td className="border-b border-r p-2 font-medium">{turma.nome}</td>
                                            <td className="border-b border-r p-2">
                                                {aula ? (aula.componente_sigla || aula.componente_nome) : <span className="text-amber-700 dark:text-amber-500 italic">vago</span>}
                                            </td>
                                            <td className="border-b p-2 text-muted-foreground">{aula?.professor_nome ?? '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="border-l p-3">
                            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
                                Sem aula neste horário ({panoramaDoSlot.livres.length})
                            </p>
                            <div className="flex flex-wrap gap-1.5 max-h-[420px] overflow-y-auto">
                                {panoramaDoSlot.livres.map(p => (
                                    <Badge key={p.id} variant="outline" className="text-[10px]">{p.nome}</Badge>
                                ))}
                                {panoramaDoSlot.livres.length === 0 && (
                                    <p className="text-xs text-muted-foreground italic">Todos os professores da grade estão ocupados aqui.</p>
                                )}
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-3 leading-relaxed">
                                Esta lista é leitura, não ação: mostra onde há folga. Para mover uma aula, volte ao
                                modo Professor ou Turma e escolha origem e destino na grade.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {modo !== 'slot' && temFoco && !loadingData && (
                <div className="flex flex-1 gap-6 min-h-0 flex-col md:flex-row">
                    {/* Left: Grade */}
                    <div className="flex-1 overflow-y-auto space-y-6 pr-2 custom-scrollbar">
                        {turnosEmFoco.map(tid => {
                            const turnoObj = turnosById.get(tid);
                            if (!turnoObj) return null;
                            const aulasTurno = aulasEmFoco.filter(a => a.turno_id === tid);
                            const diasTurno = [...(turnoObj.dias_semana || [])].sort((a,b) => DIAS.indexOf(a) - DIAS.indexOf(b));

                            return (
                                <div key={tid} className="border rounded-xl shadow-sm bg-background overflow-hidden">
                                   <div className="bg-primary text-primary-foreground px-4 py-2 font-bold uppercase tracking-wider text-xs flex justify-between items-center">
                                       <span>TURNO: {turnoObj.nome}</span>
                                       <span className="opacity-70 font-normal">{aulasTurno.length} aulas</span>
                                   </div>
                                   <div className="overflow-x-auto">
                                     <table className="w-full text-sm text-center border-collapse">
                                        <thead>
                                            <tr>
                                                <th className="border-b border-r bg-muted/50 p-2 text-muted-foreground font-semibold w-[90px]">Horário</th>
                                                {diasTurno.map(d => (
                                                    <th key={d} className="border-b border-r bg-muted/50 p-2 text-muted-foreground font-semibold">
                                                        {DIA_LABELS[d]}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {turnoObj.horarios.map((hor, slotIdx) => (
                                                <tr key={slotIdx} className="hover:bg-muted/50 transition-colors">
                                                    <td className="border-b border-r p-2 bg-muted/50/50">
                                                        <div className="font-bold text-primary">{slotIdx + 1}ª Aula</div>
                                                        <div className="text-[10px] text-muted-foreground">{hor.inicio} - {hor.fim}</div>
                                                    </td>
                                                    {diasTurno.map(dia => {
                                                        const slotAulas = aulasTurno.filter(a => a.dia_semana === dia && a.aula_index === slotIdx);

                                                        const isSelected = aulaSelecionadaId && slotAulas.some(a => a.id === aulaSelecionadaId);
                                                        const isTroca = aulaTrocaId && slotAulas.some(a => a.id === aulaTrocaId);
                                                        const isDestino = slotDestino?.dia === dia && slotDestino?.slot === slotIdx && slotDestino?.turnoId === tid;
                                                        /* Célula de grade de referência: leitura. Ela está aqui para
                                                           mostrar onde o professor já está, não para ser editada. */
                                                        const soLeitura = slotAulas.length > 0 && slotAulas.every(a => a.movel === false);

                                                        return (
                                                            <td
                                                                key={`${dia}-${slotIdx}`}
                                                                className={cn(
                                                                    'border-b border-r p-1 transition-all min-w-[120px] h-[60px]',
                                                                    soLeitura ? 'cursor-not-allowed bg-muted/40' : 'cursor-pointer',
                                                                    isSelected && 'ring-2 ring-indigo-500 ring-inset bg-indigo-50/50 dark:bg-indigo-950/20',
                                                                    isTroca && 'ring-2 ring-violet-500 ring-inset bg-violet-50/50 dark:bg-violet-950/20',
                                                                    isDestino && 'ring-2 ring-amber-500 ring-inset border-dashed bg-amber-50/30 dark:bg-amber-950/20',
                                                                    !isSelected && !isDestino && !isTroca && !soLeitura && 'hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20'
                                                                )}
                                                                onClick={() => {
                                                                    if (soLeitura) {
                                                                        toast({
                                                                            title: 'Aula de outra grade',
                                                                            description: `Esta aula é de ${slotAulas[0].horario_nome || 'outra grade'} e aparece aqui só como referência de conflito. Abra aquela grade para editá-la.`,
                                                                        });
                                                                        return;
                                                                    }

                                                                    if (slotAulas.length > 0) {
                                                                        const alvo = slotAulas.find(a => a.movel !== false) || slotAulas[0];

                                                                        // Clicar de novo no que já está escolhido desfaz a
                                                                        // escolha: é como se desiste sem ter que adivinhar
                                                                        // onde clicar para "sair" da seleção.
                                                                        if (alvo.id === aulaSelecionadaId) {
                                                                            limparSelecao();
                                                                            return;
                                                                        }
                                                                        if (alvo.id === aulaTrocaId) {
                                                                            // Desfaz só a segunda ponta; a primeira continua
                                                                            // escolhida, pronta para outro destino.
                                                                            setAulaTrocaId(null);
                                                                            setTroca(null);
                                                                            return;
                                                                        }

                                                                        // Com uma aula já selecionada, clicar noutra ocupada
                                                                        // propõe a TROCA das duas — é o caminho para remanejar
                                                                        // sem depender de haver slot vazio.
                                                                        if (aulaSelecionadaId) {
                                                                            setSlotDestino(null);
                                                                            setImpacto(null);
                                                                            setAulaTrocaId(alvo.id);
                                                                        } else {
                                                                            setAulaSelecionadaId(alvo.id);
                                                                            setSlotDestino(null);
                                                                            setAulaTrocaId(null);
                                                                            setTroca(null);
                                                                        }
                                                                    } else if (aulaSelecionadaId) {
                                                                        setAulaTrocaId(null);
                                                                        setTroca(null);
                                                                        setSlotDestino({ dia, slot: slotIdx, turnoId: tid });
                                                                    }
                                                                }}
                                                            >
                                                                {slotAulas.length === 0 && aulaSelecionadaId && !isDestino && (
                                                                     <div className="w-full h-full flex items-center justify-center opacity-0 hover:opacity-100">
                                                                       <div className="text-[10px] bg-slate-800 text-white px-2 py-1 flex items-center gap-1 rounded-full"><ArrowRightLeft className="w-3 h-3"/> Mover</div>
                                                                     </div>
                                                                )}

                                                                {slotAulas.map(a => (
                                                                    <CartaoAula
                                                                        key={a.id}
                                                                        aula={a}
                                                                        modo={modo}
                                                                        elevada={a.id === aulaSelecionadaId || a.id === aulaTrocaId}
                                                                    />
                                                                ))}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                        </tbody>
                                     </table>
                                   </div>
                                </div>
                            );
                        })}

                        {!turnosEmFoco.length && (
                             <div className="flex items-center justify-center h-40 text-muted-foreground border-2 border-dashed rounded-xl">
                                {modo === 'turma'
                                    ? 'Nenhuma aula desta turma neste horário.'
                                    : 'Nenhuma aula vinculada a este professor neste horário.'}
                            </div>
                        )}
                    </div>

                    {/* Right: Painel Impacto */}
                    <div data-tutorial="refino-painel-impacto" className="w-full md:w-[380px] shrink-0 border rounded-xl shadow-sm bg-background flex flex-col overflow-hidden max-h-[800px]">
                        <div className="bg-[#f8fafc] dark:bg-muted/30 text-foreground px-4 py-3 font-semibold text-sm border-b uppercase tracking-wide flex items-center justify-between">
                            <span>Painel de Impacto</span>
                            {impacto?.status === 'possibilidades' && (
                                <button
                                    title="Expandir opções"
                                    onClick={() => setModalAberto(true)}
                                    className="ml-2 p-1.5 rounded-md text-muted-foreground hover:text-indigo-600 hover:bg-indigo-50 dark:hover:text-indigo-400 dark:hover:bg-indigo-950/30 transition-colors"
                                >
                                    <Maximize2 className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                        <div className="p-4 flex-1 overflow-y-auto space-y-4">
                            {!aulaSelecionadaId ? (
                                <div className="text-sm text-muted-foreground text-center mt-10">
                                    <div className="bg-muted/50 w-12 h-12 mx-auto rounded-full flex items-center justify-center mb-3">
                                        <ArrowRightLeft className="w-5 h-5 text-muted-foreground" />
                                    </div>
                                    <p>Clique sobre uma aula na grade para selecioná-la. Depois clique num slot vazio para movê-la, ou sobre outra aula para trocar as duas de lugar.</p>
                                </div>
                            ) : aulaTrocaId ? (
                                troca ? (
                                    <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
                                        <div className={cn(
                                            'p-4 rounded-xl border-l-4',
                                            troca.status === 'ok'
                                                ? 'bg-violet-50 border-violet-500 text-violet-900 dark:bg-violet-950/30 dark:text-violet-200'
                                                : 'bg-red-50 border-red-500 text-red-800 dark:bg-red-950/30 dark:text-red-300',
                                        )}>
                                            <div className="flex gap-2 font-bold items-center mb-1">
                                                {troca.status === 'ok' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                                                <span className="uppercase text-[11px] tracking-wide">
                                                    {troca.status === 'ok' ? 'Troca válida' : 'Troca bloqueada'}
                                                </span>
                                            </div>
                                            <p className="text-sm opacity-90">{troca.mensagem}</p>
                                        </div>

                                        <div className="space-y-2">
                                            {troca.lados.map(lado => {
                                                const turnoOrigem = turnosById.get(lado.origem.turnoId);
                                                const turnoDestino = turnosById.get(lado.destino.turnoId);
                                                return (
                                                    <div key={lado.aulaId} className={cn(
                                                        'rounded-lg border p-3 text-xs space-y-2',
                                                        lado.impedimento ? 'bg-red-50/60 border-red-200 dark:bg-red-950/20 dark:border-red-900' : 'bg-muted/40'
                                                    )}>
                                                        <p className="font-semibold text-foreground">{lado.rotulo}</p>
                                                        <div className="flex items-center gap-2">
                                                            <div className="flex-1 rounded px-2 py-1 text-center bg-background border">
                                                                <div className="text-[9px] uppercase font-bold text-muted-foreground">Sai de</div>
                                                                <div className="font-bold">{DIA_SHORT[lado.origem.dia]} {ordinal(lado.origem.slot + 1)}</div>
                                                                <div className="text-[9px] text-muted-foreground">{turnoOrigem?.horarios?.[lado.origem.slot]?.inicio ?? '--:--'}</div>
                                                            </div>
                                                            <MoveRight className="w-4 h-4 text-muted-foreground shrink-0" />
                                                            <div className="flex-1 rounded px-2 py-1 text-center bg-background border">
                                                                <div className="text-[9px] uppercase font-bold text-muted-foreground">Vai para</div>
                                                                <div className="font-bold">{DIA_SHORT[lado.destino.dia]} {ordinal(lado.destino.slot + 1)}</div>
                                                                <div className="text-[9px] text-muted-foreground">{turnoDestino?.horarios?.[lado.destino.slot]?.inicio ?? '--:--'}</div>
                                                            </div>
                                                        </div>
                                                        {lado.texto && (
                                                            <p className="text-[11px] text-red-700 dark:text-red-400 flex gap-1.5">
                                                                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
                                                                <span>{lado.texto}</span>
                                                            </p>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {troca.avisos.map((a, i) => (
                                            <p key={i} className="text-[11px] text-amber-700 dark:text-amber-400 flex gap-1.5">
                                                <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
                                                <span>{a}</span>
                                            </p>
                                        ))}

                                        <Button
                                            variant="outline"
                                            className="w-full h-8 text-xs"
                                            onClick={() => {
                                                setAulaSelecionadaId(aulaTrocaId);
                                                setAulaTrocaId(null);
                                                setTroca(null);
                                            }}
                                        >
                                            Selecionar esta aula em vez de trocar
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="flex justify-center mt-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground/60" /></div>
                                )
                            ) : !slotDestino ? (
                                <div className="text-sm text-amber-700 bg-amber-50 p-4 rounded-lg border border-amber-100 flex flex-col gap-2 dark:text-amber-400 dark:bg-amber-950/30 dark:border-amber-900">
                                    <span className="font-bold flex items-center gap-2"><CheckCircle2 className="w-4 h-4"/> Aula selecionada</span>
                                    <span>Agora clique num slot vazio para testar a realocação, ou sobre outra aula para trocar as duas de lugar. Clique nela de novo para desistir.</span>
                                </div>
                            ) : impacto ? (
                                <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
                                   {/* Status banner */}
                                   <div className={cn(
                                        'p-4 rounded-xl border-l-4',
                                        impacto.status === 'livre' && 'bg-emerald-50 border-emerald-500 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300',
                                        impacto.status === 'sugestao' && 'bg-blue-50 border-blue-500 text-blue-800 dark:bg-blue-950/30 dark:text-blue-300',
                                        impacto.status === 'atencao' && 'bg-amber-50 border-amber-500 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300',
                                        impacto.status === 'possibilidades' && 'bg-indigo-50 border-indigo-500 text-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-300',
                                        impacto.status === 'bloqueado' && 'bg-red-50 border-red-500 text-red-800 dark:bg-red-950/30 dark:text-red-300',
                                   )}>
                                      <div className="flex gap-2 font-bold items-center mb-1">
                                         {(impacto.status === 'livre' || impacto.status === 'possibilidades') && <CheckCircle2 className="w-5 h-5" />}
                                         {(impacto.status === 'sugestao' || impacto.status === 'atencao' || impacto.status === 'bloqueado') && <AlertCircle className="w-5 h-5" />}
                                         <span className="uppercase text-[11px] tracking-wide">
                                             {impacto.status === 'possibilidades' ? 'Rotas calculadas' : impacto.status}
                                         </span>
                                      </div>
                                      <p className="text-sm opacity-90">{impacto.mensagem}</p>

                                      {impacto.status === 'atencao' && (
                                          <Button
                                              onClick={handleCalculate}
                                              disabled={calculating}
                                              className="mt-4 w-full bg-amber-600 hover:bg-amber-700 text-white"
                                          >
                                              {calculating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowRightLeft className="w-4 h-4 mr-2" />}
                                              Calcular Possibilidades
                                          </Button>
                                      )}
                                   </div>

                                   {/* Options list */}
                                   {impacto.status === 'possibilidades' && impacto.possibilidades && (
                                       <div className="space-y-3">
                                           <h3 className="text-xs font-bold uppercase text-muted-foreground tracking-wider">
                                               Rotas Validadas — selecione uma
                                           </h3>
                                           {impacto.possibilidades.map((p, idx) => (
                                               <OpcaoCard
                                                   key={p.id}
                                                   possibilidade={p}
                                                   index={idx}
                                                   isSelected={possibilidadeSelecionadaIndex === idx}
                                                   turnosById={turnosById}
                                                   onClick={() => setPossibilidadeSelecionadaIndex(idx)}
                                               />
                                           ))}
                                       </div>
                                   )}
                                </div>
                            ) : (
                                <div className="flex justify-center mt-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground/60" /></div>
                            )}
                        </div>

                        <div className="p-4 border-t bg-muted/50 shadow-[0_-4px_10px_rgba(0,0,0,0.02)]">
                            {aulaTrocaId ? (
                                <Button
                                    className="w-full disabled:opacity-40"
                                    size="lg"
                                    disabled={troca?.status !== 'ok' || applying}
                                    onClick={handleTrocar}
                                >
                                    {applying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowRightLeft className="w-4 h-4 mr-2" />}
                                    Trocar as duas aulas
                                </Button>
                            ) : (
                                <Button
                                    className="w-full disabled:opacity-40"
                                    size="lg"
                                    disabled={!canApply}
                                    onClick={handleApply}
                                >
                                    {applying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                                    Aplicar Mudança
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal expandido de opções ─────────────────────────────── */}
            <Dialog open={modalAberto} onOpenChange={setModalAberto}>
                <DialogContent className="max-w-5xl w-full max-h-[90vh] flex flex-col p-0 gap-0">
                    <DialogHeader className="px-6 py-4 border-b bg-[#f8fafc]">
                        <DialogTitle className="text-base font-bold uppercase tracking-wide text-slate-700 flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5 text-indigo-500" />
                            Rotas Validadas — selecione e aplique
                        </DialogTitle>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto p-6">
                        {impacto?.status === 'possibilidades' && impacto.possibilidades && (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                {impacto.possibilidades.map((p, idx) => (
                                    <OpcaoCard
                                        key={p.id}
                                        possibilidade={p}
                                        index={idx}
                                        isSelected={possibilidadeSelecionadaIndex === idx}
                                        turnosById={turnosById}
                                        onClick={() => setPossibilidadeSelecionadaIndex(idx)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    <DialogFooter className="px-6 py-4 border-t bg-muted/50 flex flex-col sm:flex-row gap-2">
                        <Button
                            variant="outline"
                            onClick={() => setModalAberto(false)}
                            className="flex-1"
                        >
                            Fechar
                        </Button>
                        <Button
                            className="flex-1 disabled:opacity-40"
                            disabled={!canApply}
                            onClick={async () => {
                                setModalAberto(false);
                                await handleApply();
                            }}
                        >
                            {applying
                                ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                : <Check className="w-4 h-4 mr-2" />
                            }
                            Aplicar Opção {possibilidadeSelecionadaIndex + 1}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
