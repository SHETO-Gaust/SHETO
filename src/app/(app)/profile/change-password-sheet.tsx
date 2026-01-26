'use client';

import { useState } from 'react';
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
import { updatePassword } from './actions';
import { Loader2 } from 'lucide-react';

type ChangePasswordSheetProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
};

const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Senha atual é obrigatória.'),
  newPassword: z.string().min(6, 'A nova senha deve ter no mínimo 6 caracteres.'),
  confirmPassword: z.string().min(6, 'A confirmação da nova senha deve ter no mínimo 6 caracteres.'),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: 'As novas senhas não correspondem.',
  path: ['confirmPassword'],
});

type ChangePasswordFormValues = z.infer<typeof updatePasswordSchema>;

export function ChangePasswordSheet({ isOpen, setIsOpen }: ChangePasswordSheetProps) {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);

    const form = useForm<ChangePasswordFormValues>({
        resolver: zodResolver(updatePasswordSchema),
        defaultValues: {
            currentPassword: '',
            newPassword: '',
            confirmPassword: '',
        }
    });

    const onSubmit = async (data: ChangePasswordFormValues) => {
        setLoading(true);
        const result = await updatePassword(data);
        setLoading(false);

        if (result.error) {
            toast({
                title: 'Erro ao alterar senha',
                description: result.error,
                variant: 'destructive',
            });
        } else {
            toast({
                title: 'Senha Alterada!',
                description: `Sua senha foi alterada com sucesso.`,
            });
            form.reset();
            setIsOpen(false);
        }
    };

    return (
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetContent className="sm:max-w-lg flex flex-col">
                <SheetHeader>
                    <SheetTitle>Alterar Senha</SheetTitle>
                    <SheetDescription>
                        Para sua segurança, informe sua senha atual antes de definir uma nova.
                    </SheetDescription>
                </SheetHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="flex-1 space-y-6 overflow-y-auto p-1">
                        <FormField
                            control={form.control}
                            name="currentPassword"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Senha Atual</FormLabel>
                                    <FormControl><Input type="password" placeholder="••••••••" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="newPassword"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Nova Senha</FormLabel>
                                    <FormControl><Input type="password" placeholder="••••••••" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="confirmPassword"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Confirmar Nova Senha</FormLabel>
                                    <FormControl><Input type="password" placeholder="••••••••" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </form>
                </Form>

                <SheetFooter className="mt-auto border-t pt-4">
                    <Button variant="outline" onClick={() => {form.reset(); setIsOpen(false);}}>Cancelar</Button>
                    <Button onClick={form.handleSubmit(onSubmit)} disabled={loading}>
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Salvar Nova Senha
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
