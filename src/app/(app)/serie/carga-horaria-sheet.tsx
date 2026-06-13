
'use client';

import { useEffect, useState } from 'react';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Lock, LockOpen, Plus, X, Users, User } from 'lucide-react';
import { updateCargaHoraria } from './actions';
import type { SerieComDados, ComponenteCurricular, Turno, ProfessorComDados } from '@/lib/types';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

const DIAS_SEMANA_LABELS: Record<string, string> = {
  segunda: 'Segunda-feira',
  terca: 'Terça-feira',
  quarta: 'Quarta-feira',
  quinta: 'Quinta-feira',
  sexta: 'Sexta-feira',
  sabado: 'Sábado',
};

const aulaFixaSchema = z.object({
  id: z.string().optional(),
  componente_id: z.string(),
  tipo_aula: z.enum(['presencial', 'nao_presencial']),
  dia_semana: z.string().min(1, 'Selecione um dia.'),
  aula_index: z.coerce.number().min(0),
  compartilhada: z.boolean().default(false),
  professor_responsavel_id: z.string().nullable().optional(),
});

const formSchema = z.object({
  serie_id: z.string(),
  aulas_nao_presenciais_semanais: z.coerce.number().min(0, 'O valor deve ser positivo.'),
  componentes: z.array(z.object({
    componente_id: z.string(),
    aulas_presenciais: z.coerce.number().min(0),
    aulas_nao_presenciais: z.coerce.number().min(0),
  })),
  aulas_fixas: z.array(aulaFixaSchema).default([]),
});

type FormValues = z.infer<typeof formSchema>;

type Props = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  serie: SerieComDados;
  dependencies: {
    componentes: ComponenteCurricular[];
    turnos: Turno[];
    professores?: ProfessorComDados[];
  };
  onCargaUpdated: () => void;
};

export function CargaHorariaSheet({ isOpen, setIsOpen, serie, dependencies, onCargaUpdated }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [hasContraturno, setHasContraturno] = useState(false);
  const [expandedFixas, setExpandedFixas] = useState<Set<string>>(new Set());

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      serie_id: serie.id,
      aulas_nao_presenciais_semanais: serie.aulas_nao_presenciais_semanais || 0,
      componentes: [],
      aulas_fixas: [],
    },
  });

  const { fields } = useFieldArray({ control: form.control, name: 'componentes' });
  const { fields: fixasFields, append: appendFixa, remove: removeFixa } = useFieldArray({
    control: form.control,
    name: 'aulas_fixas',
  });

  const watchedComponentes = useWatch({ control: form.control, name: 'componentes' });
  const watchedFixas = useWatch({ control: form.control, name: 'aulas_fixas' });
  const watchedTotalNP = useWatch({ control: form.control, name: 'aulas_nao_presenciais_semanais' });

  const totalPresenciaisDistribuidas = watchedComponentes.reduce((sum, comp) => sum + Number(comp.aulas_presenciais || 0), 0);
  const saldoAulasPresenciais = serie.total_aulas_presenciais_semanais - totalPresenciaisDistribuidas;
  const totalNPDistribuidas = watchedComponentes.reduce((sum, comp) => sum + Number(comp.aulas_nao_presenciais || 0), 0);
  const saldoAulasNP = watchedTotalNP - totalNPDistribuidas;

  useEffect(() => {
    if (isOpen) {
      if (serie.turno) {
        const turnoNome = serie.turno.nome.toLowerCase();
        if (turnoNome.includes('matutino')) {
          setHasContraturno(dependencies.turnos.some(t => t.nome.toLowerCase().includes('vespertino') && t.ativo));
        } else if (turnoNome.includes('vespertino')) {
          setHasContraturno(dependencies.turnos.some(t => t.nome.toLowerCase().includes('matutino') && t.ativo));
        } else {
          setHasContraturno(false);
        }
      }

      const cargaExistente = new Map(serie.componentes.map(c => [c.componente_id, { p: c.aulas_presenciais, np: c.aulas_nao_presenciais }]));
      const formComponentes = dependencies.componentes.map(comp => ({
        componente_id: comp.id,
        aulas_presenciais: cargaExistente.get(comp.id)?.p || 0,
        aulas_nao_presenciais: cargaExistente.get(comp.id)?.np || 0,
      }));

      form.reset({
        serie_id: serie.id,
        aulas_nao_presenciais_semanais: serie.aulas_nao_presenciais_semanais || 0,
        componentes: formComponentes,
        aulas_fixas: (serie.aulas_fixas || []).map(af => ({
          id: af.id,
          componente_id: af.componente_id,
          tipo_aula: af.tipo_aula,
          dia_semana: af.dia_semana,
          aula_index: af.aula_index,
          compartilhada: af.compartilhada,
          professor_responsavel_id: af.professor_responsavel_id,
        })),
      });

      // Expand components that already have fixações
      const withFixas = new Set<string>();
      (serie.aulas_fixas || []).forEach(af => withFixas.add(af.componente_id));
      setExpandedFixas(withFixas);
    }
  }, [isOpen, serie, dependencies, form]);

  const onSubmit = async (data: FormValues) => {
    setLoading(true);
    const result = await updateCargaHoraria(data);
    setLoading(false);

    if (result.error) {
      toast({ title: 'Erro', description: result.error, variant: 'destructive' });
      return;
    }

    toast({ title: 'Sucesso', description: 'Carga horária salva.' });
    onCargaUpdated();
    setIsOpen(false);
  };

  const getComponenteInfo = (id: string) => dependencies.componentes.find(c => c.id === id);

  const toggleExpanded = (componenteId: string) => {
    setExpandedFixas(prev => {
      const next = new Set(prev);
      if (next.has(componenteId)) next.delete(componenteId);
      else next.add(componenteId);
      return next;
    });
  };

  const getFixasDoComponente = (componenteId: string) =>
    fixasFields.map((f, idx) => ({ ...f, idx })).filter(f => f.componente_id === componenteId);

  const getCargaComponente = (componenteId: string, tipo: 'presencial' | 'nao_presencial') => {
    const comp = watchedComponentes.find(c => c.componente_id === componenteId);
    return tipo === 'presencial' ? (comp?.aulas_presenciais || 0) : (comp?.aulas_nao_presenciais || 0);
  };

  const getSlotConflito = (dia: string, aulaIndex: number, tipo: 'presencial' | 'nao_presencial', ignorarComponenteId?: string): string | null => {
    for (const f of watchedFixas) {
      if (f.dia_semana === dia && f.aula_index === aulaIndex && f.tipo_aula === tipo) {
        if (ignorarComponenteId && f.componente_id === ignorarComponenteId) continue;
        const comp = getComponenteInfo(f.componente_id);
        return comp?.nome || 'outro componente';
      }
    }
    return null;
  };

  const diasDoTurno = serie.turno?.dias_semana || [];
  const aulasPorDia = serie.turno?.aulas_por_dia || 0;
  const horarios = serie.turno?.horarios || [];

  // Build candidate professors from dependencies or turmas vinculadas
  const professoresDisponiveis = dependencies.professores || [];

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent onPointerDownOutside={(e) => e.preventDefault()} className="sm:max-w-2xl flex flex-col">
        <SheetHeader>
          <SheetTitle>Carga Horária da Série: {serie.nome}</SheetTitle>
          <SheetDescription>Defina a quantidade de aulas e, opcionalmente, fixe dia/horário por disciplina.</SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form id="carga-form" onSubmit={form.handleSubmit(onSubmit)} className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto pr-2 -mr-4 space-y-4 py-4">

              {/* ── Totalizadores ── */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 border rounded-lg bg-muted">
                  <p className="text-sm font-medium mb-2 text-center">Aulas Presenciais</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div><p className="font-bold text-lg">{serie.total_aulas_presenciais_semanais}</p><p className="text-xs text-muted-foreground">Total</p></div>
                    <div><p className="font-bold text-lg">{totalPresenciaisDistribuidas}</p><p className="text-xs text-muted-foreground">Distribuídas</p></div>
                    <div><p className={cn("font-bold text-lg", saldoAulasPresenciais < 0 && "text-destructive")}>{saldoAulasPresenciais}</p><p className="text-xs text-muted-foreground">Saldo</p></div>
                  </div>
                </div>
                <div className="p-4 border rounded-lg bg-muted">
                  <p className="text-sm font-medium mb-2 text-center">Aulas Não Presenciais</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <FormField control={form.control} name="aulas_nao_presenciais_semanais"
                      render={({ field }) => (
                        <FormItem className="space-y-0 text-center">
                          <FormControl>
                            <Input type="number" min="0" {...field} className="h-8 text-lg font-bold text-center p-0 bg-transparent border-0 focus-visible:ring-0" disabled={!hasContraturno} />
                          </FormControl>
                          <FormLabel className="text-xs font-normal text-muted-foreground">Total</FormLabel>
                        </FormItem>
                      )}
                    />
                    <div><p className="font-bold text-lg">{totalNPDistribuidas}</p><p className="text-xs text-muted-foreground">Distribuídas</p></div>
                    <div><p className={cn("font-bold text-lg", saldoAulasNP < 0 && "text-destructive")}>{saldoAulasNP}</p><p className="text-xs text-muted-foreground">Saldo</p></div>
                  </div>
                </div>
              </div>

              {!hasContraturno && (
                <p className="text-xs text-center text-orange-600 bg-orange-50 p-2 rounded-md dark:text-orange-400 dark:bg-orange-950/30">
                  Para habilitar aulas não presenciais (contraturno), o turno oposto precisa estar ativo na tela de Turnos.
                </p>
              )}

              <Separator />

              {/* ── Lista de componentes ── */}
              <div className="space-y-3">
                {fields.map((field, index) => {
                  const componente = getComponenteInfo(field.componente_id);
                  if (!componente) return null;
                  const isExpanded = expandedFixas.has(componente.id);
                  const fixasDesteComp = getFixasDoComponente(componente.id);
                  const cargaP = getCargaComponente(componente.id, 'presencial');
                  const cargaNP = getCargaComponente(componente.id, 'nao_presencial');
                  const maxFixasP = cargaP;
                  const maxFixasNP = cargaNP;

                  return (
                    <div key={field.id} className="border rounded-lg overflow-hidden">
                      {/* Linha principal */}
                      <div className="p-3 bg-card flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleExpanded(componente.id)}
                            className={cn(
                              "p-1.5 rounded-md transition-colors",
                              isExpanded ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                            )}
                            title={isExpanded ? "Ocultar fixações" : "Fixar horário"}
                          >
                            {isExpanded ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
                          </button>
                          <p className="font-semibold text-sm">{componente.nome} ({componente.sigla})</p>
                          {fixasDesteComp.length > 0 && (
                            <span className="text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded uppercase tracking-wider">
                              {fixasDesteComp.length} fixada{fixasDesteComp.length > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4">
                          <FormField control={form.control} name={`componentes.${index}.aulas_presenciais`}
                            render={({ field: aulasField }) => (
                              <FormItem className="flex items-center gap-2 space-y-0">
                                <FormLabel className="text-xs">Pres.</FormLabel>
                                <FormControl>
                                  <Input type="number" min="0" {...aulasField} className="w-20" />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                          <FormField control={form.control} name={`componentes.${index}.aulas_nao_presenciais`}
                            render={({ field: aulasField }) => (
                              <FormItem className="flex items-center gap-2 space-y-0">
                                <FormLabel className="text-xs">Não Pres.</FormLabel>
                                <FormControl>
                                  <Input type="number" min="0" {...aulasField} className="w-20" disabled={!hasContraturno} />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>

                      {/* Painel de fixações */}
                      {isExpanded && (
                        <div className="border-t bg-muted/30 p-3 space-y-3">
                          {fixasDesteComp.map(({ idx }) => {
                            const tipoAtual = watchedFixas[idx]?.tipo_aula || 'presencial';
                            const maxFixas = tipoAtual === 'presencial' ? maxFixasP : maxFixasNP;
                            const fixasDoTipo = fixasDesteComp.filter(f => watchedFixas[f.idx]?.tipo_aula === tipoAtual).length;
                            const compartilhada = watchedFixas[idx]?.compartilhada || false;
                            const diaAtual = watchedFixas[idx]?.dia_semana || '';
                            const aulaAtual = watchedFixas[idx]?.aula_index ?? -1;
                            const conflito = diaAtual && aulaAtual >= 0
                              ? getSlotConflito(diaAtual, aulaAtual, tipoAtual, componente.id)
                              : null;

                            return (
                              <div key={idx} className={cn(
                                "bg-background border rounded-lg p-3 space-y-3",
                                conflito && "border-destructive/40 bg-destructive/5"
                              )}>
                                <div className="flex items-center gap-2 flex-wrap">
                                  {/* Tipo */}
                                  <FormField control={form.control} name={`aulas_fixas.${idx}.tipo_aula`}
                                    render={({ field: f }) => (
                                      <Select value={f.value} onValueChange={f.onChange}>
                                        <SelectTrigger className="h-8 w-36 text-xs">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="presencial">Presencial</SelectItem>
                                          {hasContraturno && <SelectItem value="nao_presencial">Não presencial</SelectItem>}
                                        </SelectContent>
                                      </Select>
                                    )}
                                  />

                                  {/* Dia */}
                                  <FormField control={form.control} name={`aulas_fixas.${idx}.dia_semana`}
                                    render={({ field: f }) => (
                                      <Select value={f.value} onValueChange={f.onChange}>
                                        <SelectTrigger className="h-8 w-36 text-xs">
                                          <SelectValue placeholder="Dia..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {diasDoTurno.map(d => (
                                            <SelectItem key={d} value={d}>{DIAS_SEMANA_LABELS[d] || d}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    )}
                                  />

                                  {/* Aula/horário */}
                                  <FormField control={form.control} name={`aulas_fixas.${idx}.aula_index`}
                                    render={({ field: f }) => (
                                      <Select
                                        value={f.value?.toString() ?? ''}
                                        onValueChange={v => f.onChange(Number(v))}
                                      >
                                        <SelectTrigger className="h-8 w-44 text-xs">
                                          <SelectValue placeholder="Aula..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {Array.from({ length: aulasPorDia }, (_, i) => {
                                            const h = horarios[i];
                                            return (
                                              <SelectItem key={i} value={i.toString()}>
                                                {i + 1}ª Aula{h ? ` (${h.inicio}–${h.fim})` : ''}
                                              </SelectItem>
                                            );
                                          })}
                                        </SelectContent>
                                      </Select>
                                    )}
                                  />

                                  <button type="button" onClick={() => removeFixa(idx)}
                                    className="ml-auto p-1.5 rounded-md text-destructive/60 hover:text-destructive hover:bg-destructive/10 transition-colors">
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>

                                {/* Toggle compartilhada */}
                                <FormField control={form.control} name={`aulas_fixas.${idx}.compartilhada`}
                                  render={({ field: f }) => (
                                    <div className="flex items-center gap-2">
                                      <Switch id={`comp-${idx}`} checked={f.value} onCheckedChange={f.onChange} />
                                      <label htmlFor={`comp-${idx}`} className="text-xs cursor-pointer flex items-center gap-1.5">
                                        {f.value
                                          ? <><Users className="h-3 w-3 text-primary" /><span className="font-semibold text-primary">Aula coletiva (turmas juntas)</span></>
                                          : <><User className="h-3 w-3 text-muted-foreground" /><span className="text-muted-foreground">Individual por turma</span></>
                                        }
                                      </label>
                                    </div>
                                  )}
                                />

                                {/* Professor responsável (somente para compartilhada) */}
                                {compartilhada && professoresDisponiveis.length > 0 && (
                                  <FormField control={form.control} name={`aulas_fixas.${idx}.professor_responsavel_id`}
                                    render={({ field: f }) => (
                                      <FormItem className="space-y-1">
                                        <FormLabel className="text-xs text-muted-foreground">Professor responsável pela aula coletiva</FormLabel>
                                        <Select value={f.value || ''} onValueChange={v => f.onChange(v || null)}>
                                          <SelectTrigger className="h-8 text-xs">
                                            <SelectValue placeholder="Deixar vazio = usar prof. único da turma" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="">Automático (usar prof. único)</SelectItem>
                                            {professoresDisponiveis.map(p => (
                                              <SelectItem key={p.id} value={p.id}>{p.nome_horario}</SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </FormItem>
                                    )}
                                  />
                                )}

                                {conflito && (
                                  <p className="text-xs text-destructive font-medium">
                                    ⚠ Conflito: <strong>{conflito}</strong> já está fixado neste slot.
                                  </p>
                                )}

                                {fixasDoTipo > maxFixas && maxFixas > 0 && (
                                  <p className="text-xs text-destructive font-medium">
                                    ⚠ Mais fixações ({fixasDoTipo}) do que aulas {tipoAtual === 'presencial' ? 'presenciais' : 'não presenciais'} definidas ({maxFixas}).
                                  </p>
                                )}
                              </div>
                            );
                          })}

                          {/* Botão adicionar fixação */}
                          {(fixasDesteComp.filter(f => watchedFixas[f.idx]?.tipo_aula === 'presencial').length < maxFixasP || maxFixasP === 0) ||
                           (hasContraturno && fixasDesteComp.filter(f => watchedFixas[f.idx]?.tipo_aula === 'nao_presencial').length < maxFixasNP) ? (
                            <button
                              type="button"
                              onClick={() => appendFixa({
                                componente_id: componente.id,
                                tipo_aula: 'presencial',
                                dia_semana: diasDoTurno[0] || '',
                                aula_index: 0,
                                compartilhada: false,
                                professor_responsavel_id: null,
                              })}
                              className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium py-1"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Adicionar fixação
                            </button>
                          ) : (
                            <p className="text-xs text-muted-foreground italic">
                              Todas as aulas deste componente já possuem fixação.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <SheetFooter className="mt-auto border-t pt-4">
              <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>Cancelar</Button>
              <Button type="submit" form="carga-form" disabled={loading} className="min-w-[100px]">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
