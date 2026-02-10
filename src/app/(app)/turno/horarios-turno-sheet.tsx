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
    // Valida se todos os campos estão preenchidos
    for (const aula of data.horarios) {
        if (!aula.inicio || !aula.fim) return false;
    }
    // Valida se o início é antes do fim
    for (const aula of data.horarios) {
        if (aula.inicio >= aula.fim) return false;
    }
    return true;
}, {
    message: 'Todos os horários devem ser preenchidos e o início deve ser anterior ao fim.',
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

    const { fields, replace } = useFieldArray({
        control: form.control,
        name: "horarios",
    });

    useEffect(() => {
        if (isOpen) {
            const aulasPorDia = turno.aulas_por_dia || 5;
            const existingHorarios = turno.horarios || [];
            const newHorarios = Array.from({ length: aulasPorDia }, (_, i) => {
                return existingHorarios[i] || { id: `aula_${i + 1}`, inicio: '', fim: '' };
            });

            form.reset({
                id: turno.id,
                horarios: newHorarios,
            });
        }
    }, [isOpen, turno, form]);


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
                    <form 
                        id="horarios-form"
                        onSubmit={form.handleSubmit(onSubmit)} 
                        className="flex-1 overflow-y-auto p-1 space-y-4"
                    >
                        {fields.map((field, index) => (
                            <div key={field.id} className="flex items-end gap-3 p-3 border rounded-lg">
                                <div className="flex-none font-medium w-16 text-center text-sm pt-7">
                                    {index + 1}ª Aula
                                </div>
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
                            </div>
                        ))}

                         {errors.horarios?.root && (
                            <p className="text-sm font-medium text-destructive px-1">{errors.horarios.root.message}</p>
                        )}
                    </form>
                </Form>
                
                <SheetFooter className="border-t pt-4">
                    <Button variant="outline" onClick={() => setIsOpen(false)}>Cancelar</Button>
                    <Button type="submit" form="horarios-form" disabled={loading}>
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Salvar Horários
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
