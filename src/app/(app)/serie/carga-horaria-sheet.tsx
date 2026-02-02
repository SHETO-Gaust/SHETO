'use client';

import { useEffect, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { updateCargaHoraria } from './actions';
import type { SerieComDados, NivelEnsino, Turno, ComponenteCurricular } from '@/lib/types';
import { Separator } from '@/components/ui/separator';

const formSchema = z.object({
    serie_id: z.string(),
    componentes: z.array(z.object({
        componente_id: z.string(),
        aulas_semanais: z.coerce.number().min(0),
    }))
});

type FormValues = z.infer<typeof formSchema>;

type Props = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  serie: SerieComDados;
  dependencies: { componentes: ComponenteCurricular[] };
  onCargaUpdated: () => void;
};

export function CargaHorariaSheet({ isOpen, setIsOpen, serie, dependencies, onCargaUpdated }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { serie_id: serie.id, componentes: [] },
  });

  const { fields } = useFieldArray({ control: form.control, name: "componentes" });
  const watchedComponentes = form.watch('componentes');
  const totalAulasDistribuidas = watchedComponentes.reduce((sum, comp) => sum + (comp.aulas_semanais || 0), 0);
  const saldoAulas = serie.total_aulas_semanais - totalAulasDistribuidas;

  useEffect(() => {
    if (isOpen) {
      const cargaExistente = new Map(serie.componentes.map(c => [c.componente_id, c.aulas_semanais]));
      const formComponentes = dependencies.componentes.map(comp => ({
        componente_id: comp.id,
        aulas_semanais: cargaExistente.get(comp.id) || 0,
      }));
      form.reset({ serie_id: serie.id, componentes: formComponentes });
    }
  }, [isOpen, serie, dependencies.componentes, form]);

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
      <SheetContent className="sm:max-w-xl flex flex-col">
        <SheetHeader>
          <SheetTitle>Carga Horária: {serie.nome}</SheetTitle>
          <SheetDescription>Defina a quantidade de aulas semanais para cada componente curricular.</SheetDescription>
        </SheetHeader>

        <div className="grid grid-cols-3 gap-2 text-center p-2 rounded-lg bg-muted my-4">
            <div><p className="font-bold text-lg">{serie.total_aulas_semanais}</p><p className="text-xs text-muted-foreground">Total de Aulas</p></div>
            <div><p className="font-bold text-lg">{totalAulasDistribuidas}</p><p className="text-xs text-muted-foreground">Aulas Distribuídas</p></div>
            <div><p className="font-bold text-lg">{saldoAulas}</p><p className="text-xs text-muted-foreground">Saldo</p></div>
        </div>

        <Form {...form}>
          <form id="carga-form" onSubmit={form.handleSubmit(onSubmit)} className="flex-1 overflow-y-auto pr-2 -mr-4 space-y-4">
            {fields.map((field, index) => {
              const componente = getComponenteInfo(field.componente_id);
              if (!componente) return null;

              return (
                <FormField key={field.id} control={form.control} name={`componentes.${index}.aulas_semanais`}
                  render={({ field: inputField }) => (
                    <FormItem className="flex items-center justify-between p-3 border rounded-md">
                      <FormLabel className="text-base">{componente.nome} ({componente.sigla})</FormLabel>
                      <FormControl>
                        <Input type="number" min="0" {...inputField} className="w-20 text-center" />
                      </FormControl>
                    </FormItem>
                  )}
                />
              )
            })}
          </form>
        </Form>

        <SheetFooter className="mt-auto border-t pt-4">
          <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>Cancelar</Button>
          <Button type="submit" form="carga-form" disabled={loading} className="min-w-[100px]">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
