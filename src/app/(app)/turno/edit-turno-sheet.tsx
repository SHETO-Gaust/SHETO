'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';

import { upsertTurno } from './actions';
import type { Turno } from '@/lib/types';

/* =======================
   CONSTANTS
======================= */

const DIAS_SEMANA = [
  { id: 'domingo', label: 'Dom', full: 'Domingo' },
  { id: 'segunda', label: 'Seg', full: 'Segunda-feira' },
  { id: 'terca', label: 'Ter', full: 'Terça-feira' },
  { id: 'quarta', label: 'Qua', full: 'Quarta-feira' },
  { id: 'quinta', label: 'Qui', full: 'Quinta-feira' },
  { id: 'sexta', label: 'Sex', full: 'Sexta-feira' },
  { id: 'sabado', label: 'Sáb', full: 'Sábado' },
];

/* =======================
   SCHEMA
======================= */

const formSchema = z.object({
  id: z.string().optional(),
  // CORREÇÃO: Coerce para evitar erro de string/number
  escola_id: z.coerce.string().min(1),
  nome: z.string().min(3, "Mínimo 3 caracteres"),
  dias_semana: z.array(z.string()).min(1, "Selecione ao menos um dia"),
  aulas_por_dia: z.coerce.number().min(1, "Mínimo 1 aula").max(15, "Máximo 15 aulas"),
});

type FormValues = z.infer<typeof formSchema>;

type Props = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  turno: Turno | null;
  escolaId: string;
  onTurnoUpdated: (turno: Turno) => void;
};

export function EditTurnoSheet({ isOpen, setIsOpen, turno, escolaId, onTurnoUpdated }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const isEdit = !!turno;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      escola_id: String(escolaId),
      nome: '',
      dias_semana: [],
      aulas_por_dia: 5,
    },
  });

  // Observa os campos para a tabela de preview
  const watchDias = form.watch('dias_semana');
  const watchAulas = form.watch('aulas_por_dia');

  useEffect(() => {
    if (isOpen) {
      form.reset({
        id: turno?.id,
        escola_id: String(escolaId),
        nome: turno?.nome ?? '',
        dias_semana: turno?.dias_semana ?? [],
        aulas_por_dia: turno?.aulas_por_dia ?? 5,
      });
    }
  }, [isOpen, turno, escolaId, form]);

  const onSubmit = async (data: FormValues) => {
    setLoading(true);
    const result = await upsertTurno(data);
    setLoading(false);

    if (result?.error) {
      toast({ title: 'Erro', description: result.error, variant: 'destructive' });
      return;
    }

    toast({ 
        title: isEdit ? 'Turno atualizado' : 'Turno criado', 
        description: `Turno "${data.nome}" salvo com sucesso.` 
    });
    
    onTurnoUpdated(result.data);
    setIsOpen(false);
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent className="sm:max-w-2xl flex flex-col h-full overflow-hidden">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            {isEdit ? 'Editar Turno' : 'Novo Turno'}
          </SheetTitle>
          <SheetDescription>Configure a grade horária e dias de funcionamento.</SheetDescription>
        </SheetHeader>

        <Form {...form}>
          {/* O ID aqui é vital para o botão lá embaixo funcionar */}
          <form id="turno-form" onSubmit={form.handleSubmit(onSubmit)} className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto py-6 pr-2 space-y-8">
              
              {/* Nome do Turno */}
              <FormField
                control={form.control}
                name="nome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome do Turno</FormLabel>
                    <FormControl><Input {...field} placeholder="Ex: Manhã Regular" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Dias da Semana */}
                <FormField
                  control={form.control}
                  name="dias_semana"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Dias Ativos</FormLabel>
                      <div className="flex flex-wrap gap-2 pt-2">
                        {DIAS_SEMANA.map((dia) => {
                          const isSelected = field.value.includes(dia.id);
                          return (
                            <div 
                              key={dia.id}
                              onClick={() => {
                                const newValue = isSelected 
                                  ? field.value.filter(v => v !== dia.id)
                                  : [...field.value, dia.id];
                                field.onChange(newValue);
                              }}
                              className={cn(
                                "cursor-pointer px-3 py-2 rounded-md border text-xs font-semibold transition-all select-none",
                                isSelected 
                                  ? "bg-primary text-primary-foreground border-primary" 
                                  : "bg-background hover:bg-accent text-muted-foreground"
                              )}
                            >
                              {dia.label}
                            </div>
                          )
                        })}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Quantidade de Aulas */}
                <FormField
                  control={form.control}
                  name="aulas_por_dia"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Aulas por Dia</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Separator />

              {/* TABELA DE PREVIEW MODERNA */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Visualização da Grade</h4>
                <div className="rounded-xl border bg-card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/50 border-b">
                          <th className="p-3 text-left font-medium border-r w-20">Aula</th>
                          {DIAS_SEMANA.map(dia => (
                            <th key={dia.id} className={cn(
                              "p-3 text-center font-medium min-w-[60px]",
                              watchDias.includes(dia.id) ? "text-foreground" : "text-muted-foreground/40"
                            )}>
                              {dia.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: Math.min(watchAulas, 15) }).map((_, idx) => (
                          <tr key={idx} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                            <td className="p-3 font-medium bg-muted/20 border-r">{idx + 1}ª</td>
                            {DIAS_SEMANA.map(dia => (
                              <td key={dia.id} className="p-3 text-center">
                                {watchDias.includes(dia.id) ? (
                                  <div className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                                    </svg>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground/20">-</span>
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {watchAulas === 0 && (
                    <div className="p-8 text-center text-muted-foreground italic">
                      Defina a quantidade de aulas para visualizar a grade.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <SheetFooter className="pt-4 border-t mt-auto">
              <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>
                Cancelar
              </Button>
              {/* O atributo form="turno-form" garante que o submit dispare mesmo fora do fluxo da DOM principal */}
              <Button type="submit" form="turno-form" disabled={loading} className="min-w-[120px]">
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Salvar Turno'}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}