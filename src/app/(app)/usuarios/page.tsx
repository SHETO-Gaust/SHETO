import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getUsers } from './actions';
import { UsersClient } from './users-client';

export default async function UsuariosPage() {
    const users = await getUsers();

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
                    <UsersClient initialUsers={users} />
                 </CardContent>
            </Card>
        </div>
    );
}
