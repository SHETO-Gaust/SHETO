'use client';

import { useEffect, useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Ban, PenSquare, FileSignature } from 'lucide-react';
import { upsertSerie } from './actions';
import type { SerieComDados, NivelEnsino, Turno } from '@/lib/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from '@/lib/utils';

const formSchema = z.object({
  id: z.string().optional(),
  escola_id: z.string(),
  nome: z.string().min(1, 'O nome é obrigatório.'),
  nivel_ensino_id: z.string({ required_error: 'Selecione um nível de ensino.' }),
  turno_id: z.string({ required_error: 'Selecione um turno.' }),
  restricoes: z.any().optional(),
});
type FormValues = z.infer<typeof formSchema>;

type Props = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  serie: SerieComDados | null;
  escolaId: string;
  dependencies: { niveisEnsino: NivelEnsino[], turnos: Turno[] };
  onSerieUpdated: () => void;
};

const DIAS_SEMANA_MAP = [
  { id: 'segunda', label: 'Seg' }, { id: 'terca', label: 'Ter' },
  { id: 'quarta', label: 'Qua' }, { id: 'quinta', label: 'Qui' },
  { id: 'sexta', label: 'Sex' }, { id: 'sabado', label: 'Sáb' },
];

export function EditSerieSheet({ isOpen, setIsOpen, serie, escolaId, dependencies, onSerieUpdated }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const isEdit = !!serie;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { escola_id: escolaId },
  });

  const selectedTurnoId = form.watch('turno_id');
  const turnoInfo = useMemo(() => dependencies.turnos.find(t => t.id === selectedTurnoId), [selectedTurnoId, dependencies.turnos]);
  
  useEffect(() => {
    if (isOpen) {
      form.reset({
        id: serie?.id,
        escola_id: escolaId,
        nome: serie?.nome ?? '',
        nivel_ensino_id: serie?.nivel_ensino_id ?? undefined,
        turno_id: serie?.turno_id ?? undefined,
        restricoes: serie?.restricoes ?? {},
      });
    }
  }, [isOpen, serie, escolaId, form]);

  const handleCellClick = (dia: string, aulaIndex: number) => {
    const currentRestricoes = form.getValues('restricoes') || {};
    const newRestricoes = JSON.parse(JSON.stringify(currentRestricoes));
    
    if (!newRestricoes[dia]) newRestricoes[dia] = {};
    const currentStatus = newRestricoes[dia][aulaIndex];

    if (currentStatus === 'proibido') {
        delete newRestricoes[dia][aulaIndex];
    } else {
        newRestricoes[dia][aulaIndex] = 'proibido';
    }
    form.setValue('restricoes', newRestricoes);
  };

  const onSubmit = async (data: FormValues) => {
    setLoading(true);
    const result = await upsertSerie(data);
    setLoading(false);
    if (result.error) {
      toast({ title: 'Erro', description: result.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Sucesso', description: `Série "${data.nome}" salva.` });
    onSerieUpdated();
    setIsOpen(false);
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent className="sm:max-w-2xl flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Editar Série' : 'Nova Série'}</SheetTitle>
          <SheetDescription>{isEdit ? 'Edite as informações da série e suas restrições.' : 'Preencha os dados da nova série.'}</SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form id="serie-form" onSubmit={form.handleSubmit(onSubmit)} className="flex-1 overflow-y-auto pr-2 py-4 space-y-6">
            <Tabs defaultValue="dados" className="w-full">
                <TabsList>
                    <TabsTrigger value="dados">Dados da Série</TabsTrigger>
                    <TabsTrigger value="restricoes" disabled={!isEdit || !turnoInfo}>Restrições de Horário</TabsTrigger>
                </TabsList>
                
                <TabsContent value="dados" className="pt-4 space-y-4">
                    <FormField control={form.control} name="nome" render={({ field }) => (
                        <FormItem><FormLabel>Nome da Série</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )}/>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField control={form.control} name="nivel_ensino_id" render={({ field }) => (
                            <FormItem><FormLabel>Nível de Ensino</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}><FormControl>
                                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger></FormControl>
                                    <SelectContent>{dependencies.niveisEnsino.map(n => <SelectItem key={n.id} value={n.id}>{n.nome}</SelectItem>)}</SelectContent>
                                </Select><FormMessage />
                            </FormItem>
                        )}/>
                        <FormField control={form.control} name="turno_id" render={({ field }) => (
                            <FormItem><FormLabel>Turno</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}><FormControl>
                                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger></FormControl>
                                    <SelectContent>{dependencies.turnos.map(t => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}</SelectContent>
                                </Select><FormMessage />
                            </FormItem>
                        )}/>
                    </div>
                </TabsContent>

                <TabsContent value="restricoes" className="pt-4">
                    {turnoInfo ? (
                        <div className="rounded-xl border bg-card overflow-hidden">
                            <table className="w-full text-sm text-center">
                                <thead>
                                    <tr className="bg-muted/50 border-b">
                                        <th className="p-2 font-medium border-r w-16">Aula</th>
                                        {DIAS_SEMANA_MAP.filter(d => turnoInfo.dias_semana.includes(d.id)).map(dia => (
                                            <th key={dia.id} className="p-2 font-medium min-w-[60px]">{dia.label}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {Array.from({ length: turnoInfo.aulas_por_dia }).map((_, aulaIndex) => (
                                        <tr key={aulaIndex} className="border-b last:border-0">
                                            <td className="p-2 font-medium bg-muted/20 border-r">{aulaIndex + 1}ª</td>
                                            {DIAS_SEMANA_MAP.filter(d => turnoInfo.dias_semana.includes(d.id)).map(dia => {
                                                const restricoes = form.watch('restricoes') || {};
                                                const status = restricoes[dia.id]?.[aulaIndex];
                                                return (
                                                    <td key={dia.id} className="p-0">
                                                        <div onClick={() => handleCellClick(dia.id, aulaIndex)}
                                                            className={cn("h-12 w-full flex items-center justify-center cursor-pointer transition-colors",
                                                                status === 'proibido' ? 'bg-red-100 dark:bg-red-900/30' : 'hover:bg-accent'
                                                            )}>
                                                            {status === 'proibido' && <Ban className="h-5 w-5 text-red-600" />}
                                                        </div>
                                                    </td>
                                                )
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p className="text-muted-foreground text-center">Selecione e salve um turno para definir as restrições.</p>
                    )}
                </TabsContent>
            </Tabs>
          </form>
        </Form>
        <SheetFooter className="mt-auto border-t pt-4">
          <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>Cancelar</Button>
          <Button type="submit" form="serie-form" disabled={loading} className="min-w-[100px]">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
