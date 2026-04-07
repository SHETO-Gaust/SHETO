
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
import { Loader2, Coffee } from 'lucide-react';
import type { Turno, HorarioAula } from '@/lib/types';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

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
  tem_intervalo_depois: z.boolean().default(false),
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

    const { fields } = useFieldArray({
        control: form.control,
        name: "horarios",
    });

    useEffect(() => {
        if (isOpen) {
            const aulasPorDia = turno.aulas_por_dia || 5;
            const existingHorarios = turno.horarios || [];
            const newHorarios = Array.from({ length: aulasPorDia }, (_, i) => {
                return existingHorarios[i] || { id: `aula_${i + 1}`, inicio: '', fim: '', tem_intervalo_depois: false };
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
        } else {
            toast({
                title: 'Horários atualizados!',
                description: `A configuração de horários para "${turno.nome}" foi salva.`,
            });
            onHorariosUpdated({ ...turno, horarios: data.horarios as any });
            setIsOpen(false);
        }
    };
    
    const { formState: { errors } } = form;

    return (
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetContent onPointerDownOutside={(e) => e.preventDefault()} className="w-full sm:max-w-xl flex flex-col">
                <SheetHeader>
                    <SheetTitle>Configurar Horários</SheetTitle>
                    <SheetDescription>
                        Defina os horários das aulas e onde ocorrem os intervalos para o turno <span className="font-semibold text-foreground">{turno.nome}</span>.
                    </SheetDescription>
                </SheetHeader>

                <Form {...form}>
                    <form 
                        id="horarios-form"
                        onSubmit={form.handleSubmit(onSubmit)} 
                        className="flex-1 overflow-y-auto pr-2 space-y-4 py-4"
                    >
                        {fields.map((field, index) => (
                            <div key={field.id} className="space-y-3">
                                <div className="flex flex-col md:flex-row items-center gap-4 p-4 border rounded-xl bg-card shadow-sm">
                                    <div className="flex-none font-black text-primary bg-primary/5 w-12 h-12 rounded-full flex items-center justify-center">
                                        {index + 1}ª
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 flex-1">
                                        <FormField
                                            control={form.control}
                                            name={`horarios.${index}.inicio`}
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-[10px] uppercase font-bold text-muted-foreground">Início</FormLabel>
                                                    <FormControl><Input type="time" {...field} className="h-10" /></FormControl>
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name={`horarios.${index}.fim`}
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-[10px] uppercase font-bold text-muted-foreground">Fim</FormLabel>
                                                    <FormControl><Input type="time" {...field} className="h-10" /></FormControl>
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                    {index < fields.length - 1 && (
                                        <FormField
                                            control={form.control}
                                            name={`horarios.${index}.tem_intervalo_depois`}
                                            render={({ field }) => (
                                                <FormItem className="flex flex-col items-center gap-1.5 space-y-0 pt-2">
                                                    <Label className="text-[9px] uppercase font-black text-orange-600">Intervalo</Label>
                                                    <FormControl>
                                                        <Switch 
                                                            checked={field.value} 
                                                            onCheckedChange={field.onChange}
                                                            className="data-[state=checked]:bg-orange-500"
                                                        />
                                                    </FormControl>
                                                </FormItem>
                                            )}
                                        />
                                    )}
                                </div>
                                {form.watch(`horarios.${index}.tem_intervalo_depois`) && index < fields.length - 1 && (
                                    <div className="flex items-center justify-center gap-2 py-1 px-4 bg-orange-50/50 border border-dashed border-orange-200 rounded-lg mx-auto w-fit animate-in fade-in zoom-in-95">
                                        <Coffee className="h-3 w-3 text-orange-500" />
                                        <span className="text-[10px] font-black uppercase text-orange-700 tracking-widest">
                                            Recesso após a {index + 1}ª aula
                                        </span>
                                    </div>
                                )}
                            </div>
                        ))}

                         {errors.horarios?.root && (
                            <p className="text-sm font-medium text-destructive px-1">{errors.horarios.root.message}</p>
                        )}
                    </form>
                </Form>
                
                <SheetFooter className="border-t pt-4">
                    <Button variant="outline" onClick={() => setIsOpen(false)}>Cancelar</Button>
                    <Button type="submit" form="horarios-form" disabled={loading} className="bg-primary shadow-lg">
                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Salvar Configuração
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
