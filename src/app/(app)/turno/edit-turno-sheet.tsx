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
import { useToast } from '@/hooks/use-toast';
import { upsertTurno } from './actions';
import { Loader2 } from 'lucide-react';
import type { Turno } from '@/lib/types';

type EditTurnoSheetProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  turno: Turno | null;
  escolaId: string;
  onTurnoUpdated: (turno: Turno) => void;
};

const turnoFormSchema = z.object({
  id: z.string().optional(),
  escola_id: z.string().uuid(),
  nome: z.string().min(3, { message: "O nome deve ter pelo menos 3 caracteres." }),
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
        }
    });

    useEffect(() => {
        if (isOpen) {
            form.reset({
                id: turno?.id,
                escola_id: escolaId,
                nome: turno?.nome || '',
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
                        {isEditMode ? `Renomeie o turno "${turno.nome}".` : 'Adicione um novo turno para a sua escola.'}
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
