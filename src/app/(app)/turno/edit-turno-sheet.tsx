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
import { Loader2 } from 'lucide-react';

import { upsertTurno } from './actions';
import type { Turno } from '@/lib/types';

/* =======================
   CONSTANTS
======================= */

const DIAS_SEMANA = [
  { id: 'domingo', label: 'Domingo' },
  { id: 'segunda', label: 'Segunda-feira' },
  { id: 'terca', label: 'Terça-feira' },
  { id: 'quarta', label: 'Quarta-feira' },
  { id: 'quinta', label: 'Quinta-feira' },
  { id: 'sexta', label: 'Sexta-feira' },
  { id: 'sabado', label: 'Sábado' },
];

/* =======================
   SCHEMA
======================= */

const formSchema = z.object({
  id: z.string().optional(),
  escola_id: z.string(),
  nome: z.string().min(3),
  dias_semana: z.array(z.string()),
  aulas_por_dia: z.coerce.number().min(1),
});

type FormValues = z.infer<typeof formSchema>;

type Props = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  turno: Turno | null;
  escolaId: string;
  onTurnoUpdated: (turno: Turno) => void;
};

export function EditTurnoSheet({
  isOpen,
  setIsOpen,
  turno,
  escolaId,
  onTurnoUpdated,
}: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const isEdit = !!turno;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      escola_id: escolaId,
      nome: '',
      dias_semana: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
      aulas_por_dia: 5,
    },
  });

  useEffect(() => {
    if (!isOpen) return;

    form.reset({
      id: turno?.id,
      escola_id: escolaId,
      nome: turno?.nome ?? '',
      dias_semana: turno?.dias_semana ?? [],
      aulas_por_dia: turno?.aulas_por_dia ?? 5,
    });
  }, [isOpen, turno, escolaId, form]);

  const onSubmit = async (data: FormValues) => {
    setLoading(true);

    const result = await upsertTurno(data);

    setLoading(false);

    if (result?.error) {
      toast({
        title: 'Erro',
        description: result.error,
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: isEdit ? 'Turno atualizado' : 'Turno criado',
      description: `Turno "${data.nome}" salvo com sucesso.`,
    });

    onTurnoUpdated(result.data);
    setIsOpen(false);
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent className="sm:max-w-2xl flex flex-col">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col h-full">
            <SheetHeader>
              <SheetTitle>{isEdit ? 'Editar Turno' : 'Novo Turno'}</SheetTitle>
              <SheetDescription>
                Configure os dados do turno
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 space-y-6 overflow-y-auto py-6">
              <FormField
                control={form.control}
                name="nome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Ex: Matutino" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Separator />

              <FormField
                control={form.control}
                name="dias_semana"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dias da semana</FormLabel>
                    <div className="grid grid-cols-2 gap-3 pt-2">
                      {DIAS_SEMANA.map((dia) => (
                        <div key={dia.id} className="flex items-center gap-2">
                          <Checkbox
                            checked={field.value.includes(dia.id)}
                            onCheckedChange={(checked) => {
                              checked
                                ? field.onChange([...field.value, dia.id])
                                : field.onChange(field.value.filter(d => d !== dia.id));
                            }}
                          />
                          <span>{dia.label}</span>
                        </div>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Separator />

              <FormField
                control={form.control}
                name="aulas_por_dia"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Aulas por dia</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <SheetFooter className="border-t pt-4">
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
