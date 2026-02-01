'use client';

import { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
import { useToast } from '@/hooks/use-toast';
import { updateTurnoHorarios } from './actions';
import { Loader2, PlusCircle, Trash2 } from 'lucide-react';
import type { Turno, HorarioAula } from '@/lib/types';
import { Separator } from '@/components/ui/separator';

type HorariosTurnoSheetProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  turno: Turno;
  onHorariosUpdated: (turno: Turno) => void;
};

const horarioAulaSchema = z.object({
  id: z.string(),
  inicio: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Formato inválido."),
  fim: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Formato inválido."),
});

const horariosFormSchema = z.object({
  id: z.string(),
  horarios: z.array(horarioAulaSchema),
}).refine(data => {
    for (const aula of data.horarios) {
        if (aula.inicio >= aula.fim) return false;
    }
    return true;
}, {
    message: 'O horário de início de uma aula não pode ser depois do horário de fim.',
    path: ['horarios'],
});


type HorariosFormValues = z.infer<typeof horariosFormSchema>;

export function HorariosTurnoSheet({ isOpen, setIsOpen, turno, onHorariosUpdated }: HorariosTurnoSheetProps) {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);

    const form = useForm<HorariosFormValues>({
        resolver: zodResolver(horariosFormSchema),
        defaultValues: {
            id: turno.id,
            horarios: [],
        }
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "horarios",
    });

    useEffect(() => {
        if (isOpen) {
            form.reset({
                id: turno.id,
                horarios: turno.horarios || [],
            });
        }
    }, [isOpen, turno, form]);

    const addAula = () => {
        append({ id: `new_${Date.now()}`, inicio: '', fim: '' });
    };

    const onSubmit = async (data: HorariosFormValues) => {
        setLoading(true);
        const result = await updateTurnoHorarios(data);
        setLoading(false);

        if (result.error) {
            toast({
                title: 'Erro ao salvar horários',
                description: result.error,
                variant: 'destructive',
            });
            if (result.errors?.horarios) {
                form.setError('horarios', { type: 'manual', message: result.errors.horarios.join(', ') });
            }
        } else {
            toast({
                title: 'Horários atualizados!',
                description: `A configuração de horários para "${turno.nome}" foi salva.`,
            });
            onHorariosUpdated({ ...turno, horarios: data.horarios });
            setIsOpen(false);
        }
    };
    
    const { formState: { errors } } = form;

    return (
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetContent className="w-full sm:max-w-lg flex flex-col">
                <SheetHeader>
                    <SheetTitle>Configurar Horários</SheetTitle>
                    <SheetDescription>
                        Defina os horários das aulas para o turno <span className="font-semibold text-foreground">{turno.nome}</span>.
                    </SheetDescription>
                </SheetHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="flex-1 flex flex-col">
                         <div className="flex-1 overflow-y-auto p-1 space-y-4">
                            {fields.map((field, index) => (
                                <div key={field.id} className="flex items-end gap-2 p-3 border rounded-lg">
                                    <div className="grid grid-cols-2 gap-2 flex-1">
                                        <FormField
                                            control={form.control}
                                            name={`horarios.${index}.inicio`}
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Início</FormLabel>
                                                    <FormControl><Input type="time" {...field} /></FormControl>
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name={`horarios.${index}.fim`}
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Fim</FormLabel>
                                                    <FormControl><Input type="time" {...field} /></FormControl>
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                    <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}>
                                        <Trash2 className="h-5 w-5 text-destructive" />
                                    </Button>
                                </div>
                            ))}

                             {errors.horarios?.root && (
                                <p className="text-sm font-medium text-destructive px-1">{errors.horarios.root.message}</p>
                            )}
                            
                            <Button type="button" variant="outline" className="w-full" onClick={addAula}>
                                <PlusCircle className="mr-2 h-4 w-4" />
                                Adicionar Aula
                            </Button>
                         </div>
                    </form>
                </Form>
                
                <SheetFooter className="mt-auto border-t pt-4">
                    <Button variant="outline" onClick={() => setIsOpen(false)}>Cancelar</Button>
                    <Button onClick={form.handleSubmit(onSubmit)} disabled={loading}>
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Salvar Horários
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
