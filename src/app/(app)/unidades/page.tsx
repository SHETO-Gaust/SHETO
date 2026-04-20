import { getEscolas } from './actions';
import { UnidadesClient } from './unidades-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export const metadata = {
    title: 'Unidades — SHE',
};

export default async function UnidadesPage() {
    const escolas = await getEscolas();

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Gestão de Unidades Escolares</CardTitle>
                    <CardDescription>
                        Gerencie as unidades escolares cadastradas no sistema. Acesso restrito aos responsáveis pela Gestão do Sistema.
                    </CardDescription>
                </CardHeader>
            </Card>
            <Card>
                <CardContent className="pt-6">
                    <UnidadesClient initialEscolas={escolas} />
                </CardContent>
            </Card>
        </div>
    );
}
