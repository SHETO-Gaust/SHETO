'use client';

import { useState, useTransition, useEffect, useMemo } from 'react';
import type { Profile, Escola } from '@/lib/types';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { Building2, ChevronsUpDown, Check, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

type SchoolSelectorProps = {
    userProfile: Profile;
    allEscolas: Escola[];
};

export function SchoolSelector({ userProfile, allEscolas }: SchoolSelectorProps) {
    const { toast } = useToast();
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [mounted, setMounted] = useState(false);
    const [open, setOpen] = useState(false);
    const [currentSchoolId, setCurrentSchoolId] = useState(userProfile.ue || '');
    const [viewMode, setViewMode] = useState<'favoritas' | 'todas'>('todas');

    useEffect(() => {
        setMounted(true);
    }, []);

    const favoritas = useMemo(() => {
        const favSet = new Set((userProfile.escolas_favoritas || []).map(String));
        return allEscolas.filter(e => favSet.has(String(e.id)));
    }, [userProfile.escolas_favoritas, allEscolas]);

    const favoritasPorRegional = useMemo(() => {
        const groups: Record<string, Escola[]> = {};
        for (const e of favoritas) {
            const key = e.regional || 'Sem regional';
            (groups[key] ||= []).push(e);
        }
        return Object.entries(groups)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([regional, escolas]) => ({
                regional,
                escolas: [...escolas].sort((a, b) => a.escolar.localeCompare(b.escolar)),
            }));
    }, [favoritas]);

    useEffect(() => {
        setViewMode(favoritas.length > 0 ? 'favoritas' : 'todas');
    }, [favoritas.length]);

    const handleSchoolChange = async (newSchoolId: string) => {
        setOpen(false);
        if (newSchoolId === currentSchoolId) return;

        const supabase = createClient();
        const ueValue = newSchoolId === 'null' ? null : newSchoolId;

        const { error } = await supabase
            .from('profiles')
            .update({ ue: ueValue })
            .eq('id', userProfile.id);

        if (error) {
            toast({
                title: 'Erro ao alterar escola',
                description: 'Não foi possível atualizar a escola selecionada.',
                variant: 'destructive',
            });
        } else {
            setCurrentSchoolId(newSchoolId);
            startTransition(() => {
                router.refresh();
            });
            toast({ title: 'Contexto da escola alterado!' });
        }
    };

    if (!mounted) return null;

    const currentSchool = allEscolas.find(s => s.id === (currentSchoolId === 'null' ? null : currentSchoolId));
    const currentSchoolName = currentSchool?.escolar || 'Nenhuma escola selecionada';

    if (userProfile.role === 'admin') {
        return (
            <div className="flex items-center gap-4 w-full">
                <div className="flex items-center gap-2 shrink-0">
                    {isPending
                        ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        : <Building2 className="h-5 w-5 text-muted-foreground" />
                    }
                    <Popover open={open} onOpenChange={setOpen}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="ghost"
                                role="combobox"
                                aria-expanded={open}
                                disabled={isPending}
                                className="max-w-[260px] justify-between gap-2 font-normal border-none shadow-none px-2 truncate"
                            >
                                <span className="truncate text-sm">
                                    {currentSchoolId === 'null' || !currentSchoolId
                                        ? 'Visualização Geral (Admin)'
                                        : (currentSchool?.escolar ?? 'Selecione uma escola...')}
                                </span>
                                <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[340px] p-0" align="start">
                            <Command>
                                <CommandInput placeholder="Buscar escola por nome..." />
                                {favoritas.length > 0 && (
                                    <div className="flex gap-1 border-b p-1">
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant={viewMode === 'favoritas' ? 'secondary' : 'ghost'}
                                            className="h-7 flex-1 text-xs"
                                            onClick={() => setViewMode('favoritas')}
                                        >
                                            Favoritas
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant={viewMode === 'todas' ? 'secondary' : 'ghost'}
                                            className="h-7 flex-1 text-xs"
                                            onClick={() => setViewMode('todas')}
                                        >
                                            Todas
                                        </Button>
                                    </div>
                                )}
                                <CommandList>
                                    <CommandEmpty>Nenhuma escola encontrada.</CommandEmpty>
                                    <CommandGroup>
                                        <CommandItem
                                            value="null"
                                            onSelect={() => handleSchoolChange('null')}
                                        >
                                            <Check className={cn('mr-2 h-4 w-4', (!currentSchoolId || currentSchoolId === 'null') ? 'opacity-100' : 'opacity-0')} />
                                            Visualização Geral (Admin)
                                        </CommandItem>
                                    </CommandGroup>
                                    {viewMode === 'favoritas'
                                        ? favoritasPorRegional.map(({ regional, escolas }) => (
                                            <CommandGroup key={regional} heading={regional}>
                                                {escolas.map(escola => (
                                                    <CommandItem
                                                        key={escola.id}
                                                        value={escola.escolar}
                                                        onSelect={() => handleSchoolChange(escola.id)}
                                                    >
                                                        <Check className={cn('mr-2 h-4 w-4', String(currentSchoolId) === String(escola.id) ? 'opacity-100' : 'opacity-0')} />
                                                        {escola.escolar}
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        ))
                                        : (
                                            <CommandGroup>
                                                {allEscolas.map(escola => (
                                                    <CommandItem
                                                        key={escola.id}
                                                        value={escola.escolar}
                                                        onSelect={() => handleSchoolChange(escola.id)}
                                                    >
                                                        <Check className={cn('mr-2 h-4 w-4', String(currentSchoolId) === String(escola.id) ? 'opacity-100' : 'opacity-0')} />
                                                        {escola.escolar}
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        )
                                    }
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                </div>
                {currentSchool && (
                    <div className="hidden lg:flex items-center gap-x-4 gap-y-1 text-xs text-muted-foreground border-l pl-4 flex-wrap">
                        <span>INEP: <span className="font-semibold text-foreground">{currentSchool.inep || 'N/A'}</span></span>
                        <span>Regional: <span className="font-semibold text-foreground">{currentSchool.regional || 'N/A'}</span></span>
                        <span>Município: <span className="font-semibold text-foreground">{currentSchool.cidade || 'N/A'}</span></span>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="flex items-center gap-4 p-2">
            <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium text-sm text-foreground truncate uppercase">{currentSchoolName}</span>
            </div>
            {currentSchool && (
                <div className="hidden lg:flex items-center gap-x-4 gap-y-1 text-xs text-muted-foreground border-l pl-4 flex-wrap">
                    <span>INEP: <span className="font-semibold text-foreground">{currentSchool.inep || 'N/A'}</span></span>
                    <span>Regional: <span className="font-semibold text-foreground">{currentSchool.regional || 'N/A'}</span></span>
                    <span>Município: <span className="font-semibold text-foreground">{currentSchool.cidade || 'N/A'}</span></span>
                </div>
            )}
        </div>
    );
}
