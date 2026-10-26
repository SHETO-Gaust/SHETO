import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getUsers } from './actions';
import { UsersClient } from './users-client';
import { createClient } from "@/lib/db/server";
import type { Escola } from "@/lib/types";

export default async function UsuariosPage() {
    const users = await getUsers();
    
    const db = await createClient();
    const { data: allEscolasData } = await db
        .from('escolas')
        .select('*')
        .order('escolar', { ascending: true });
    const allEscolas = allEscolasData as Escola[] || [];
    // Para a lista nao oferecer "Excluir"/"Suspender" na propria conta.
    const { data: { user: currentUser } } = await db.auth.getUser();


    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Gestão de Usuários</CardTitle>
                    <CardDescription>
                    Gerencie os usuários e suas permissões de acesso ao sistema.
                    </CardDescription>
                </CardHeader>
            </Card>
            <Card>
                 <CardContent className="pt-6">
                    <UsersClient initialUsers={users} allEscolas={allEscolas} currentUserId={currentUser?.id ?? null} />
                 </CardContent>
            </Card>
        </div>
    );
}
