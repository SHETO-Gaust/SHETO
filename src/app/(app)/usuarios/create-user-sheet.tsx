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
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { createUser } from './actions';
import { Loader2 } from 'lucide-react';

type Module = {
    id: string;
    label: string;
}

const createUserFormSchema = z.object({
  name: z.string().optional(),
  email: z.string().email({ message: "Email inválido." }),
  password: z.string().min(6, { message: "A senha deve ter no mínimo 6 caracteres." }),
  role: z.enum(['admin', 'user']),
  modules: z.array(z.string()).optional(),
});

type CreateUserFormValues = z.infer<typeof createUserFormSchema>;

type CreateUserSheetProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  allModules: Module[];
};

export function CreateUserSheet({ isOpen, setIsOpen, allModules }: CreateUserSheetProps) {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);

    const form = useForm<CreateUserFormValues>({
        resolver: zodResolver(createUserFormSchema),
        defaultValues: {
            name: '',
            email: '',
            password: '',
            role: 'user',
            modules: ['dashboard'],
        }
    });

    const role = form.watch('role');
    const isAdmin = role === 'admin';
    
    const handleModuleToggle = (moduleId: string) => {
        const currentModules = form.getValues('modules') || [];
        const newModules = currentModules.includes(moduleId)
            ? currentModules.filter(m => m !== moduleId)
            : [...currentModules, moduleId];
        form.setValue('modules', newModules, { shouldValidate: true });
    };

    const onSubmit = async (data: CreateUserFormValues) => {
        setLoading(true);
        const payload = { ...data, modules: data.role === 'admin' ? [] : data.modules || [] };
        const result = await createUser(payload);
        setLoading(false);

        if (result.error) {
            toast({
                title: 'Erro ao criar usuário',
                description: result.error,
                variant: 'destructive',
            });
        } else {
            toast({
                title: 'Usuário Criado!',
                description: `O usuário ${data.email} foi criado com sucesso.`,
            });
            form.reset();
            setIsOpen(false);
        }
    };

    return (
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetContent className="sm:max-w-lg flex flex-col">
                <SheetHeader>
                    <SheetTitle>Criar Novo Usuário</SheetTitle>
                    <SheetDescription>
                        Preencha os dados abaixo para criar um novo usuário e definir suas permissões.
                    </SheetDescription>
                </SheetHeader>

                <Form {...form}>
                    <form className="flex-1 space-y-6 overflow-y-auto p-1">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Nome Completo</FormLabel>
                                    <FormControl><Input placeholder="Nome do usuário" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="email"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Email</FormLabel>
                                    <FormControl><Input type="email" placeholder="email@exemplo.com" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="password"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Senha</FormLabel>
                                    <FormControl><Input type="password" placeholder="••••••••" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="role"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Função</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl>
                                            <SelectTrigger id="role-select">
                                                <SelectValue />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="user">Usuário</SelectItem>
                                            <SelectItem value="admin">Administrador</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-muted-foreground">Administradores têm acesso a todos os módulos.</p>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />


                        <div className="space-y-2">
                            <h4 className="font-medium">Módulos Acessíveis</h4>
                            <div className="space-y-3 rounded-md border p-4">
                                {allModules.map(module => (
                                    <div key={module.id} className="flex items-center space-x-2">
                                        <Checkbox
                                            id={`create-${module.id}`}
                                            checked={isAdmin || (form.getValues('modules') || []).includes(module.id)}
                                            onCheckedChange={() => handleModuleToggle(module.id)}
                                            disabled={isAdmin || module.id === 'dashboard'}
                                        />
                                        <Label htmlFor={`create-${module.id}`} className="font-normal leading-snug">
                                            {module.label}
                                            {module.id === 'dashboard' && <span className="text-muted-foreground text-xs"> (acesso padrão)</span>}
                                        </Label>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </form>
                </Form>

                <SheetFooter className="mt-auto border-t pt-4">
                    <Button variant="outline" onClick={() => setIsOpen(false)}>Cancelar</Button>
                    <Button onClick={form.handleSubmit(onSubmit)} disabled={loading}>
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Criar Usuário
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
