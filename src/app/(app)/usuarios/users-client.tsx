'use client';

import { useState, useEffect } from 'react';
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
import { Edit, UserPlus } from 'lucide-react';
import { EditUserPermissionsSheet } from './edit-permissions-sheet';
import { CreateUserSheet } from './create-user-sheet';

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

    useEffect(() => {
        setUsers(initialUsers);
    }, [initialUsers]);
    
    const handleEditClick = (user: Profile) => {
        setSelectedUser(user);
        setIsEditSheetOpen(true);
    };

    const handleUpdate = (updatedUser: Profile) => {
        setUsers(prevUsers => prevUsers.map(u => u.id === updatedUser.id ? updatedUser : u));
    }

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
                            <TableHead>Módulos</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {users.map((user) => (
                            <TableRow key={user.id}>
                                <TableCell className="font-medium">{user.name || '-'}</TableCell>
                                <TableCell>{user.email}</TableCell>
                                <TableCell>
                                    <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                                        {user.role}
                                    </Badge>
                                </TableCell>
                                <TableCell>{user.escolas?.escolar || 'N/A'}</TableCell>
                                <TableCell className="max-w-xs">
                                   <div className="flex flex-wrap gap-1">
                                    {user.role === 'admin' ? (
                                        <Badge>Acesso Total</Badge>
                                    ) : (
                                        user.modules?.map(mod => {
                                            const moduleLabel = allModules.find(m => m.id === mod)?.label || mod;
                                            return <Badge key={mod} variant="outline">{moduleLabel}</Badge>
                                        }) || <span className="text-xs text-muted-foreground">Nenhum</span>
                                    )}
                                   </div>
                                </TableCell>
                                <TableCell className="text-right">
                                    <Button variant="outline" size="sm" onClick={() => handleEditClick(user)}>
                                        <Edit className="mr-2 h-4 w-4" />
                                        Gerenciar
                                    </Button>
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
                    onUserUpdate={handleUpdate}
                    allEscolas={allEscolas}
                />
            )}
             <CreateUserSheet
                isOpen={isCreateSheetOpen}
                setIsOpen={setIsCreateSheetOpen}
                allModules={allModules}
                allEscolas={allEscolas}
            />
        </>
    );
}
