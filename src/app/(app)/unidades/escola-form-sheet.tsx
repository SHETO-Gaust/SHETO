'use client';

import { useEffect, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
    Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from '@/components/ui/sheet';
import {
    Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Building2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { createEscola, updateEscola, type EscolaCompleta } from './actions';

// ─── Schema (mesmo do actions.ts, replicado para o client) ───────────────────

const formSchema = z.object({
    regional:      z.string().min(1, 'Regional é obrigatória.'),
    cidade:        z.string().min(1, 'Cidade é obrigatória.'),
    inep:          z.string().min(1, 'INEP é obrigatório.'),
    escolar:       z.string().min(1, 'Nome da escola é obrigatório.'),
    classificacao: z.string().optional().nullable(),
    loc:           z.string().optional().nullable(),
});

type FormValues = z.infer<typeof formSchema>;

type Props = {
    isOpen: boolean;
    onClose: () => void;
    escolaEditando: EscolaCompleta | null;
    onSaved: () => Promise<void>;
};

// ─── Campos do formulário (facilita renderização DRY) ────────────────────────

const CAMPOS: { name: keyof FormValues; label: string; placeholder: string; required?: boolean }[] = [
    { name: 'escolar',       label: 'Nome da Escola / Unidade', placeholder: 'Ex: E.E. Vila União',     required: true },
    { name: 'inep',          label: 'INEP',                    placeholder: 'Ex: 17026261',              required: true },
    { name: 'regional',      label: 'Regional',                placeholder: 'Ex: PALMAS',                required: true },
    { name: 'cidade',        label: 'Cidade',                  placeholder: 'Ex: Palmas',                required: true },
    { name: 'classificacao', label: 'Classificação',           placeholder: 'Ex: ESTADUAL'                             },
    { name: 'loc',           label: 'LOC',                     placeholder: 'Ex: URBANA'                              },
];

export function EscolaFormSheet({ isOpen, onClose, escolaEditando, onSaved }: Props) {
    const { toast } = useToast();
    const [isPending, startTransition] = useTransition();
    const isEditing = !!escolaEditando;

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            regional:      '',
            cidade:        '',
            inep:          '',
            escolar:       '',
            classificacao: '',
            loc:           '',
        },
    });

    // Preenche o form quando entrar em modo edição
    useEffect(() => {
        if (isOpen) {
            if (escolaEditando) {
                form.reset({
                    regional:      escolaEditando.regional      ?? '',
                    cidade:        escolaEditando.cidade        ?? '',
                    inep:          escolaEditando.inep          ?? '',
                    escolar:       escolaEditando.escolar       ?? '',
                    classificacao: escolaEditando.classificacao ?? '',
                    loc:           escolaEditando.loc           ?? '',
                });
            } else {
                form.reset({
                    regional: '', cidade: '', inep: '', escolar: '', classificacao: '', loc: '',
                });
            }
        }
    }, [isOpen, escolaEditando, form]);

    const onSubmit = (values: FormValues) => {
        startTransition(async () => {
            const result = isEditing
                ? await updateEscola(escolaEditando!.id, values)
                : await createEscola(values);

            if (result.error) {
                toast({ variant: 'destructive', title: 'Erro', description: result.error });
                return;
            }

            toast({
                title: isEditing ? 'Unidade atualizada' : 'Unidade cadastrada',
                description: `"${values.escolar}" foi ${isEditing ? 'atualizada' : 'adicionada'} com sucesso.`,
            });
            await onSaved();
        });
    };

    return (
        <Sheet open={isOpen} onOpenChange={open => { if (!open) onClose(); }}>
            <SheetContent className="w-full sm:max-w-[500px] overflow-y-auto">
                <SheetHeader className="mb-6">
                    <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-primary/10 p-2">
                            <Building2 className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <SheetTitle>{isEditing ? 'Editar Unidade' : 'Nova Unidade'}</SheetTitle>
                            <SheetDescription>
                                {isEditing
                                    ? `Editando: ${escolaEditando?.escolar}`
                                    : 'Preencha os dados para cadastrar uma nova unidade escolar.'}
                            </SheetDescription>
                        </div>
                    </div>
                </SheetHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        {CAMPOS.map(campo => (
                            <FormField
                                key={campo.name}
                                control={form.control}
                                name={campo.name}
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>
                                            {campo.label}
                                            {campo.required && (
                                                <span className="ml-1 text-destructive">*</span>
                                            )}
                                        </FormLabel>
                                        <FormControl>
                                            <Input
                                                placeholder={campo.placeholder}
                                                {...field}
                                                value={field.value ?? ''}
                                                disabled={isPending}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        ))}

                        <SheetFooter className="pt-4 gap-2 flex-col sm:flex-row">
                            <Button
                                type="button"
                                variant="outline"
                                className="flex-1"
                                onClick={onClose}
                                disabled={isPending}
                            >
                                Cancelar
                            </Button>
                            <Button type="submit" className="flex-1" disabled={isPending}>
                                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {isEditing ? 'Salvar Alterações' : 'Cadastrar Unidade'}
                            </Button>
                        </SheetFooter>
                    </form>
                </Form>
            </SheetContent>
        </Sheet>
    );
}
