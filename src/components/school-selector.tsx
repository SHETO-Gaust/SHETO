
'use client';

import { useState, useTransition, useEffect } from 'react';
import type { Profile, Escola } from '@/lib/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

type SchoolSelectorProps = {
    userProfile: Profile;
    allEscolas: Escola[];
};

export function SchoolSelector({ userProfile, allEscolas }: SchoolSelectorProps) {
    const { toast } = useToast();
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const [currentSchoolId, setCurrentSchoolId] = useState(userProfile.ue || '');
    
    const handleSchoolChange = async (newSchoolId: string) => {
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
            toast({
                title: 'Contexto da escola alterado!',
            });
        }
    };
    
    if (!mounted) return null;

    const currentSchool = allEscolas.find(s => s.id === (currentSchoolId === 'null' ? null : currentSchoolId));
    const currentSchoolName = currentSchool?.escolar || 'Nenhuma escola selecionada';

    if (userProfile.role === 'admin') {
        return (
            <div className="flex items-center gap-4 w-full">
                <div className="flex items-center gap-2 max-w-xs shrink-0">
                    {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Building2 className="h-5 w-5 text-muted-foreground" />}
                    <Select value={currentSchoolId || 'null'} onValueChange={handleSchoolChange} disabled={isPending}>
                        <SelectTrigger className="w-full border-none bg-transparent shadow-none focus:ring-0 truncate">
                            <SelectValue placeholder="Selecione uma escola..." />
                        </SelectTrigger>
                        <SelectContent>
                             <SelectItem value="null">Visualização Geral (Admin)</SelectItem>
                            {allEscolas.map(escola => (
                                <SelectItem key={escola.id} value={escola.id}>
                                    {escola.escolar}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
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
