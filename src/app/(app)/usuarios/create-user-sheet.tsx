
'use client';

import { useState, useMemo } from 'react';
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
import type { Escola } from '@/lib/types';

type Module = {
    id: string;
    label: string;
    description: string;
}

const createUserFormSchema = z.object({
  name: z.string().optional(),
  email: z.string().email({ message: "Email inválido." }),
  password: z.string().min(6, { message: "A senha deve ter no mínimo 6 caracteres." }),
  role: z.enum(['admin', 'user']),
  modules: z.array(z.string()).optional(),
  ue: z.string().nullable().optional(),
});

type CreateUserFormValues = z.infer<typeof createUserFormSchema>;

type CreateUserSheetProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  allModules: Module[];
  allEscolas: Escola[];
  onUserCreated?: () => void;
};

export function CreateUserSheet({ isOpen, setIsOpen, allModules, allEscolas, onUserCreated }: CreateUserSheetProps) {
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

    const [selectedRegional, setSelectedRegional] = useState('');
    const regionais = useMemo(() => [...new Set(allEscolas.map(e => e.regional).filter(Boolean).sort((a,b) => (a || '').localeCompare(b || '')))], [allEscolas]);

    // Sem regional selecionada mostra todas; com regional filtra
    const escolasFiltradas = useMemo(() => {
        const base = selectedRegional
            ? allEscolas.filter(e => e.regional === selectedRegional)
            : allEscolas;
        return [...base].sort((a, b) => a.escolar.localeCompare(b.escolar));
    }, [allEscolas, selectedRegional]);

    const handleModuleToggle = (moduleId: string) => {
        const currentModules = form.getValues('modules') || [];
        const newModules = currentModules.includes(moduleId)
            ? currentModules.filter(m => m !== moduleId)
            : [...currentModules, moduleId];
        form.setValue('modules', newModules, { shouldValidate: true });
    };

    const onSubmit = async (data: CreateUserFormValues) => {
        setLoading(true);
        const result = await createUser(data as any);
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
                description: `O usuário ${data.email} foi criado com sucesso e o email enviado.`,
            });
            form.reset();
            onUserCreated?.();
            setIsOpen(false);
        }
    };

    return (
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetContent
                onPointerDownOutside={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.closest('[data-radix-popper-content-wrapper]')) return;
                    e.preventDefault();
                }}
                className="sm:max-w-lg flex flex-col"
            >
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
                                    <FormControl><Input placeholder="Nome do usuário" {...field} value={field.value ?? ''} /></FormControl>
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
                            <Label>Regional</Label>
                            <Select
                                onValueChange={(value) => {
                                    setSelectedRegional(value === '_todas' ? '' : value);
                                    form.setValue('ue', undefined, { shouldValidate: true });
                                }}
                                value={selectedRegional || '_todas'}
                                disabled={isAdmin}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Todas as regionais" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="_todas">Todas as regionais</SelectItem>
                                    {regionais.map(regional => (
                                        <SelectItem key={regional} value={regional!}>{regional}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <FormField
                            control={form.control}
                            name="ue"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Escola Vinculada</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value ?? undefined} disabled={isAdmin}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Selecione uma escola" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="null">Nenhuma</SelectItem>
                                            {escolasFiltradas.map(escola => (
                                                <SelectItem key={escola.id} value={escola.id}>{escola.escolar}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="space-y-2">
                            <h4 className="font-medium">Módulos Acessíveis</h4>
                            <div className="space-y-4 rounded-md border p-4">
                                {allModules.map(module => (
                                    <div key={module.id} className="flex items-start space-x-3">
                                        <Checkbox
                                            id={`create-${module.id}`}
                                            checked={isAdmin || (form.getValues('modules') || []).includes(module.id)}
                                            onCheckedChange={() => handleModuleToggle(module.id)}
                                            disabled={isAdmin || module.id === 'dashboard'}
                                            className="mt-1"
                                        />
                                        <div className="grid gap-1.5 leading-none">
                                            <Label htmlFor={`create-${module.id}`} className="font-medium leading-snug">
                                                {module.label}
                                                {module.id === 'dashboard' && <span className="text-muted-foreground text-xs font-normal"> (acesso padrão)</span>}
                                            </Label>
                                            {module.description && <p className="text-xs text-muted-foreground">{module.description}</p>}
                                        </div>
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
