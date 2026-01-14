'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Loader2, PlusCircle, Trash } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parse } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useState } from 'react';
import { createFormacao } from '@/app/(app)/formacoes/actions';

const locationSchema = z.object({
  morning: z.boolean().default(false),
  morning_location: z.string().optional(),
  afternoon: z.boolean().default(false),
  afternoon_location: z.string().optional(),
});

const daySchema = z.object({
  date: z.date({
    required_error: "A data é obrigatória.",
  }),
  location: locationSchema,
});

const formacaoFormSchema = z.object({
  name: z.string().min(3, {
    message: 'O nome da formação deve ter pelo menos 3 caracteres.',
  }),
  modality: z.enum(['presencial', 'online'], {
    required_error: "A modalidade é obrigatória.",
  }),
  daysCount: z.coerce.number().min(1, {
    message: 'A formação deve ter pelo menos 1 dia.',
  }),
  days: z.array(daySchema).min(1, {
    message: 'Adicione pelo menos um dia para a formação.',
  }),
});

type FormacaoFormValues = z.infer<typeof formacaoFormSchema>;


export function FormacoesForm() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [dateStrings, setDateStrings] = useState<string[]>(['']);
  const [weekDays, setWeekDays] = useState<string[]>(['']);


  const form = useForm<FormacaoFormValues>({
    resolver: zodResolver(formacaoFormSchema),
    defaultValues: {
      name: '',
      daysCount: 1,
      days: [{
        date: new Date(),
        location: { morning: false, morning_location: '', afternoon: false, afternoon_location: '' }
      }],
    },
    mode: 'onChange',
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'days',
  });

  const daysCount = form.watch('daysCount');

  // Sync the number of day fields with the daysCount value
  const handleDaysCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const count = parseInt(e.target.value, 10) || 0;
    form.setValue('daysCount', count);
    const currentDays = form.getValues('days').length;
    if (count > currentDays) {
      for (let i = 0; i < count - currentDays; i++) {
        append({ date: new Date(), location: { morning: false, morning_location: '', afternoon: false, afternoon_location: '' } });
        setDateStrings(prev => [...prev, '']);
        setWeekDays(prev => [...prev, '']);
      }
    } else if (count < currentDays) {
      for (let i = 0; i < currentDays - count; i++) {
        remove(currentDays - 1 - i);
        setDateStrings(prev => prev.slice(0, -1));
        setWeekDays(prev => prev.slice(0, -1));
      }
    }
  };

  const handleDateChange = (value: string, index: number, onChange: (date: Date) => void) => {
    let formattedValue = value.replace(/\D/g, '');

    if (formattedValue.length > 2) {
      formattedValue = `${formattedValue.slice(0, 2)}/${formattedValue.slice(2)}`;
    }
    if (formattedValue.length > 5) {
      formattedValue = `${formattedValue.slice(0, 5)}/${formattedValue.slice(5, 9)}`;
    }

    const newDateStrings = [...dateStrings];
    newDateStrings[index] = formattedValue;
    setDateStrings(newDateStrings);

    if (formattedValue.length === 10) {
      const parsedDate = parse(formattedValue, 'dd/MM/yyyy', new Date());
      if (!isNaN(parsedDate.getTime())) {
        onChange(parsedDate);
        const newWeekDays = [...weekDays];
        newWeekDays[index] = format(parsedDate, 'EEEE', { locale: ptBR });
        setWeekDays(newWeekDays);
      } else {
        const newWeekDays = [...weekDays];
        newWeekDays[index] = 'Data inválida';
        setWeekDays(newWeekDays);
      }
    } else {
        const newWeekDays = [...weekDays];
        newWeekDays[index] = '';
        setWeekDays(newWeekDays);
    }
  };


  const onSubmit = async (data: FormacaoFormValues) => {
    setLoading(true);
    const result = await createFormacao(data);

    if (result.error) {
       toast({
        title: 'Erro ao cadastrar formação',
        description: result.error,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Formação Cadastrada!',
        description: 'A nova formação foi cadastrada com sucesso.',
      });
      form.reset();
      setDateStrings(Array(form.getValues('days').length).fill(''));
      setWeekDays(Array(form.getValues('days').length).fill(''));
    }
    setLoading(false);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome da Formação</FormLabel>
              <FormControl>
                <Input placeholder="Ex: PROFE LÍDERES" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            <FormField
            control={form.control}
            name="modality"
            render={({ field }) => (
                <FormItem>
                <FormLabel>Modalidade</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                    <SelectTrigger>
                        <SelectValue placeholder="Selecione a modalidade" />
                    </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                    <SelectItem value="presencial">Presencial</SelectItem>
                    <SelectItem value="online">Online</SelectItem>
                    </SelectContent>
                </Select>
                <FormMessage />
                </FormItem>
            )}
            />
            <FormField
                control={form.control}
                name="daysCount"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Quantidade de Dias</FormLabel>
                    <FormControl>
                        <Input type="number" {...field} onChange={handleDaysCountChange} min="1" />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
            />
        </div>

        <div className="space-y-4">
            <h3 className="text-lg font-medium">Dias da Formação</h3>
            {fields.map((field, index) => (
                <div key={field.id} className="rounded-md border p-4 space-y-4 relative">
                    <h4 className="font-semibold">Dia {index + 1}</h4>
                     <FormField
                        control={form.control}
                        name={`days.${index}.date`}
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Data</FormLabel>
                                <div className="flex items-center gap-4">
                                <FormControl>
                                    <Input
                                    placeholder="DD/MM/AAAA"
                                    value={dateStrings[index]}
                                    onChange={(e) => handleDateChange(e.target.value, index, field.onChange)}
                                    className="w-[150px]"
                                    />
                                </FormControl>
                                {weekDays[index] && <span className="text-sm text-muted-foreground">{weekDays[index]}</span>}
                                </div>
                                <FormMessage />
                            </FormItem>
                        )}
                        />

                    <div className="space-y-2">
                        <FormField
                            control={form.control}
                            name={`days.${index}.location.morning`}
                            render={({ field }) => (
                            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                                <FormControl>
                                <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                />
                                </FormControl>
                                <div className="space-y-1 leading-none w-full">
                                    <FormLabel>Período Matutino</FormLabel>
                                    {form.watch(`days.${index}.location.morning`) && (
                                        <FormField
                                            control={form.control}
                                            name={`days.${index}.location.morning_location`}
                                            render={({ field }) => (
                                                <FormItem className="pt-2">
                                                    <FormControl>
                                                        <Input placeholder="Local do período matutino" {...field} className="w-full md:w-96" />
                                                    </FormControl>
                                                </FormItem>
                                            )}
                                        />
                                    )}
                                </div>
                            </FormItem>
                            )}
                        />
                         <FormField
                            control={form.control}
                            name={`days.${index}.location.afternoon`}
                            render={({ field }) => (
                            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                                <FormControl>
                                <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                />
                                </FormControl>
                                <div className="space-y-1 leading-none w-full">
                                    <FormLabel>Período Vespertino</FormLabel>
                                    {form.watch(`days.${index}.location.afternoon`) && (
                                        <FormField
                                            control={form.control}
                                            name={`days.${index}.location.afternoon_location`}
                                            render={({ field }) => (
                                                <FormItem className="pt-2">
                                                    <FormControl>
                                                        <Input placeholder="Local do período vespertino" {...field} className="w-full md:w-96" />
                                                    </FormControl>
                                                </FormItem>
                                            )}
                                        />
                                    )}
                                </div>
                            </FormItem>
                            )}
                        />
                    </div>
                </div>
            ))}
        </div>

        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Cadastrar Formação
        </Button>
      </form>
    </Form>
  );
}
