'use client';

import { useState, useTransition } from 'react';
import type { Profile, Escola } from '@/lib/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

type SchoolSelectorProps = {
    userProfile: Profile;
    allEscolas: Pick<Escola, 'id' | 'escolar'>[];
};

export function SchoolSelector({ userProfile, allEscolas }: SchoolSelectorProps) {
    const { toast } = useToast();
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    // The currently active school. Defaults to user's own school from the server.
    const [currentSchoolId, setCurrentSchoolId] = useState(userProfile.ue || '');
    
    // When an admin selects a new school from the dropdown.
    const handleSchoolChange = async (newSchoolId: string) => {
        const supabase = createClient();
        const { error } = await supabase
            .from('profiles')
            .update({ ue: newSchoolId === 'null' ? null : newSchoolId })
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
    
    const currentSchoolName = allEscolas.find(s => s.id === currentSchoolId)?.escolar || userProfile.escolas?.escolar || 'Nenhuma escola selecionada';

    // If user is an admin, show a dropdown to switch schools.
    if (userProfile.role === 'admin') {
        return (
            <div className="flex items-center gap-2 max-w-sm">
                {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Building2 className="h-5 w-5 text-muted-foreground" />}
                <Select value={currentSchoolId} onValueChange={handleSchoolChange} disabled={isPending}>
                    <SelectTrigger className="w-auto border-none bg-transparent shadow-none focus:ring-0 truncate">
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
        );
    }
    
    // For non-admins, just display their associated school.
    return (
        <div className="flex items-center gap-2 p-2">
            <Building2 className="h-5 w-5 text-muted-foreground" />
            <span className="font-medium text-sm text-foreground truncate">{currentSchoolName}</span>
        </div>
    );
}
