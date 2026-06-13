
import { createClient } from '@/lib/supabase/server';
import { getTurnosAtivos } from '../actions';
import { ConflitosClient } from './conflitos-client';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

export default async function ConflitosPage({
    searchParams,
}: {
    searchParams: Promise<{ turno?: string }>;
}) {
    const params = await searchParams;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Usuário não encontrado</CardTitle>
                </CardHeader>
            </Card>
        );
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('ue')
        .eq('id', user.id)
        .single();

    const escolaId = profile?.ue;

    if (!escolaId) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <AlertTriangle /> Nenhuma escola selecionada
                    </CardTitle>
                    <CardDescription>Selecione uma escola no menu superior.</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    const { data: turnosAtivos } = await getTurnosAtivos(escolaId);
    const initialTurnoId = params.turno || 'todos';

    return (
        <div className="space-y-6">
            <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight">Gerenciamento de Conflitos</h1>
                <p className="text-sm text-muted-foreground">
                    Analise os conflitos existentes entre os horários gerados para detectar professores alocados em dois horários ao mesmo tempo.
                </p>
            </div>
            <ConflitosClient
                escolaId={escolaId}
                turnosAtivos={turnosAtivos || []}
                initialTurnoId={initialTurnoId}
            />
        </div>
    );
}
