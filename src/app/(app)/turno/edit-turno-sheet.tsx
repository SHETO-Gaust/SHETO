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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

import { upsertTurno } from './actions';
import type { Turno } from '@/lib/types';

/* =======================
   CONSTANTS
======================= */

const DIAS_SEMANA_ALL = [
  { id: 'segunda', label: 'Segunda-feira' },
  { id: 'terca', label: 'Terça-feira' },
  { id: 'quarta', label: 'Quarta-feira' },
  { id: 'quinta', label: 'Quinta-feira' },
  { id: 'sexta', label: 'Sexta-feira' },
  { id: 'sabado', label: 'Sábado' },
  { id: 'domingo', label: 'Domingo' },
];

/* =======================
   SCHEMA
======================= */

const formSchema = z.object({
  id: z.string().optional(),
  escola_id: z.string().min(1, 'ID da escola é obrigatório'),
  nome: z.string().min(3, 'O nome deve ter pelo menos 3 caracteres'),
  dias_semana: z.array(z.string()).default([]), // Allow empty array
  aulas_por_dia: z.coerce.number().min(1, 'Mínimo de 1 aula'),
});

type FormValues = z.infer<typeof formSchema>;

type Props = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  turno: Turno | null;
  escolaId: string;
  onTurnoUpdated: (turno: Turno) => void;
};

const PreviewTable = ({ dias, aulas }: { dias: string[]; aulas: number }) => {
  const orderedSelectedDias = DIAS_SEMANA_ALL.filter(d => dias.includes(d.id));

  if (!dias || dias.length === 0 || !aulas || aulas < 1) {
    return (
      <div className="text-center text-muted-foreground p-4 border-dashed border rounded-lg">
        Selecione os dias e a quantidade de aulas para ver a prévia.
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[80px]">Aula</TableHead>
            {orderedSelectedDias.map(dia => (
              <TableHead key={dia.id} className="text-center">
                {dia.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: aulas }).map((_, index) => (
            <TableRow key={index}>
              <TableCell className="font-medium">{index + 1}ª Aula</TableCell>
              {orderedSelectedDias.map(dia => (
                <TableCell key={dia.id} className="text-center text-green-500">
                  ✔
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
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

  const watchedDias = form.watch('dias_semana');
  const watchedAulas = form.watch('aulas_por_dia');

  useEffect(() => {
    if (!isOpen) return;

    form.reset({
      id: turno?.id,
      escola_id: escolaId,
      nome: turno?.nome ?? '',
      dias_semana:
        turno?.dias_semana ??
        (isEdit ? [] : ['segunda', 'terca', 'quarta', 'quinta', 'sexta']),
      aulas_por_dia: turno?.aulas_por_dia ?? 5,
    });
  }, [isOpen, turno, escolaId, form, isEdit]);

  const onSubmit = async (data: FormValues) => {
    setLoading(true);
    try {
      const result = await upsertTurno(data);

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
    } catch (error) {
      toast({
        title: 'Erro inesperado',
        description: 'Ocorreu um erro ao salvar o turno.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent className="sm:max-w-2xl flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Editar Turno' : 'Novo Turno'}</SheetTitle>
          <SheetDescription>Configure os dados do turno</SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex-1 overflow-y-auto pr-4 py-4 space-y-6"
          >
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

            <FormField
              control={form.control}
              name="dias_semana"
              render={() => (
                <FormItem>
                  <FormLabel>Dias da semana</FormLabel>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-2">
                    {DIAS_SEMANA_ALL.map(dia => (
                      <FormField
                        key={dia.id}
                        control={form.control}
                        name="dias_semana"
                        render={({ field }) => {
                          return (
                            <FormItem
                              key={dia.id}
                              className="flex flex-row items-start space-x-3 space-y-0"
                            >
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(dia.id)}
                                  onCheckedChange={checked => {
                                    return checked
                                      ? field.onChange([
                                          ...(field.value || []),
                                          dia.id,
                                        ])
                                      : field.onChange(
                                          field.value?.filter(
                                            value => value !== dia.id
                                          )
                                        );
                                  }}
                                />
                              </FormControl>
                              <FormLabel className="font-normal">
                                {dia.label}
                              </FormLabel>
                            </FormItem>
                          );
                        }}
                      />
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

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

            <Separator />

            <div className="space-y-2">
              <Label>Pré-visualização da Estrutura</Label>
              <PreviewTable dias={watchedDias} aulas={watchedAulas} />
            </div>
          </form>
        </Form>

        <SheetFooter className="mt-auto border-t pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsOpen(false)}
          >
            Cancelar
          </Button>
          <Button onClick={form.handleSubmit(onSubmit)} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
