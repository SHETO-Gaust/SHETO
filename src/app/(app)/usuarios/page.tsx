import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getUsers } from './actions';
import { UsersClient } from './users-client';
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import type { Escola } from "@/lib/types";

export default async function UsuariosPage() {
    const users = await getUsers();
    
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);
    const { data: allEscolasData } = await supabase
        .from('escolas')
        .select('*')
        .order('escolar', { ascending: true });
    const allEscolas = allEscolasData as Escola[] || [];


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
                    <UsersClient initialUsers={users} allEscolas={allEscolas} />
                 </CardContent>
            </Card>
        </div>
    );
}
