
'use client';

import { useState, useEffect, useMemo } from 'react';
import type { Profile, Escola } from '@/lib/types';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useToast } from '@/hooks/use-toast';
import { updateUserPermissions } from './actions';
import { Loader2, Check, ChevronsUpDown, X, School } from 'lucide-react';
import { cn } from '@/lib/utils';

type Module = {
    id: string;
    label: string;
    description: string;
}

type EditUserPermissionsSheetProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  user: Profile;
  allModules: Module[];
  onUserUpdate: (updatedUser: Profile) => void;
  allEscolas: Escola[];
};

export function EditUserPermissionsSheet({ isOpen, setIsOpen, user, allModules, onUserUpdate, allEscolas }: EditUserPermissionsSheetProps) {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [selectedModules, setSelectedModules] = useState<string[]>([]);
    const [selectedRole, setSelectedRole] = useState<'admin' | 'user'>('user');
    const [selectedSchool, setSelectedSchool] = useState<string | null | undefined>(null);
    const [selectedRegional, setSelectedRegional] = useState('');
    const [escolaPopoverOpen, setEscolaPopoverOpen] = useState(false);

    // Admin: escolas favoritas
    const [favRegional, setFavRegional] = useState('');
    const [escolasFavoritas, setEscolasFavoritas] = useState<string[]>([]);
    const [favPopoverOpen, setFavPopoverOpen] = useState(false);

    const regionais = useMemo(() => [...new Set(allEscolas.map(e => e.regional).filter(Boolean).sort((a,b) => (a || '').localeCompare(b || '')))], [allEscolas]);
    const escolasFiltradas = useMemo(() => {
        if (!selectedRegional) return allEscolas.sort((a, b) => a.escolar.localeCompare(b.escolar));
        return allEscolas.filter(e => e.regional === selectedRegional).sort((a, b) => a.escolar.localeCompare(b.escolar));
    }, [allEscolas, selectedRegional]);

    const escolasFavFiltradas = useMemo(() => {
        const base = favRegional
            ? allEscolas.filter(e => e.regional === favRegional)
            : allEscolas;
        return [...base].sort((a, b) => a.escolar.localeCompare(b.escolar));
    }, [allEscolas, favRegional]);

    useEffect(() => {
        if (user) {
            setSelectedModules(user.modules || []);
            setSelectedRole(user.role || 'user');
            setSelectedSchool(user.ue);
            setEscolasFavoritas((user.escolas_favoritas || []).map(String));
            const userSchool = allEscolas.find(e => e.id === user.ue);
            if (userSchool?.regional) {
                setSelectedRegional(userSchool.regional);
            } else {
                setSelectedRegional('');
            }
            setFavRegional('');
        }
    }, [user, allEscolas]);

    const handleModuleToggle = (moduleId: string) => {
        setSelectedModules(prev =>
            prev.includes(moduleId) ? prev.filter(m => m !== moduleId) : [...prev, moduleId]
        );
    };

    const toggleFavorita = (escolaId: string) => {
        const id = String(escolaId);
        setEscolasFavoritas(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const handleSave = async () => {
        setLoading(true);
        const result = await updateUserPermissions(user.id, selectedModules, selectedRole, selectedSchool, escolasFavoritas);
        setLoading(false);

        if (result.error) {
            toast({
                title: 'Erro ao atualizar permissões',
                description: result.error,
                variant: 'destructive',
            });
        } else {
            toast({
                title: 'Permissões Atualizadas!',
                description: `As permissões de ${user.name || user.email} foram salvas.`,
            });
            onUserUpdate({ ...user, modules: selectedModules, role: selectedRole, ue: selectedSchool, escolas_favoritas: escolasFavoritas });
            setIsOpen(false);
        }
    };

    const isAdmin = selectedRole === 'admin';

    const selectedSchoolName = useMemo(() => {
        if (!selectedSchool) return null;
        return allEscolas.find(e => e.id === selectedSchool)?.escolar ?? null;
    }, [selectedSchool, allEscolas]);

    return (
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetContent onPointerDownOutside={(e) => {
                const target = e.target as HTMLElement;
                if (target.closest('[data-radix-popper-content-wrapper]') || target.closest('[cmdk-root]')) return;
                e.preventDefault();
            }} className="sm:max-w-lg flex flex-col">
                <SheetHeader>
                    <SheetTitle>Gerenciar Permissões</SheetTitle>
                    <SheetDescription>
                        Defina a função e os módulos que <span className="font-semibold text-foreground">{user.name || user.email}</span> pode acessar.
                    </SheetDescription>
                </SheetHeader>

                <div className="flex-1 space-y-6 overflow-y-auto p-1">
                    <div className="space-y-2">
                        <Label htmlFor="role-select">Função</Label>
                        <Select value={selectedRole} onValueChange={(value: 'admin' | 'user') => setSelectedRole(value)}>
                            <SelectTrigger id="role-select">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="user">Usuário</SelectItem>
                                <SelectItem value="admin">Administrador</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">Administradores têm acesso a todos os módulos.</p>
                    </div>

                    {!isAdmin && (
                        <>
                            <div className="space-y-2">
                                <Label>Regional</Label>
                                <Select value={selectedRegional} onValueChange={(value) => {
                                    setSelectedRegional(value);
                                    setSelectedSchool(null);
                                }}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecione uma regional" />
                                    </SelectTrigger>
                                    <SelectContent>
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
                                                {selectedSchoolName ?? "Selecione uma escola"}
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
                                                            setSelectedSchool(null);
                                                            setEscolaPopoverOpen(false);
                                                        }}
                                                    >
                                                        <Check className={cn("mr-2 h-4 w-4", !selectedSchool ? "opacity-100" : "opacity-0")} />
                                                        Nenhuma
                                                    </CommandItem>
                                                    {escolasFiltradas.map(escola => (
                                                        <CommandItem
                                                            key={escola.id}
                                                            value={escola.escolar}
                                                            onSelect={() => {
                                                                setSelectedSchool(escola.id);
                                                                setEscolaPopoverOpen(false);
                                                            }}
                                                        >
                                                            <Check className={cn("mr-2 h-4 w-4", selectedSchool === escola.id ? "opacity-100" : "opacity-0")} />
                                                            {escola.escolar}
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                                <p className="text-xs text-muted-foreground">Vincule o usuário a uma unidade escolar.</p>
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
                                        id={module.id}
                                        checked={isAdmin || selectedModules.includes(module.id)}
                                        onCheckedChange={() => handleModuleToggle(module.id)}
                                        disabled={isAdmin || module.id === 'dashboard'}
                                        className="mt-1"
                                    />
                                    <div className="grid gap-1.5 leading-none">
                                        <Label htmlFor={module.id} className="font-medium leading-snug">
                                            {module.label}
                                            {module.id === 'dashboard' && <span className="text-muted-foreground text-xs font-normal"> (acesso padrão)</span>}
                                        </Label>
                                        {module.description && <p className="text-xs text-muted-foreground">{module.description}</p>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <SheetFooter className="mt-auto border-t pt-4">
                    <Button variant="outline" onClick={() => setIsOpen(false)}>Cancelar</Button>
                    <Button onClick={handleSave} disabled={loading}>
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Salvar Alterações
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
