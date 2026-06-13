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
import { useToast } from '@/hooks/use-toast';
import { Loader2, Users, Save, CreditCard, CheckCircle2, Clock } from 'lucide-react';
import { upsertProfessor } from './actions';
import type { ProfessorComDados, Turno, ComponenteCurricular } from '@/lib/types';

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
    },
  });

  useEffect(() => {
    if (isOpen) {
      document.body.style.pointerEvents = 'auto';
      setIsSuccessModalOpen(false);
      setSavedProfessorId(null);
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
      });
    }
  }, [isOpen, professor, escolaId, form]);

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
              <div className="flex-1 space-y-6 py-6 overflow-y-auto pr-2">
                <div className="space-y-6">
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Identificação e Contato</h4>

                    <FormField control={form.control} name="cpf" render={({ field }) => (
                      <FormItem>
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
                      <FormItem>
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
                    <div className="grid grid-cols-2 gap-4">
                      <FormField control={form.control} name="aulas_disponiveis" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Aulas Semanais (C.H.)</FormLabel>
                          <FormControl><Input type="number" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="aulas_planejamento" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Aulas de Planejamento</FormLabel>
                          <FormControl><Input type="number" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>

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

                  <div className="space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Disciplinas Habilitadas</h4>
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
                                    return checked
                                      ? field.onChange([...field.value, comp.id])
                                      : field.onChange(field.value?.filter((v) => v !== comp.id));
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
                  </div>
                </div>
              </div>

              <SheetFooter className="mt-auto border-t pt-4 bg-background">
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
