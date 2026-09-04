'use client';

import { useEffect, useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Users, Save, CreditCard, CheckCircle2, Clock, ChevronDown, Link2 } from 'lucide-react';
import { upsertProfessor } from './actions';
import type { ProfessorComDados, Turno, ComponenteCurricular } from '@/lib/types';
import {
  GEMINACAO_PERSONALIZADA_PADRAO,
  OPCOES_MAX_CONSECUTIVAS,
  OPCOES_MAX_NO_DIA,
  comRegra,
  normalizarGeminacaoPersonalizada,
  resumoDaRegra,
} from '@/lib/geminacao-professor';

import { Separator } from '@/components/ui/separator';
import { cn, validateCPF } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';

const formSchema = z.object({
  id: z.string().optional(),
  escola_id: z.union([z.string(), z.number()]).transform(val => String(val)),
  cpf: z.string().min(14, 'O CPF é obrigatório.').refine(validateCPF, 'CPF inválido.'),
  nome_completo: z.string().min(3, 'O nome completo é obrigatório.'),
  nome_horario: z.string().min(2, 'O nome para o horário é obrigatório.'),
  email: z.string().email('Email inválido.').optional().or(z.literal('')),
  turnos_ids: z.array(z.string()).min(1, 'Selecione ao menos um turno.'),
  componente_ids: z.array(z.string()),
  aulas_disponiveis: z.coerce.number().min(0, 'As aulas disponíveis não podem ser negativas.'),
  aulas_planejamento: z.coerce.number().min(0, 'As aulas de planejamento não podem ser negativas.'),
  restricoes: z.any().optional(),
  livre_docencia: z.array(z.object({
      dia: z.string(),
      periodo: z.enum(['matutino', 'vespertino', 'noturno'])
  })).max(2).default([]),
  sem_preferencia_livre_docencia: z.boolean().default(false),
  justificativa: z.string().nullable().optional(),
  dias_preferidos: z.array(z.string()).default([]),
  /**
   * `componente_id` → regra. Matéria sem entrada aqui (ou o campo inteiro em
   * `null`) segue a configuração de geminação da tela de gerar horário; onde há
   * entrada, ela manda — ver `src/lib/geminacao-professor.ts`.
   */
  geminacao_personalizada: z
    .record(
      z.string(),
      z.object({
        max_consecutivas: z.union([z.literal(2), z.literal(3)]),
        max_no_dia: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
      }),
    )
    .nullable()
    .default(null),
});

type FormValues = z.infer<typeof formSchema>;

type Props = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  professor: ProfessorComDados | null;
  escolaId: string | number;
  turnosDaEscola: Turno[];
  componentesDaEscola: ComponenteCurricular[];
  onProfessorUpdated: () => void;
  onCadastrarRestricoes?: (professorId: string) => void;
};

export function EditProfessorSheet({
  isOpen,
  setIsOpen,
  professor,
  escolaId,
  turnosDaEscola,
  componentesDaEscola,
  onProfessorUpdated,
  onCadastrarRestricoes,
}: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [savedProfessorId, setSavedProfessorId] = useState<string | null>(null);
  const [disciplinasAbertas, setDisciplinasAbertas] = useState(false);
  const isEdit = !!professor;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      escola_id: String(escolaId),
      cpf: '',
      nome_completo: '',
      nome_horario: '',
      email: '',
      turnos_ids: [],
      componente_ids: [],
      aulas_disponiveis: 24,
      aulas_planejamento: 5,
      restricoes: {},
      livre_docencia: [],
      sem_preferencia_livre_docencia: false,
      justificativa: '',
      dias_preferidos: [],
      geminacao_personalizada: null,
    },
  });

  useEffect(() => {
    if (isOpen) {
      document.body.style.pointerEvents = 'auto';
      setIsSuccessModalOpen(false);
      setSavedProfessorId(null);
      // Abre a seção sozinha quando há o que conferir lá dentro: professor novo
      // (precisa marcar disciplina) ou geminação personalizada já gravada, que
      // ficaria invisível atrás da setinha.
      setDisciplinasAbertas(
        !professor || !!normalizarGeminacaoPersonalizada(professor.geminacao_personalizada)
      );
      form.reset({
        id: professor?.id,
        escola_id: String(escolaId),
        cpf: professor?.cpf ?? '',
        nome_completo: professor?.nome_completo ?? '',
        nome_horario: professor?.nome_horario ?? '',
        email: professor?.email ?? '',
        turnos_ids: professor?.turnos_ids ?? [],
        componente_ids: professor?.componentes.map(c => c.id) ?? [],
        aulas_disponiveis: professor?.aulas_disponiveis ?? 24,
        aulas_planejamento: professor?.aulas_planejamento ?? 5,
        restricoes: professor?.restricoes ?? {},
        livre_docencia: professor?.livre_docencia ?? [],
        sem_preferencia_livre_docencia: professor?.sem_preferencia_livre_docencia ?? false,
        justificativa: professor?.justificativa ?? '',
        dias_preferidos: professor?.dias_preferidos ?? [],
        geminacao_personalizada: normalizarGeminacaoPersonalizada(professor?.geminacao_personalizada),
      });
    }
  }, [isOpen, professor, escolaId, form]);

  /**
   * As disciplinas marcadas, na ordem do cadastro da escola.
   *
   * Elas ficam à mostra mesmo com a seção fechada, e são a lista sobre a qual a
   * geminação é configurada: o acordo é por matéria, então não há o que
   * configurar para quem o professor não leciona.
   */
  const componenteIds = form.watch('componente_ids') ?? [];
  const geminacaoAtual = form.watch('geminacao_personalizada');
  const disciplinasSelecionadas = useMemo(
    () => componentesDaEscola.filter((c) => componenteIds.includes(c.id)),
    [componentesDaEscola, componenteIds],
  );

  const formatCPF = (value: string) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})/, '$1-$2')
      .slice(0, 14);
  };

  const onSubmit = async (data: FormValues) => {
    setLoading(true);
    try {
      const result = await upsertProfessor(data);
      if (result?.error) {
        toast({ title: 'Erro', description: result.error, variant: 'destructive' });
        return;
      }

      if (isEdit) {
        if (result.alerta) {
          toast({ title: 'Importante', description: result.alerta });
        } else {
          toast({ title: 'Professor Atualizado', description: `Os dados de "${data.nome_completo}" foram salvos.` });
        }
        setIsOpen(false);
        onProfessorUpdated();
      } else {
        // Novo professor: mostra modal de confirmação
        setSavedProfessorId(result.data?.id ?? null);
        setIsSuccessModalOpen(true);
      }
    } catch {
      toast({ title: 'Erro', description: 'Erro interno ao processar.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeixarParaDepois = () => {
    setIsSuccessModalOpen(false);
    setIsOpen(false);
    onProfessorUpdated();
  };

  const handleCadastrarRestricoes = () => {
    setIsSuccessModalOpen(false);
    setIsOpen(false);
    if (savedProfessorId) {
      onCadastrarRestricoes?.(savedProfessorId);
    } else {
      onProfessorUpdated();
    }
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent onPointerDownOutside={(e) => e.preventDefault()} className="flex flex-col h-full pointer-events-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {isEdit ? 'Editar Professor' : 'Novo Professor'}
            </SheetTitle>
            <SheetDescription>
              Preencha os dados básicos e atribuições do docente.
            </SheetDescription>
          </SheetHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex-1 flex flex-col overflow-hidden">
              <div data-tutorial="professores-sheet-dados" className="flex-1 space-y-6 py-6 overflow-y-auto pr-2">
                <div className="space-y-6">
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Identificação e Contato</h4>

                    <FormField control={form.control} name="cpf" render={({ field }) => (
                      <FormItem data-tutorial="professores-sheet-cpf">
                        <FormLabel className="flex items-center gap-2"><CreditCard className="h-3.5 w-3.5" /> CPF (Obrigatório)</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="000.000.000-00"
                            {...field}
                            onChange={(e) => field.onChange(formatCPF(e.target.value))}
                            maxLength={14}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="nome_completo" render={({ field }) => (
                      <FormItem data-tutorial="professores-sheet-nome">
                        <FormLabel>Nome Completo</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField control={form.control} name="nome_horario" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nome p/ Horário (Exibição)</FormLabel>
                          <FormControl><Input {...field} placeholder="Ex: Prof. Carlos" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />

                      <FormField control={form.control} name="email" render={({ field }) => (
                        <FormItem>
                          <FormLabel>E-mail institucional</FormLabel>
                          <FormControl>
                            <Input type="email" {...field} value={field.value ?? ''} placeholder="nome@educacao.to.gov.br" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Carga e Turnos</h4>
                    <FormField control={form.control} name="aulas_disponiveis" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Aulas Semanais (C.H.)</FormLabel>
                        <FormControl><Input type="number" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <div className="space-y-3">
                      <FormLabel>Turnos de Atuação</FormLabel>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {turnosDaEscola.map((turno) => (
                          <FormField
                            key={turno.id}
                            control={form.control}
                            name="turnos_ids"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-center space-x-3 space-y-0 p-3 border rounded-md hover:bg-muted/50 transition-colors">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value?.includes(turno.id)}
                                    onCheckedChange={(checked) => {
                                      return checked
                                        ? field.onChange([...field.value, turno.id])
                                        : field.onChange(field.value?.filter((v) => v !== turno.id));
                                    }}
                                  />
                                </FormControl>
                                <FormLabel className="font-normal cursor-pointer text-xs uppercase">
                                  {turno.nome}
                                </FormLabel>
                              </FormItem>
                            )}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <Collapsible open={disciplinasAbertas} onOpenChange={setDisciplinasAbertas} className="space-y-4">
                    <CollapsibleTrigger asChild>
                      <button type="button" className="flex w-full items-center gap-2 text-left group">
                        <ChevronDown
                          className={cn(
                            'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
                            !disciplinasAbertas && '-rotate-90'
                          )}
                        />
                        <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground group-hover:text-foreground transition-colors">
                          Disciplinas Habilitadas
                        </h4>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {disciplinasSelecionadas.length > 0
                            ? `${disciplinasSelecionadas.length} selecionada${disciplinasSelecionadas.length > 1 ? 's' : ''}`
                            : 'nenhuma selecionada'}
                        </span>
                      </button>
                    </CollapsibleTrigger>

                    {/*
                      As selecionadas ficam à mostra com a seção fechada. Sem isto a
                      setinha esconde duas coisas que precisam ser vistas de relance: a
                      geminação combinada (que vence a tela de geração) e a ausência de
                      disciplina — professor sem disciplina some da alocação de turmas
                      sem nada indicar o motivo.
                    */}
                    {!disciplinasAbertas && (
                      <div className="flex flex-wrap gap-2 pl-6">
                        {disciplinasSelecionadas.length > 0 ? disciplinasSelecionadas.map((comp) => {
                          const regra = geminacaoAtual?.[comp.id];
                          return (
                            <span
                              key={comp.id}
                              className="inline-flex items-center gap-2 rounded-full border bg-muted/40 px-3 py-1 text-xs"
                            >
                              <span className="font-medium">{comp.nome}</span>
                              <span className="text-muted-foreground">({comp.sigla})</span>
                              {regra && (
                                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                                  {resumoDaRegra(regra)}
                                </span>
                              )}
                            </span>
                          );
                        }) : (
                          <p className="text-xs italic text-muted-foreground">
                            Nenhuma disciplina selecionada. Abra para escolher.
                          </p>
                        )}
                      </div>
                    )}

                    <CollapsibleContent className="space-y-4">
                      {/* Geminação personalizada — por matéria, acima da tela de geração */}
                      <FormField
                        control={form.control}
                        name="geminacao_personalizada"
                        render={({ field }) => (
                          <FormItem className="rounded-md border p-4 space-y-3">
                            <div className="space-y-1">
                              <FormLabel className="flex items-center gap-2 text-sm font-semibold">
                                <Link2 className="h-3.5 w-3.5" /> Geminação personalizada
                              </FormLabel>
                              <p className="text-xs text-muted-foreground">
                                Combinada <strong>por matéria</strong>, e vale <strong>acima</strong> da
                                configuração da tela de gerar horário nas turmas deste professor. Matéria sem
                                nada marcado aqui continua seguindo aquela tela.
                              </p>
                            </div>

                            {disciplinasSelecionadas.length === 0 ? (
                              <p className="text-xs italic text-muted-foreground">
                                Marque as disciplinas abaixo para combinar a geminação de cada uma.
                              </p>
                            ) : (
                              <div className="space-y-3">
                                {disciplinasSelecionadas.map((comp) => {
                                  const regra = field.value?.[comp.id] ?? null;
                                  return (
                                    <div key={comp.id} className="rounded-md border bg-muted/30 p-3 space-y-3">
                                      <div className="flex items-center justify-between gap-3">
                                        <p className="text-sm font-medium">
                                          {comp.nome}{' '}
                                          <span className="font-normal text-muted-foreground">({comp.sigla})</span>
                                        </p>
                                        <FormControl>
                                          <Switch
                                            checked={!!regra}
                                            onCheckedChange={(ligado) =>
                                              field.onChange(
                                                comRegra(
                                                  field.value,
                                                  comp.id,
                                                  ligado ? GEMINACAO_PERSONALIZADA_PADRAO : null,
                                                ),
                                              )
                                            }
                                          />
                                        </FormControl>
                                      </div>

                                      {regra ? (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                          <div className="space-y-2">
                                            <p className="text-xs font-medium">Máximo de aulas consecutivas</p>
                                            <div className="flex gap-2">
                                              {OPCOES_MAX_CONSECUTIVAS.map((n) => (
                                                <Button
                                                  key={n}
                                                  type="button"
                                                  size="sm"
                                                  variant={regra.max_consecutivas === n ? 'default' : 'outline'}
                                                  className="h-8 px-4"
                                                  onClick={() =>
                                                    field.onChange(
                                                      comRegra(field.value, comp.id, {
                                                        max_consecutivas: n,
                                                        // O teto do dia nunca fica abaixo da emenda: bloco
                                                        // de 3 com teto 2 é pedido impossível, e o motor
                                                        // corrigiria em silêncio — melhor a tela já subir.
                                                        max_no_dia: Math.max(n, regra.max_no_dia) as 2 | 3 | 4 | 5,
                                                      }),
                                                    )
                                                  }
                                                >
                                                  {n}x
                                                </Button>
                                              ))}
                                            </div>
                                            <p className="text-[11px] text-muted-foreground">
                                              Bloco de aulas seguidas, no mesmo dia.
                                            </p>
                                          </div>

                                          <div className="space-y-2">
                                            <p className="text-xs font-medium">Máximo de aulas no mesmo dia</p>
                                            <div className="flex flex-wrap gap-2">
                                              {OPCOES_MAX_NO_DIA.map((n) => (
                                                <Button
                                                  key={n}
                                                  type="button"
                                                  size="sm"
                                                  disabled={n < regra.max_consecutivas}
                                                  variant={regra.max_no_dia === n ? 'default' : 'outline'}
                                                  className="h-8 px-4"
                                                  onClick={() =>
                                                    field.onChange(
                                                      comRegra(field.value, comp.id, {
                                                        max_consecutivas: regra.max_consecutivas,
                                                        max_no_dia: n,
                                                      }),
                                                    )
                                                  }
                                                >
                                                  {n}x
                                                </Button>
                                              ))}
                                            </div>
                                            <p className="text-[11px] text-muted-foreground">
                                              Total no dia, somando o bloco e as aulas avulsas.
                                            </p>
                                          </div>
                                        </div>
                                      ) : (
                                        <p className="text-[11px] text-muted-foreground">
                                          Segue a configuração da tela de gerar horário.
                                        </p>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {componentesDaEscola.length > 0 ? componentesDaEscola.map((comp) => (
                          <FormField
                            key={comp.id}
                            control={form.control}
                            name="componente_ids"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-center space-x-3 space-y-0 p-3 border rounded-md hover:bg-muted/50 transition-colors">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value?.includes(comp.id)}
                                    onCheckedChange={(checked) => {
                                      if (checked) {
                                        field.onChange([...field.value, comp.id]);
                                        return;
                                      }
                                      field.onChange(field.value?.filter((v) => v !== comp.id));
                                      // A regra da matéria sai junto com ela. Deixá-la para
                                      // trás grava geminação de disciplina que o professor
                                      // não leciona — invisível na tela e ativa no motor se
                                      // ele voltar a lecioná-la um semestre depois.
                                      form.setValue(
                                        'geminacao_personalizada',
                                        comRegra(form.getValues('geminacao_personalizada'), comp.id, null),
                                      );
                                    }}
                                  />
                                </FormControl>
                                <FormLabel className="font-normal cursor-pointer text-xs">
                                  {comp.nome} ({comp.sigla})
                                </FormLabel>
                              </FormItem>
                            )}
                          />
                        )) : (
                          <p className="text-xs text-muted-foreground col-span-full italic">Nenhum componente cadastrado.</p>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              </div>

              <SheetFooter data-tutorial="professores-sheet-rodape" className="mt-auto border-t pt-4 bg-background">
                <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={loading} className="min-w-[180px] font-bold">
                  {loading
                    ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Salvando...</>
                    : <><Save className="mr-2 h-4 w-4" /> Salvar Informações</>
                  }
                </Button>
              </SheetFooter>
            </form>
          </Form>
        </SheetContent>
      </Sheet>

      {/* Modal de confirmação pós-cadastro (apenas para novos professores) */}
      <AlertDialog open={isSuccessModalOpen} onOpenChange={setIsSuccessModalOpen}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-5 w-5" />
              Informações de professor salvas com Sucesso!
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base pt-1">
              Deseja cadastrar as restrições de horário e a livre docência agora?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex items-center gap-2 border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-950/30"
              onClick={handleDeixarParaDepois}
            >
              <Clock className="h-4 w-4" /> Deixar para depois
            </Button>
            <Button
              type="button"
              className="font-bold"
              onClick={handleCadastrarRestricoes}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" /> Cadastrar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
