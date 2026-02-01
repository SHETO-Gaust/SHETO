'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
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
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { upsertTurno } from './actions';
import { Loader2 } from 'lucide-react';
import type { Turno } from '@/lib/types';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';

type EditTurnoSheetProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  turno: Turno | null;
  escolaId: string;
  onTurnoUpdated: (turno: Turno) => void;
};

const diasDaSemana = [
  { id: 'segunda', label: 'Segunda-feira' },
  { id: 'terca', label: 'Terça-feira' },
  { id: 'quarta', label: 'Quarta-feira' },
  { id: 'quinta', label: 'Quinta-feira' },
  { id: 'sexta', label: 'Sexta-feira' },
  { id: 'sabado', label: 'Sábado' },
];

const turnoFormSchema = z.object({
  id: z.string().optional(),
  escola_id: z.string(),
  nome: z.string().min(3, { message: "O nome deve ter pelo menos 3 caracteres." }),
  dias_semana: z.array(z.string()).refine((value) => value.some((item) => item), {
    message: "Você deve selecionar pelo menos um dia da semana.",
  }),
  aulas_por_dia: z.coerce.number().min(1, { message: "Deve haver pelo menos 1 aula por dia." }),
});

type TurnoFormValues = z.infer<typeof turnoFormSchema>;

export function EditTurnoSheet({ isOpen, setIsOpen, turno, escolaId, onTurnoUpdated }: EditTurnoSheetProps) {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const isEditMode = !!turno;

    const form = useForm<TurnoFormValues>({
        resolver: zodResolver(turnoFormSchema),
        defaultValues: {
            id: undefined,
            escola_id: escolaId,
            nome: '',
            dias_semana: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
            aulas_por_dia: 5,
        }
    });

    useEffect(() => {
        if (isOpen) {
            form.reset({
                id: turno?.id,
                escola_id: escolaId,
                nome: turno?.nome || '',
                dias_semana: turno?.dias_semana || ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
                aulas_por_dia: turno?.aulas_por_dia || 5,
            });
        }
    }, [isOpen, turno, escolaId, form]);

    const onSubmit = async (data: TurnoFormValues) => {
        setLoading(true);
        const result = await upsertTurno(data);
        setLoading(false);

        if (result.error) {
            toast({
                title: 'Erro ao salvar turno',
                description: result.error,
                variant: 'destructive',
            });
        } else {
            toast({
                title: isEditMode ? 'Turno Atualizado!' : 'Turno Criado!',
                description: `O turno "${data.nome}" foi salvo com sucesso.`,
            });
            onTurnoUpdated(result.data as Turno);
            setIsOpen(false);
        }
    };

    return (
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetContent className="sm:max-w-lg flex flex-col">
                <SheetHeader>
                    <SheetTitle>{isEditMode ? 'Editar Turno' : 'Criar Novo Turno'}</SheetTitle>
                    <SheetDescription>
                        {isEditMode ? `Configure o turno "${turno.nome}".` : 'Adicione e configure um novo turno para a sua escola.'}
                    </SheetDescription>
                </SheetHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="flex-1 space-y-6 overflow-y-auto p-1">
                        <FormField
                            control={form.control}
                            name="nome"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Nome do Turno</FormLabel>
                                    <FormControl><Input placeholder="Ex: Integral" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <Separator />
                        
                        <FormField
                            control={form.control}
                            name="dias_semana"
                            render={() => (
                                <FormItem>
                                    <div className="mb-4">
                                        <FormLabel className="text-base">Dias da Semana</FormLabel>
                                        <p className="text-sm text-muted-foreground">
                                            Selecione os dias em que este turno opera.
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                    {diasDaSemana.map((item) => (
                                        <FormField
                                        key={item.id}
                                        control={form.control}
                                        name="dias_semana"
                                        render={({ field }) => {
                                            return (
                                            <FormItem
                                                key={item.id}
                                                className="flex flex-row items-start space-x-3 space-y-0"
                                            >
                                                <FormControl>
                                                <Checkbox
                                                    checked={field.value?.includes(item.id)}
                                                    onCheckedChange={(checked) => {
                                                    return checked
                                                        ? field.onChange([...field.value, item.id])
                                                        : field.onChange(
                                                            field.value?.filter(
                                                            (value) => value !== item.id
                                                            )
                                                        )
                                                    }}
                                                />
                                                </FormControl>
                                                <FormLabel className="font-normal">
                                                {item.label}
                                                </FormLabel>
                                            </FormItem>
                                            )
                                        }}
                                        />
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
                                    <FormLabel>Quantidade de Aulas por Dia</FormLabel>
                                    <FormControl>
                                        <Input type="number" min="1" max="15" placeholder="Ex: 5" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                    </form>
                </Form>

                <SheetFooter className="mt-auto border-t pt-4">
                    <Button variant="outline" onClick={() => setIsOpen(false)}>Cancelar</Button>
                    <Button onClick={form.handleSubmit(onSubmit)} disabled={loading}>
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {isEditMode ? 'Salvar Alterações' : 'Criar Turno'}
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
