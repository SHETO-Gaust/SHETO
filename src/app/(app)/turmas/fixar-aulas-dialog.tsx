'use client';

/**
 * Travamento de aulas em dia/horário fixo, por turma.
 *
 * Morava na Carga Horária da Série, como uma lista de `Select` (tipo, dia, aula)
 * num Sheet estreito que listava todos os componentes da escola. Fixar horário é
 * uma tarefa espacial: aqui o usuário vê a grade da semana como ela é e clica na
 * célula onde a aula deve ficar.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Lock, X, AlertTriangle, Copy, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TurmaComDados, Turno } from '@/lib/types';
import { resolverTurnoOposto } from '@/lib/turno-oposto';
import { updateAulasFixasTurma, copiarAulasFixasTurma } from './actions';

const DIAS_LABEL: Record<string, string> = {
  segunda: 'Segunda',
  terca: 'Terça',
  quarta: 'Quarta',
  quinta: 'Quinta',
  sexta: 'Sexta',
  sabado: 'Sábado',
  domingo: 'Domingo',
};

/**
 * Cores por componente. Fixas e cíclicas: a mesma disciplina fica com a mesma cor
 * toda vez que a tela abre, que é o que permite ler a grade de relance.
 */
const CORES = [
  'bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-950 dark:text-sky-100 dark:border-sky-800',
  'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-100 dark:border-emerald-800',
  'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-100 dark:border-amber-800',
  'bg-violet-100 text-violet-900 border-violet-300 dark:bg-violet-950 dark:text-violet-100 dark:border-violet-800',
  'bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950 dark:text-rose-100 dark:border-rose-800',
  'bg-teal-100 text-teal-900 border-teal-300 dark:bg-teal-950 dark:text-teal-100 dark:border-teal-800',
  'bg-orange-100 text-orange-900 border-orange-300 dark:bg-orange-950 dark:text-orange-100 dark:border-orange-800',
  'bg-indigo-100 text-indigo-900 border-indigo-300 dark:bg-indigo-950 dark:text-indigo-100 dark:border-indigo-800',
];

type TipoAula = 'presencial' | 'nao_presencial';

type FixaLocal = {
  id?: string;
  componente_id: string;
  tipo_aula: TipoAula;
  dia_semana: string;
  aula_index: number;
};

type Props = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  turma: TurmaComDados;
  todasAsTurmas: TurmaComDados[];
  turnos: Turno[];
  onSaved: () => void;
};

const chaveSlot = (tipo: TipoAula, dia: string, idx: number) => `${tipo}|${dia}|${idx}`;

export function FixarAulasDialog({ isOpen, setIsOpen, turma, todasAsTurmas, turnos, onSaved }: Props) {
  const { toast } = useToast();
  const [fixas, setFixas] = useState<FixaLocal[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [copiando, setCopiando] = useState(false);
  const [origemCopia, setOrigemCopia] = useState<string>('');
  /** Disciplina "na mão": escolhida à esquerda, aplicada nos horários clicados. */
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [aba, setAba] = useState<TipoAula>('presencial');

  const turno = useMemo(
    () => turnos.find(t => t.id === turma.serie.turno_id) ?? null,
    [turnos, turma.serie.turno_id]
  );
  const turnoOposto = useMemo(
    () => (turno ? resolverTurnoOposto(turno, turnos.filter(t => t.ativo)) : null),
    [turno, turnos]
  );

  useEffect(() => {
    if (!isOpen) return;
    setFixas((turma.aulas_fixas || []).map(f => ({
      id: f.id,
      componente_id: f.componente_id,
      tipo_aula: f.tipo_aula,
      dia_semana: f.dia_semana,
      aula_index: f.aula_index,
    })));
    setOrigemCopia('');
    setSelecionada(null);
    setAba('presencial');
  }, [isOpen, turma]);

  // ── Dados derivados ────────────────────────────────────────────────────────

  /** Só as disciplinas que esta turma realmente tem — o filtro do ensalamento. */
  const componentes = useMemo(() => {
    return (turma.serie.componentes || [])
      .filter(c => (c.aulas_presenciais || 0) + (c.aulas_nao_presenciais || 0) > 0)
      .map((c, i) => ({
        id: c.componente_id,
        nome: c.componente?.nome || 'Disciplina',
        sigla: c.componente?.sigla || c.componente?.nome?.slice(0, 3).toUpperCase() || '?',
        presenciais: c.aulas_presenciais || 0,
        naoPresenciais: c.aulas_nao_presenciais || 0,
        cor: CORES[i % CORES.length],
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [turma.serie.componentes]);

  const professorDoComponente = useMemo(() => {
    const m = new Map<string, { id: string; nome: string }>();
    for (const p of turma.professores || []) {
      if (p.professor) m.set(p.componente_id, { id: p.professor_id, nome: p.professor.nome_horario });
    }
    return m;
  }, [turma.professores]);

  const porSlot = useMemo(() => {
    const m = new Map<string, FixaLocal>();
    for (const f of fixas) m.set(chaveSlot(f.tipo_aula, f.dia_semana, f.aula_index), f);
    return m;
  }, [fixas]);

  const usadas = (componenteId: string, tipo: TipoAula) =>
    fixas.filter(f => f.componente_id === componenteId && f.tipo_aula === tipo).length;

  const totalCarga = componentes.reduce((s, c) => s + c.presenciais + c.naoPresenciais, 0);

  const temNaoPresencial = componentes.some(c => c.naoPresenciais > 0) && !!turnoOposto;

  /**
   * Choques com as outras turmas.
   *
   * Não bloqueia o salvamento: o usuário pode estar no meio de reorganizar as
   * duas pontas. Mas sem este aviso o único sintoma seria uma grade que não
   * fecha, dias depois, sem explicação — foi exatamente esse o caso que fez a
   * "aula coletiva" existir.
   */
  const choques = useMemo(() => {
    if (!turno) return [];

    const turnoDaFixa = (t: TurmaComDados, tipo: TipoAula): Turno | null => {
      const seu = turnos.find(x => x.id === t.serie.turno_id) ?? null;
      if (!seu) return null;
      return tipo === 'presencial' ? seu : resolverTurnoOposto(seu, turnos.filter(x => x.ativo));
    };

    const achados: { professor: string; turma: string; dia: string; aula: number; componente: string }[] = [];

    for (const f of fixas) {
      const prof = professorDoComponente.get(f.componente_id);
      if (!prof) continue;
      const turnoAqui = turnoDaFixa(turma, f.tipo_aula);
      if (!turnoAqui) continue;

      for (const outra of todasAsTurmas) {
        if (outra.id === turma.id) continue;
        for (const g of outra.aulas_fixas || []) {
          if (g.dia_semana !== f.dia_semana || g.aula_index !== f.aula_index) continue;
          const turnoLa = turnoDaFixa(outra, g.tipo_aula);
          if (turnoLa?.id !== turnoAqui.id) continue;
          const profLa = (outra.professores || []).find(p => p.componente_id === g.componente_id);
          if (profLa?.professor_id !== prof.id) continue;

          achados.push({
            professor: prof.nome,
            turma: outra.nome,
            dia: DIAS_LABEL[f.dia_semana] || f.dia_semana,
            aula: f.aula_index + 1,
            componente: componentes.find(c => c.id === f.componente_id)?.sigla || '',
          });
        }
      }
    }
    return achados;
  }, [fixas, turno, turnos, turma, todasAsTurmas, professorDoComponente, componentes]);

  const turmasIrmas = useMemo(
    () => todasAsTurmas.filter(t => t.serie.id === turma.serie.id && t.id !== turma.id),
    [todasAsTurmas, turma]
  );

  const nomeSelecionada = componentes.find(c => c.id === selecionada)?.nome ?? '';

  // ── Ações ──────────────────────────────────────────────────────────────────

  const desfixar = (tipo: TipoAula, dia: string, idx: number) => {
    setFixas(prev => prev.filter(f => !(f.tipo_aula === tipo && f.dia_semana === dia && f.aula_index === idx)));
  };

  /** Saldo da disciplina selecionada na aba atual, já descontando o slot clicado. */
  const saldoDaSelecionada = (tipo: TipoAula, ocupanteDoSlot?: string) => {
    if (!selecionada) return 0;
    const c = componentes.find(x => x.id === selecionada);
    if (!c) return 0;
    const carga = tipo === 'presencial' ? c.presenciais : c.naoPresenciais;
    const jaLiberaUm = ocupanteDoSlot === selecionada ? 1 : 0;
    return carga - usadas(c.id, tipo) + jaLiberaUm;
  };

  const clicarNoSlot = (tipo: TipoAula, dia: string, idx: number) => {
    if (!selecionada) return;
    const atual = porSlot.get(chaveSlot(tipo, dia, idx));

    // Clicar de novo na mesma disciplina destrava — evita ter que mirar no X.
    if (atual?.componente_id === selecionada) {
      desfixar(tipo, dia, idx);
      return;
    }
    if (saldoDaSelecionada(tipo, atual?.componente_id) <= 0) return;

    setFixas(prev => [
      ...prev.filter(f => !(f.tipo_aula === tipo && f.dia_semana === dia && f.aula_index === idx)),
      { componente_id: selecionada, tipo_aula: tipo, dia_semana: dia, aula_index: idx },
    ]);
  };

  const salvar = async () => {
    setSalvando(true);
    const result = await updateAulasFixasTurma({ turma_id: turma.id, aulas_fixas: fixas });
    setSalvando(false);

    if (result.error) {
      toast({ title: 'Erro', description: result.error, variant: 'destructive' });
      return;
    }
    toast({
      title: 'Travamentos salvos',
      description: fixas.length === 0
        ? 'Nenhuma aula travada nesta turma.'
        : `${fixas.length} aula(s) travada(s) na turma ${turma.nome}.`,
    });
    onSaved();
    setIsOpen(false);
  };

  const confirmarCopia = async () => {
    const origem = turmasIrmas.find(t => t.id === origemCopia);
    if (!origem) return;

    setCopiando(true);
    const result = await copiarAulasFixasTurma({ origem_turma_id: origem.id, destino_turma_id: turma.id });
    setCopiando(false);
    setOrigemCopia('');

    if (result.error) {
      toast({ title: 'Erro', description: result.error, variant: 'destructive' });
      return;
    }
    toast({
      title: 'Travamentos copiados',
      description: `${result.copiadas} travamento(s) da turma ${origem.nome}` +
        (result.apagadas ? `, substituindo ${result.apagadas} da turma ${turma.nome}.` : '.'),
    });
    onSaved();
    setIsOpen(false);
  };

  // ── Grade ──────────────────────────────────────────────────────────────────

  const renderGrade = (tipo: TipoAula, turnoDaGrade: Turno) => {
    const dias = turnoDaGrade.dias_semana || [];
    const aulas = turnoDaGrade.aulas_por_dia || 0;
    const horarios = turnoDaGrade.horarios || [];

    if (dias.length === 0 || aulas === 0) {
      return (
        <p className="text-sm text-muted-foreground p-6 text-center border-2 border-dashed rounded-lg">
          O turno {turnoDaGrade.nome} não tem dias ou aulas configurados.
        </p>
      );
    }

    return (
      <div className="overflow-x-auto">
        <div
          className="grid gap-1.5 min-w-[640px]"
          style={{ gridTemplateColumns: `5.5rem repeat(${dias.length}, minmax(0, 1fr))` }}
        >
          <div />
          {dias.map(d => (
            <div key={d} className="text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground pb-1">
              {DIAS_LABEL[d] || d}
            </div>
          ))}

          {Array.from({ length: aulas }, (_, idx) => {
            const h = horarios[idx];
            return (
              <div key={idx} className="contents">
                <div className="flex flex-col justify-center items-end pr-2 py-1">
                  <span className="text-sm font-semibold">{idx + 1}ª</span>
                  {h && <span className="text-[10px] text-muted-foreground">{h.inicio}–{h.fim}</span>}
                </div>

                {dias.map(dia => {
                  const chave = chaveSlot(tipo, dia, idx);
                  const fixa = porSlot.get(chave);
                  const comp = fixa ? componentes.find(c => c.id === fixa.componente_id) : null;
                  const profDoSlot = fixa ? professorDoComponente.get(fixa.componente_id) : null;
                  const ehASelecionada = !!fixa && fixa.componente_id === selecionada;
                  const podeReceber = !!selecionada && (ehASelecionada || saldoDaSelecionada(tipo, fixa?.componente_id) > 0);

                  if (fixa && comp) {
                    return (
                      <div
                        key={chave}
                        onClick={() => clicarNoSlot(tipo, dia, idx)}
                        className={cn(
                          'relative rounded-md border-2 p-1.5 min-h-[3.25rem] flex flex-col justify-center',
                          comp.cor,
                          podeReceber && 'cursor-pointer hover:brightness-95 dark:hover:brightness-125',
                          ehASelecionada && 'ring-2 ring-offset-1 ring-primary'
                        )}
                        title={
                          ehASelecionada ? 'Clique para destravar'
                            : podeReceber ? `Clique para trocar por ${nomeSelecionada}`
                              : undefined
                        }
                      >
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); desfixar(tipo, dia, idx); }}
                          className="absolute right-0.5 top-0.5 p-0.5 rounded opacity-50 hover:opacity-100 hover:bg-black/10"
                          title="Destravar"
                        >
                          <X className="h-3 w-3" />
                        </button>
                        <span className="text-xs font-bold leading-tight pr-3">{comp.sigla}</span>
                        <span className="text-[10px] leading-tight opacity-80 truncate">
                          {profDoSlot?.nome || 'sem professor'}
                        </span>
                      </div>
                    );
                  }

                  return (
                    <button
                      key={chave}
                      type="button"
                      disabled={!podeReceber}
                      onClick={() => clicarNoSlot(tipo, dia, idx)}
                      title={
                        !selecionada ? 'Escolha uma disciplina à esquerda'
                          : podeReceber ? `Travar ${nomeSelecionada} aqui`
                            : `${nomeSelecionada} já está com todas as aulas travadas`
                      }
                      className={cn(
                        'group rounded-md border-2 border-dashed min-h-[3.25rem] flex items-center justify-center transition-colors',
                        podeReceber
                          ? 'border-primary/30 hover:border-primary hover:bg-primary/10 cursor-pointer'
                          : 'border-muted-foreground/15 cursor-default'
                      )}
                    >
                      <Plus className={cn(
                        'h-3.5 w-3.5',
                        podeReceber ? 'text-primary/40 group-hover:text-primary' : 'text-muted-foreground/20'
                      )} />
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const semCarga = componentes.length === 0;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent
          onPointerDownOutside={e => e.preventDefault()}
          className="max-w-6xl w-[95vw] h-[88vh] flex flex-col gap-0 p-0"
        >
          <DialogHeader className="px-6 pt-6 pb-4 border-b space-y-1">
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Travar Aulas — {turma.serie.nome} · Turma {turma.nome}
            </DialogTitle>
            <DialogDescription>
              Escolha uma disciplina à esquerda e clique nos horários em que ela deve ficar
              travada. O gerador respeita esses slots antes de distribuir o resto.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 flex">
            {/* ── Disciplinas da turma ── */}
            <aside className="w-64 shrink-0 border-r flex flex-col">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-4 pt-4 pb-2 shrink-0">
                Disciplinas da turma
              </p>
              <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
                {semCarga ? (
                  <p className="text-xs text-muted-foreground px-2">
                    A série ainda não tem carga horária definida.
                  </p>
                ) : (
                  componentes.map(c => {
                    // Contadores da aba visível: é a cota que o clique vai consumir.
                    const carga = aba === 'presencial' ? c.presenciais : c.naoPresenciais;
                    const travadas = usadas(c.id, aba);
                    const semCota = carga === 0;
                    const completa = !semCota && travadas >= carga;
                    const ativa = selecionada === c.id;
                    const prof = professorDoComponente.get(c.id);

                    return (
                      <button
                        key={c.id}
                        type="button"
                        disabled={semCota}
                        onClick={() => setSelecionada(ativa ? null : c.id)}
                        title={semCota ? 'Sem aulas deste tipo na carga horária' : c.nome}
                        className={cn(
                          'w-full text-left flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors',
                          semCota && 'opacity-40 cursor-default',
                          !semCota && !ativa && 'hover:bg-accent',
                          ativa && 'bg-primary/10 ring-1 ring-primary'
                        )}
                      >
                        <span className={cn('w-2.5 h-2.5 rounded-full border shrink-0', c.cor)} />
                        <span className="flex-1 min-w-0">
                          <span className="block text-xs truncate">{c.nome}</span>
                          <span className="block text-[10px] text-muted-foreground truncate">
                            {prof?.nome || 'sem professor alocado'}
                          </span>
                        </span>
                        <span className={cn(
                          'text-[10px] tabular-nums shrink-0',
                          completa ? 'font-semibold text-primary' : 'text-muted-foreground'
                        )}>
                          {travadas}/{carga}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </aside>

            {/* ── Grade ── */}
            <div className="flex-1 min-w-0 overflow-y-auto p-4 space-y-3">
              {choques.length > 0 && (
                <div className="flex items-start gap-2 text-xs rounded-md border border-amber-300 bg-amber-50 text-amber-900 p-3 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-px" />
                  <div className="space-y-0.5">
                    <p className="font-semibold">
                      {choques.length === 1 ? 'Um choque de professor' : `${choques.length} choques de professor`} com outras turmas
                    </p>
                    {choques.slice(0, 4).map((c, i) => (
                      <p key={i}>
                        {c.professor} também está travado na turma {c.turma} — {c.dia}, {c.aula}ª aula ({c.componente} aqui).
                      </p>
                    ))}
                    {choques.length > 4 && <p className="opacity-70">e mais {choques.length - 4}…</p>}
                    <p className="opacity-70 pt-1">
                      Dá para salvar assim, mas o gerador não conseguirá colocar o mesmo professor em duas turmas no mesmo horário.
                    </p>
                  </div>
                </div>
              )}

              {!semCarga && turno && (
                <div className={cn(
                  'flex items-center gap-2 text-xs rounded-md px-3 py-2 border',
                  selecionada ? 'bg-primary/5 border-primary/30' : 'bg-muted/50 text-muted-foreground'
                )}>
                  {selecionada ? (
                    <>
                      <span className={cn(
                        'w-2.5 h-2.5 rounded-full border shrink-0',
                        componentes.find(c => c.id === selecionada)?.cor
                      )} />
                      <span>
                        Clique nos horários para travar <strong>{nomeSelecionada}</strong>.
                        Clicar de novo num horário dela destrava.
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelecionada(null)}
                        className="ml-auto text-muted-foreground hover:text-foreground underline underline-offset-2"
                      >
                        cancelar
                      </button>
                    </>
                  ) : (
                    <span>Escolha uma disciplina na coluna à esquerda para começar.</span>
                  )}
                </div>
              )}

              {semCarga || !turno ? (
                <p className="text-sm text-muted-foreground p-6 text-center border-2 border-dashed rounded-lg">
                  {!turno
                    ? 'A série desta turma não tem turno definido.'
                    : 'Defina a carga horária da série (Passo 5) para poder travar aulas.'}
                </p>
              ) : temNaoPresencial ? (
                // Controlado: a coluna da esquerda mostra a cota da aba visível,
                // que é a que o próximo clique vai consumir.
                <Tabs value={aba} onValueChange={v => { setAba(v as TipoAula); setSelecionada(null); }}>
                  <TabsList>
                    <TabsTrigger value="presencial">Presencial — {turno.nome}</TabsTrigger>
                    <TabsTrigger value="nao_presencial">Não presencial — {turnoOposto!.nome}</TabsTrigger>
                  </TabsList>
                  <TabsContent value="presencial" className="mt-3">{renderGrade('presencial', turno)}</TabsContent>
                  <TabsContent value="nao_presencial" className="mt-3">{renderGrade('nao_presencial', turnoOposto!)}</TabsContent>
                </Tabs>
              ) : (
                renderGrade('presencial', turno)
              )}
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              {turmasIrmas.length > 0 && (
                <Select value={origemCopia} onValueChange={setOrigemCopia}>
                  <SelectTrigger className="w-[240px] h-9 text-xs">
                    <Copy className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                    <SelectValue placeholder="Copiar de outra turma..." />
                  </SelectTrigger>
                  <SelectContent>
                    {turmasIrmas.map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        Turma {t.nome} ({(t.aulas_fixas || []).length} travada{(t.aulas_fixas || []).length === 1 ? '' : 's'})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <span className="text-xs text-muted-foreground">
                {fixas.length} de {totalCarga} aulas travadas
              </span>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>Cancelar</Button>
              <Button type="button" onClick={salvar} disabled={salvando || semCarga} className="min-w-[100px]">
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/*
        A cópia substitui tudo no destino e grava direto, sem passar pelo botão
        Salvar — por isso a confirmação diz explicitamente o que será apagado.
      */}
      <AlertDialog open={!!origemCopia} onOpenChange={aberto => { if (!aberto) setOrigemCopia(''); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Copiar travamentos para a turma {turma.nome}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-sm text-muted-foreground space-y-2">
                <p>
                  A turma {turma.nome} ficará com os{' '}
                  <span className="font-semibold text-foreground">
                    {(turmasIrmas.find(t => t.id === origemCopia)?.aulas_fixas || []).length}
                  </span>{' '}
                  travamentos da turma{' '}
                  <span className="font-semibold text-foreground">
                    {turmasIrmas.find(t => t.id === origemCopia)?.nome}
                  </span>.
                </p>
                {(turma.aulas_fixas || []).length > 0 && (
                  <p className="text-destructive">
                    Os {(turma.aulas_fixas || []).length} travamentos atuais desta turma serão apagados.
                  </p>
                )}
                <p>Alterações não salvas nesta tela serão descartadas.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={copiando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={e => { e.preventDefault(); confirmarCopia(); }}
              disabled={copiando}
            >
              {copiando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Copiar e substituir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
