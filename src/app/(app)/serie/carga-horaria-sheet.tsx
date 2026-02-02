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
import type { SerieComDados, NivelEnsino, Turno, ComponenteCurricular, ProfessorComDados } from '@/lib/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const formSchema = z.object({
    serie_id: z.string(),
    componentes: z.array(z.object({
        componente_id: z.string(),
        aulas_semanais: z.coerce.number().min(0),
        professor_id: z.string().nullable().optional(),
    }))
});

type FormValues = z.infer<typeof formSchema>;

type Props = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  serie: SerieComDados;
  dependencies: { 
      componentes: ComponenteCurricular[],
      professores: ProfessorComDados[],
  };
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
  const totalAulasDistribuidas = watchedComponentes.reduce((sum, comp) => sum + Number(comp.aulas_semanais || 0), 0);
  const saldoAulas = serie.total_aulas_semanais - totalAulasDistribuidas;

  useEffect(() => {
    if (isOpen) {
      const cargaExistente = new Map(serie.componentes.map(c => [c.componente_id, { aulas_semanais: c.aulas_semanais, professor_id: c.professor_id }]));
      const formComponentes = dependencies.componentes.map(comp => ({
        componente_id: comp.id,
        aulas_semanais: cargaExistente.get(comp.id)?.aulas_semanais || 0,
        professor_id: cargaExistente.get(comp.id)?.professor_id || undefined,
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

    toast({ title: 'Sucesso', description: 'Carga horária e ensalamento salvos.' });
    onCargaUpdated();
    setIsOpen(false);
  };
  
  const getComponenteInfo = (id: string) => dependencies.componentes.find(c => c.id === id);

  const getProfessoresQualificados = (componenteId: string) => {
    return dependencies.professores.filter(prof => 
        prof.componentes.some(c => c.id === componenteId) && prof.turnos.some(t => t.id === serie.turno_id)
    );
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent className="sm:max-w-3xl flex flex-col">
        <SheetHeader>
          <SheetTitle>Carga Horária e Ensalamento: {serie.nome}</SheetTitle>
          <SheetDescription>Defina a quantidade de aulas e o professor para cada disciplina.</SheetDescription>
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
              const professoresQualificados = getProfessoresQualificados(componente.id);

              return (
                <div key={field.id} className="p-4 border rounded-lg space-y-3 bg-card">
                  <p className="font-semibold">{componente.nome} ({componente.sigla})</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name={`componentes.${index}.aulas_semanais`}
                      render={({ field: aulasField }) => (
                          <FormItem>
                              <FormLabel>Aulas Semanais</FormLabel>
                              <FormControl>
                                  <Input type="number" min="0" {...aulasField} />
                              </FormControl>
                          </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`componentes.${index}.professor_id`}
                      render={({ field: profField }) => (
                        <FormItem>
                          <FormLabel>Professor</FormLabel>
                          <Select onValueChange={profField.onChange} value={profField.value || ''} disabled={professoresQualificados.length === 0}>
                              <FormControl><SelectTrigger><SelectValue placeholder={professoresQualificados.length === 0 ? 'Nenhum prof. qualificado' : 'Selecione...'} /></SelectTrigger></FormControl>
                              <SelectContent>
                                  <SelectItem value="">Nenhum/A definir</SelectItem>
                                  {professoresQualificados.map(p => (
                                      <SelectItem key={p.id} value={p.id}>{p.nome_horario}</SelectItem>
                                  ))}
                              </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
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
