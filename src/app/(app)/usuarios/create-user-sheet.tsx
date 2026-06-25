
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
import { Badge } from '@/components/ui/badge';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useToast } from '@/hooks/use-toast';
import { createUser } from './actions';
import { Loader2, Check, ChevronsUpDown, X, School } from 'lucide-react';
import { cn } from '@/lib/utils';
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
    const [selectedEscola, setSelectedEscola] = useState<string | null>(null);
    const [escolaPopoverOpen, setEscolaPopoverOpen] = useState(false);

    // Admin: escolas favoritas (multi-select)
    const [favRegional, setFavRegional] = useState('');
    const [escolasFavoritas, setEscolasFavoritas] = useState<string[]>([]);
    const [favPopoverOpen, setFavPopoverOpen] = useState(false);

    const regionais = useMemo(() => [...new Set(allEscolas.map(e => e.regional).filter(Boolean).sort((a,b) => (a || '').localeCompare(b || '')))], [allEscolas]);

    const escolasFiltradas = useMemo(() => {
        const base = selectedRegional
            ? allEscolas.filter(e => e.regional === selectedRegional)
            : allEscolas;
        return [...base].sort((a, b) => a.escolar.localeCompare(b.escolar));
    }, [allEscolas, selectedRegional]);

    const escolasFavFiltradas = useMemo(() => {
        const base = favRegional
            ? allEscolas.filter(e => e.regional === favRegional)
            : allEscolas;
        return [...base].sort((a, b) => a.escolar.localeCompare(b.escolar));
    }, [allEscolas, favRegional]);

    const toggleFavorita = (escolaId: string) => {
        const id = String(escolaId);
        setEscolasFavoritas(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const handleModuleToggle = (moduleId: string) => {
        const currentModules = form.getValues('modules') || [];
        const newModules = currentModules.includes(moduleId)
            ? currentModules.filter(m => m !== moduleId)
            : [...currentModules, moduleId];
        form.setValue('modules', newModules, { shouldValidate: true });
    };

    const onSubmit = async (data: CreateUserFormValues) => {
        setLoading(true);
        const result = await createUser({
            ...data,
            ue: isAdmin ? null : selectedEscola,
            escolas_favoritas: isAdmin ? escolasFavoritas : [],
        } as any);
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
            setSelectedEscola(null);
            setSelectedRegional('');
            setEscolasFavoritas([]);
            setFavRegional('');
            onUserCreated?.();
            setIsOpen(false);
        }
    };

    const selectedEscolaName = useMemo(() => {
        if (!selectedEscola) return null;
        return allEscolas.find(e => e.id === selectedEscola)?.escolar ?? null;
    }, [selectedEscola, allEscolas]);

    return (
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetContent
                onPointerDownOutside={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.closest('[data-radix-popper-content-wrapper]') || target.closest('[cmdk-root]')) return;
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

                        {!isAdmin && (
                            <>
                                <div className="space-y-2">
                                    <Label>Regional</Label>
                                    <Select
                                        onValueChange={(value) => {
                                            setSelectedRegional(value === '_todas' ? '' : value);
                                            setSelectedEscola(null);
                                        }}
                                        value={selectedRegional || '_todas'}
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

                                <div className="space-y-2">
                                    <Label>Escola Vinculada</Label>
                                    <Popover modal open={escolaPopoverOpen} onOpenChange={setEscolaPopoverOpen}>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                role="combobox"
                                                aria-expanded={escolaPopoverOpen}
                                                className="w-full justify-between font-normal"
                                            >
                                                <span className="truncate">
                                                    {selectedEscolaName ?? "Selecione uma escola"}
                                                </span>
                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                                            <Command>
                                                <CommandInput placeholder="Buscar escola..." />
                                                <CommandList>
                                                    <CommandEmpty>Nenhuma escola encontrada.</CommandEmpty>
                                                    <CommandGroup>
                                                        <CommandItem
                                                            value="__nenhuma__"
                                                            onSelect={() => {
                                                                setSelectedEscola(null);
                                                                setEscolaPopoverOpen(false);
                                                            }}
                                                        >
                                                            <Check className={cn("mr-2 h-4 w-4", !selectedEscola ? "opacity-100" : "opacity-0")} />
                                                            Nenhuma
                                                        </CommandItem>
                                                        {escolasFiltradas.map(escola => (
                                                            <CommandItem
                                                                key={escola.id}
                                                                value={escola.escolar}
                                                                onSelect={() => {
                                                                    setSelectedEscola(escola.id);
                                                                    setEscolaPopoverOpen(false);
                                                                }}
                                                            >
                                                                <Check className={cn("mr-2 h-4 w-4", selectedEscola === escola.id ? "opacity-100" : "opacity-0")} />
                                                                {escola.escolar}
                                                            </CommandItem>
                                                        ))}
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                </div>
                            </>
                        )}

                        {isAdmin && (
                            <div className="space-y-3">
                                <Label>Escolas Favoritas</Label>
                                <p className="text-xs text-muted-foreground">Selecione as escolas que este administrador acompanha com frequência.</p>

                                <div className="space-y-2">
                                    <Select
                                        onValueChange={(value) => setFavRegional(value === '_todas' ? '' : value)}
                                        value={favRegional || '_todas'}
                                    >
                                        <SelectTrigger className="h-9">
                                            <SelectValue placeholder="Filtrar por regional" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="_todas">Todas as regionais</SelectItem>
                                            {regionais.map(regional => (
                                                <SelectItem key={regional} value={regional!}>{regional}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <Popover modal open={favPopoverOpen} onOpenChange={setFavPopoverOpen}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            aria-expanded={favPopoverOpen}
                                            className="w-full justify-between font-normal"
                                        >
                                            <span className="truncate">
                                                {escolasFavoritas.length === 0
                                                    ? "Selecionar escolas..."
                                                    : `${escolasFavoritas.length} escola(s) selecionada(s)`}
                                            </span>
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                                        <Command>
                                            <CommandInput placeholder="Buscar escola..." />
                                            <CommandList>
                                                <CommandEmpty>Nenhuma escola encontrada.</CommandEmpty>
                                                <CommandGroup>
                                                    {escolasFavFiltradas.map(escola => (
                                                        <CommandItem
                                                            key={escola.id}
                                                            value={escola.escolar}
                                                            onSelect={() => toggleFavorita(escola.id)}
                                                        >
                                                            <Check className={cn("mr-2 h-4 w-4", escolasFavoritas.includes(String(escola.id)) ? "opacity-100" : "opacity-0")} />
                                                            {escola.escolar}
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>

                                {escolasFavoritas.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 rounded-md border p-2">
                                        {escolasFavoritas.map(id => {
                                            const escola = allEscolas.find(e => String(e.id) === id);
                                            if (!escola) return null;
                                            return (
                                                <Badge key={id} variant="secondary" className="gap-1 pr-1">
                                                    <School className="h-3 w-3" />
                                                    <span className="max-w-[180px] truncate text-[11px]">{escola.escolar}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleFavorita(id)}
                                                        className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                                                    >
                                                        <X className="h-3 w-3" />
                                                    </button>
                                                </Badge>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

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
