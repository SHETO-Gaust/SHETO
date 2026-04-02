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
import { Loader2, Users, ArrowRight, ArrowLeft, CalendarX, Ban, PenSquare } from 'lucide-react';
import { upsertProfessor } from './actions';
import type { ProfessorComDados, Turno, ComponenteCurricular } from '@/lib/types';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from '@/lib/utils';

const DIAS_SEMANA_MAP = [
  { id: 'segunda', label: 'Seg' }, { id: 'terca', label: 'Ter' },
  { id: 'quarta', label: 'Qua' }, { id: 'quinta', label: 'Qui' },
  { id: 'sexta', label: 'Sex' }, { id: 'sabado', label: 'Sáb' },
];

const formSchema = z.object({
  id: z.string().optional(),
  escola_id: z.union([z.string(), z.number()]).transform(val => String(val)),
  nome_completo: z.string().min(3, 'O nome completo é obrigatório.'),
  nome_horario: z.string().min(2, 'O nome para o horário é obrigatório.'),
  email: z.string().email('Email inválido.').optional().or(z.literal('')),
  turnos_ids: z.array(z.string()).min(1, 'Selecione ao menos um turno.'),
  componente_ids: z.array(z.string()),
  aulas_disponiveis: z.coerce.number().min(0, 'As aulas disponíveis não podem ser negativas.'),
  aulas_planejamento: z.coerce.number().min(0, 'As aulas de planejamento não podem ser negativas.'),
  restricoes: z.any().optional(),
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
};

export function EditProfessorSheet({ 
  isOpen, 
  setIsOpen, 
  professor, 
  escolaId, 
  turnosDaEscola, 
  componentesDaEscola,
  onProfessorUpdated 
}: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'info' | 'restricoes'>('info');
  const isEdit = !!professor;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      escola_id: String(escolaId),
      nome_completo: '',
      nome_horario: '',
      email: '',
      turnos_ids: [],
      componente_ids: [],
      aulas_disponiveis: 24,
      aulas_planejamento: 5,
      restricoes: {},
    },
  });

  useEffect(() => {
    if (isOpen) {
      document.body.style.pointerEvents = 'auto';
      setStep('info');
      form.reset({
        id: professor?.id,
        escola_id: String(escolaId),
        nome_completo: professor?.nome_completo ?? '',
        nome_horario: professor?.nome_horario ?? '',
        email: professor?.email ?? '',
        turnos_ids: professor?.turnos_ids ?? [],
        componente_ids: professor?.componentes.map(c => c.id) ?? [],
        aulas_disponiveis: professor?.aulas_disponiveis ?? 24,
        aulas_planejamento: professor?.aulas_planejamento ?? 5,
        restricoes: professor?.restricoes ?? {},
      });
    }
  }, [isOpen, professor, escolaId, form]);

  const selectedTurnosIds = form.watch('turnos_ids');
  const selectedTurnos = useMemo(() => 
    turnosDaEscola.filter(t => selectedTurnosIds.includes(t.id)),
    [turnosDaEscola, selectedTurnosIds]
  );

  const handleCellClick = (turnoId: string, dia: string, aulaIndex: number) => {
    const currentRestricoes = form.getValues('restricoes') || {};
    const newRestricoes = JSON.parse(JSON.stringify(currentRestricoes));
    
    if (!newRestricoes[turnoId]) newRestricoes[turnoId] = {};
    if (!newRestricoes[turnoId][dia]) newRestricoes[turnoId][dia] = {};

    const currentStatus = newRestricoes[turnoId][dia][aulaIndex];

    if (currentStatus === 'indisponivel') {
        newRestricoes[turnoId][dia][aulaIndex] = 'planejamento';
    } else if (currentStatus === 'planejamento') {
        delete newRestricoes[turnoId][dia][aulaIndex];
    } else {
        newRestricoes[turnoId][dia][aulaIndex] = 'indisponivel';
    }
    
    form.setValue('restricoes', newRestricoes, { shouldDirty: true });
  };

  const onSubmit = async (data: FormValues) => {
    // Se estiver no primeiro passo, apenas avança (não salva)
    if (step === 'info') {
      setStep('restricoes');
      return;
    }

    // Se estiver no segundo passo, aí sim salva no banco
    setLoading(true);
    try {
      const result = await upsertProfessor(data);
      
      if (result?.error) {
        toast({ title: 'Erro', description: result.error, variant: 'destructive' });
        return;
      }

      toast({
        title: isEdit ? 'Professor Atualizado' : 'Professor Criado',
        description: `Os dados de "${data.nome_completo}" foram salvos com sucesso.`,
      });

      setIsOpen(false);
      onProfessorUpdated();
    } catch (error) {
      console.error("❌ Erro ao salvar:", error);
      toast({ title: 'Erro', description: 'Erro interno ao processar a requisição.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const nextStep = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    const isValid = await form.trigger(['nome_completo', 'nome_horario', 'turnos_ids', 'aulas_disponiveis']);
    if (isValid) setStep('restricoes');
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent onPointerDownOutside={(e) => e.preventDefault()} className={cn("flex flex-col h-full pointer-events-auto transition-all duration-300", step === 'info' ? "sm:max-w-2xl" : "sm:max-w-4xl")}>
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {step === 'info' ? <Users className="h-5 w-5" /> : <CalendarX className="h-5 w-5" />}
            {isEdit ? 'Editar Professor' : 'Novo Professor'} 
            <span className="text-muted-foreground font-normal ml-2">
                ({step === 'info' ? 'Passo 1/2' : 'Passo 2/2'})
            </span>
          </SheetTitle>
          <SheetDescription>
            {step === 'info' 
                ? 'Preencha os dados básicos e atribuições do docente.' 
                : 'Defina os horários de folga e planejamento (o algoritmo respeitará estas marcações).'}
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form 
            id="professor-form"
            onSubmit={form.handleSubmit(onSubmit)} 
            className="flex-1 flex flex-col overflow-hidden"
          >
            <div className="flex-1 space-y-6 py-6 overflow-y-auto pr-2">
              {step === 'info' ? (
                <div className="space-y-6">
                  <div className="space-y-4">
                    <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Dados Básicos</h4>
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
                          <FormLabel>Nome para Exibição (Horário)</FormLabel>
                          <FormControl><Input {...field} placeholder="Ex: Prof. Carlos" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />

                      <FormField control={form.control} name="email" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email (Opcional)</FormLabel>
                          <FormControl>
                            <Input type="email" {...field} value={field.value ?? ''} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Carga Horária e Turnos</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField control={form.control} name="aulas_disponiveis" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Aulas Disponíveis (Semanais)</FormLabel>
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
                      {form.formState.errors.turnos_ids && (
                        <p className="text-[0.8rem] font-medium text-destructive">
                          {form.formState.errors.turnos_ids.message}
                        </p>
                      )}
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Disciplinas Habilitadas</h4>
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
                        <p className="text-sm text-muted-foreground col-span-full">Nenhum componente curricular cadastrado.</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                    <div className="bg-primary/5 border border-primary/20 p-4 rounded-lg flex items-start gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <span className="text-primary font-bold text-xs">?</span>
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm font-bold text-primary uppercase tracking-tight">Como marcar as restrições:</p>
                            <ul className="text-xs text-muted-foreground space-y-1">
                                <li><span className="font-bold text-foreground">Clique 1:</span> Marcar como <span className="text-red-600 font-bold">Indisponível</span> (bloqueio total).</li>
                                <li><span className="font-bold text-foreground">Clique 2:</span> Marcar como <span className="text-blue-600 font-bold">Planejamento</span> (bloqueio total).</li>
                                <li><span className="font-bold text-foreground">Clique 3:</span> Limpar horário (Disponível para aula).</li>
                            </ul>
                        </div>
                    </div>

                    {selectedTurnos.length > 0 ? (
                        <Tabs defaultValue={selectedTurnos[0].id} className="w-full">
                            <TabsList className="bg-muted/50">
                                {selectedTurnos.map(turno => (
                                    <TabsTrigger key={turno.id} value={turno.id} className="text-xs uppercase font-bold">{turno.nome}</TabsTrigger>
                                ))}
                            </TabsList>
                            {selectedTurnos.map(turno => (
                                <TabsContent key={turno.id} value={turno.id} className="pt-4 animate-in fade-in slide-in-from-left-2 duration-300">
                                    <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
                                        <div className="overflow-x-auto">
                                        <table className="w-full text-sm text-center">
                                            <thead>
                                                <tr className="bg-muted/50 border-b">
                                                    <th className="p-3 font-bold border-r w-24 bg-muted/30">Aula</th>
                                                    {DIAS_SEMANA_MAP.map(dia => (
                                                        <th key={dia.id} className="p-3 font-bold min-w-[80px]">{dia.label}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {Array.from({ length: turno.aulas_por_dia }).map((_, aulaIndex) => (
                                                    <tr key={aulaIndex} className="border-b last:border-0 h-16">
                                                        <td className="p-2 font-medium bg-muted/20 border-r">
                                                            <div className="font-bold text-primary">{aulaIndex + 1}ª</div>
                                                            <div className="text-[10px] text-muted-foreground">
                                                                {turno.horarios?.[aulaIndex]?.inicio || '--:--'} - {turno.horarios?.[aulaIndex]?.fim || '--:--'}
                                                            </div>
                                                        </td>
                                                        {DIAS_SEMANA_MAP.map(dia => {
                                                            const restricoes = form.watch('restricoes') || {};
                                                            const status = restricoes[turno.id]?.[dia.id]?.[aulaIndex];
                                                            
                                                            return (
                                                                <td key={dia.id} className="p-0 border-r last:border-r-0">
                                                                    <div 
                                                                        onClick={() => handleCellClick(turno.id, dia.id, aulaIndex)}
                                                                        className={cn(
                                                                            "h-full w-full flex items-center justify-center cursor-pointer transition-all hover:opacity-80",
                                                                            status === 'indisponivel' ? 'bg-red-50 text-red-600' : 
                                                                            status === 'planejamento' ? 'bg-blue-50 text-blue-600' : 'hover:bg-accent/50'
                                                                        )}
                                                                    >
                                                                        {status === 'indisponivel' && <Ban className="h-6 w-6" />}
                                                                        {status === 'planejamento' && <PenSquare className="h-6 w-6" />}
                                                                        {!status && <div className="h-2 w-2 rounded-full bg-muted/30" />}
                                                                    </div>
                                                                </td>
                                                            )
                                                        })}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        </div>
                                    </div>
                                </TabsContent>
                            ))}
                        </Tabs>
                    ) : (
                        <div className="text-center text-muted-foreground p-12 border-2 border-dashed rounded-xl bg-muted/5">
                            <ArrowLeft className="h-8 w-8 mx-auto mb-2 opacity-20" />
                            <p>Selecione ao menos um turno no passo anterior.</p>
                        </div>
                    )}
                </div>
              )}
            </div>

            <SheetFooter className="mt-auto border-t pt-4 bg-background">
              {step === 'info' ? (
                <>
                    <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>
                        Cancelar
                    </Button>
                    <Button 
                        type="button" 
                        onClick={nextStep}
                        className="min-w-[160px] font-bold"
                    >
                        Configurar Restrições
                        <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                </>
              ) : (
                <>
                    <Button type="button" variant="outline" onClick={() => setStep('info')}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Voltar
                    </Button>
                    <Button 
                        type="submit" 
                        form="professor-form" 
                        disabled={loading}
                        className="min-w-[160px] font-bold"
                    >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Finalizar e Salvar
                    </Button>
                </>
              )}
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}