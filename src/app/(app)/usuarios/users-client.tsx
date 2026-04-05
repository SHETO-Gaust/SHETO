
'use client';

import { useState, useEffect, useTransition } from 'react';
import type { Profile, Escola } from '@/lib/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Edit, UserPlus, UserX, UserCheck, Loader2 } from 'lucide-react';
import { EditUserPermissionsSheet } from './edit-permissions-sheet';
import { CreateUserSheet } from './create-user-sheet';
import { toggleUserStatus, getUsers } from './actions';
import { useToast } from '@/hooks/use-toast';

const allModules = [
  { id: 'dashboard', label: 'Painel', description: 'Acesso padrão ao painel inicial.' },
  { id: 'dados-horario', label: 'Dados do Horário', description: 'Permite gerenciar Turnos, Ensino, Disciplinas, Professores, Séries e Turmas.' },
  { id: 'horarios', label: 'Horários', description: 'Permite gerar horários e visualizar relatórios.' },
  { id: 'usuarios', label: 'Gestão de Usuários', description: 'Permite gerenciar usuários e suas permissões.' },
];


export function UsersClient({ initialUsers, allEscolas }: { initialUsers: Profile[], allEscolas: Escola[] }) {
    const [users, setUsers] = useState(initialUsers);
    const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
    const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);
    const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();

    useEffect(() => {
        setUsers(initialUsers);
    }, [initialUsers]);
    
    const handleEditClick = (user: Profile) => {
        setSelectedUser(user);
        setIsEditSheetOpen(true);
    };

    const refreshList = async () => {
        const updatedUsers = await getUsers();
        setUsers(updatedUsers);
    };

    const handleToggleStatus = (user: Profile) => {
        startTransition(async () => {
            const result = await toggleUserStatus(user.id, user.active);
            if (result.error) {
                toast({ title: 'Erro', description: result.error, variant: 'destructive' });
            } else {
                toast({ title: user.active ? 'Usuário Suspenso' : 'Usuário Reativado' });
                setUsers(prev => prev.map(u => u.id === user.id ? { ...u, active: !user.active } : u));
            }
        });
    };

    return (
        <>
            <div className="flex justify-end mb-4">
                <Button onClick={() => setIsCreateSheetOpen(true)}>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Criar Usuário
                </Button>
            </div>
            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Nome</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Função</TableHead>
                            <TableHead>Escola</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {users.map((user) => (
                            <TableRow key={user.id} className={!user.active ? 'opacity-60 bg-muted/20' : ''}>
                                <TableCell className="font-medium">{user.name || '-'}</TableCell>
                                <TableCell>{user.email}</TableCell>
                                <TableCell>
                                    <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                                        {user.role}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-xs uppercase font-medium">{user.escolas?.escolar || 'N/A'}</TableCell>
                                <TableCell>
                                    <Badge variant={user.active ? 'outline' : 'destructive'} className={user.active ? 'text-green-600 border-green-200 bg-green-50' : ''}>
                                        {user.active ? 'Ativo' : 'Suspenso'}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            onClick={() => handleToggleStatus(user)}
                                            disabled={isPending}
                                            className={user.active ? 'text-destructive hover:text-destructive' : 'text-green-600 hover:text-green-600'}
                                        >
                                            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : user.active ? <UserX className="h-4 w-4 mr-1" /> : <UserCheck className="h-4 w-4 mr-1" />}
                                            {user.active ? 'Suspender' : 'Ativar'}
                                        </Button>
                                        <Button variant="outline" size="sm" onClick={() => handleEditClick(user)}>
                                            <Edit className="mr-2 h-4 w-4" />
                                            Permissões
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
            {selectedUser && (
                <EditUserPermissionsSheet
                    isOpen={isEditSheetOpen}
                    setIsOpen={setIsEditSheetOpen}
                    user={selectedUser}
                    allModules={allModules}
                    onUserUpdate={refreshList}
                    allEscolas={allEscolas}
                />
            )}
             <CreateUserSheet
                isOpen={isCreateSheetOpen}
                setIsOpen={setIsCreateSheetOpen}
                allModules={allModules}
                allEscolas={allEscolas}
                onUserCreated={refreshList}
            />
        </>
    );
}
