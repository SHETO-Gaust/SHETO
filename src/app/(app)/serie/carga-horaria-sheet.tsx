'use client';

import { useEffect, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
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
import { Loader2 } from 'lucide-react';
import { updateCargaHoraria } from './actions';
import type { SerieComDados, ComponenteCurricular, Turno } from '@/lib/types';
import { Separator } from '@/components/ui/separator';

const formSchema = z.object({
    serie_id: z.string(),
    aulas_nao_presenciais_semanais: z.coerce.number().min(0, "O valor deve ser positivo."),
    componentes: z.array(z.object({
        componente_id: z.string(),
        aulas_presenciais: z.coerce.number().min(0),
        aulas_nao_presenciais: z.coerce.number().min(0),
    }))
});

type FormValues = z.infer<typeof formSchema>;

type Props = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  serie: SerieComDados;
  dependencies: { 
      componentes: ComponenteCurricular[],
      turnos: Turno[],
  };
  onCargaUpdated: () => void;
};

export function CargaHorariaSheet({ isOpen, setIsOpen, serie, dependencies, onCargaUpdated }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [hasContraturno, setHasContraturno] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { 
        serie_id: serie.id,
        aulas_nao_presenciais_semanais: serie.aulas_nao_presenciais_semanais || 0,
        componentes: [] 
    },
  });

  const { fields } = useFieldArray({ control: form.control, name: "componentes" });
  
  const watchedComponentes = form.watch('componentes');
  const watchedTotalNP = form.watch('aulas_nao_presenciais_semanais');

  const totalPresenciaisDistribuidas = watchedComponentes.reduce((sum, comp) => sum + Number(comp.aulas_presenciais || 0), 0);
  const saldoAulasPresenciais = serie.total_aulas_presenciais_semanais - totalPresenciaisDistribuidas;

  const totalNPDistribuidas = watchedComponentes.reduce((sum, comp) => sum + Number(comp.aulas_nao_presenciais || 0), 0);
  const saldoAulasNP = watchedTotalNP - totalNPDistribuidas;

  useEffect(() => {
    if (isOpen) {
      // Logic to check for contraturno
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

      // Form reset logic
      const cargaExistente = new Map(serie.componentes.map(c => [c.componente_id, { p: c.aulas_presenciais, np: c.aulas_nao_presenciais }]));
      const formComponentes = dependencies.componentes.map(comp => ({
        componente_id: comp.id,
        aulas_presenciais: cargaExistente.get(comp.id)?.p || 0,
        aulas_nao_presenciais: cargaExistente.get(comp.id)?.np || 0,
      }));
      form.reset({ 
          serie_id: serie.id, 
          aulas_nao_presenciais_semanais: serie.aulas_nao_presenciais_semanais || 0,
          componentes: formComponentes
      });
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

  return (
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent className="sm:max-w-2xl flex flex-col">
          <SheetHeader>
            <SheetTitle>Carga Horária da Série: {serie.nome}</SheetTitle>
            <SheetDescription>Defina a quantidade de aulas para cada disciplina deste modelo de série.</SheetDescription>
          </SheetHeader>
          
          <Form {...form}>
            <form id="carga-form" onSubmit={form.handleSubmit(onSubmit)} className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto pr-2 -mr-4 space-y-4 py-4">
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 border rounded-lg bg-muted">
                      <p className="text-sm font-medium mb-2 text-center">Aulas Presenciais</p>
                      <div className="grid grid-cols-3 gap-2 text-center">
                          <div><p className="font-bold text-lg">{serie.total_aulas_presenciais_semanais}</p><p className="text-xs text-muted-foreground">Total</p></div>
                          <div><p className="font-bold text-lg">{totalPresenciaisDistribuidas}</p><p className="text-xs text-muted-foreground">Distribuídas</p></div>
                          <div><p className="font-bold text-lg">{saldoAulasPresenciais}</p><p className="text-xs text-muted-foreground">Saldo</p></div>
                      </div>
                  </div>
                  <div className="p-4 border rounded-lg bg-muted">
                       <p className="text-sm font-medium mb-2 text-center">Aulas Não Presenciais</p>
                       <div className="grid grid-cols-3 gap-2 text-center">
                          <FormField
                            control={form.control}
                            name="aulas_nao_presenciais_semanais"
                            render={({ field }) => (
                                <FormItem className="space-y-0 text-center">
                                    <FormControl>
                                        <Input type="number" min="0" {...field} className="h-8 text-lg font-bold text-center p-0 bg-transparent border-0 focus-visible:ring-0" disabled={!hasContraturno}/>
                                    </FormControl>
                                    <FormLabel className="text-xs font-normal text-muted-foreground">Total</FormLabel>
                                </FormItem>
                            )}
                          />
                          <div><p className="font-bold text-lg">{totalNPDistribuidas}</p><p className="text-xs text-muted-foreground">Distribuídas</p></div>
                          <div><p className="font-bold text-lg">{saldoAulasNP}</p><p className="text-xs text-muted-foreground">Saldo</p></div>
                       </div>
                  </div>
                </div>

                {!hasContraturno && (
                  <p className="text-xs text-center text-orange-600 bg-orange-50 p-2 rounded-md">Para habilitar aulas não presenciais (contraturno), o turno oposto (matutino/vespertino) precisa estar ativo na tela de Turnos.</p>
                )}

                <Separator />

                <div className="space-y-2">
                  {fields.map((field, index) => {
                    const componente = getComponenteInfo(field.componente_id);
                    if (!componente) return null;

                    return (
                      <div key={field.id} className="p-3 border rounded-lg space-y-3 bg-card flex justify-between items-center">
                        <p className="font-semibold">{componente.nome} ({componente.sigla})</p>
                        <div className="flex items-center gap-4">
                          <FormField
                            control={form.control}
                            name={`componentes.${index}.aulas_presenciais`}
                            render={({ field: aulasField }) => (
                                <FormItem className="flex items-center gap-2 space-y-0">
                                    <FormLabel className="text-xs">Pres.</FormLabel>
                                    <FormControl>
                                        <Input type="number" min="0" {...aulasField} className="w-20" />
                                    </FormControl>
                                </FormItem>
                            )}
                          />
                           <FormField
                            control={form.control}
                            name={`componentes.${index}.aulas_nao_presenciais`}
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
                    )
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
