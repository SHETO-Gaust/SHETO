'use client';

import { useState, useEffect, useMemo, useTransition } from 'react';
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
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Edit, UserPlus, UserX, UserCheck, Loader2, MoreHorizontal, Trash2, Search, FileSpreadsheet, FilterX } from 'lucide-react';
import { EditUserPermissionsSheet } from './edit-permissions-sheet';
import { CreateUserSheet } from './create-user-sheet';
import { ImportUsersDialog } from './import-users-dialog';
import { toggleUserStatus, deleteUser, getUsers } from './actions';
import { useToast } from '@/hooks/use-toast';
import { normalizar } from '@/lib/usuarios-lote';

const TODOS = '_todos';
const SEM_REGIONAL = '_sem';

/** Regional exibida: a gravada no perfil, ou a da escola para perfis antigos. */
function regionalDe(user: Profile) {
    return user.regional || user.escolas?.regional || null;
}

export function UsersClient({ initialUsers, allEscolas, currentUserId }: { initialUsers: Profile[], allEscolas: Escola[], currentUserId?: string | null }) {
    const [users, setUsers] = useState(initialUsers);
    const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
    const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);
    const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
    const [isImportOpen, setIsImportOpen] = useState(false);
    const [userToDelete, setUserToDelete] = useState<Profile | null>(null);
    const [pendingUserId, setPendingUserId] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();

    const [busca, setBusca] = useState('');
    const [filtroRegional, setFiltroRegional] = useState(TODOS);
    const [filtroFuncao, setFiltroFuncao] = useState(TODOS);
    const [filtroStatus, setFiltroStatus] = useState(TODOS);

    useEffect(() => {
        setUsers(initialUsers);
    }, [initialUsers]);

    const regionais = useMemo(() => {
        const todas = new Set<string>();
        allEscolas.forEach(e => e.regional && todas.add(e.regional));
        users.forEach(u => { const r = regionalDe(u); if (r) todas.add(r); });
        return [...todas].sort((a, b) => a.localeCompare(b));
    }, [allEscolas, users]);

    const usuariosFiltrados = useMemo(() => {
        const termo = normalizar(busca);
        return users.filter(user => {
            const regional = regionalDe(user);
            if (filtroRegional === SEM_REGIONAL ? !!regional : filtroRegional !== TODOS && regional !== filtroRegional) return false;
            if (filtroFuncao !== TODOS && (user.role || 'user') !== filtroFuncao) return false;
            if (filtroStatus !== TODOS && (filtroStatus === 'ativo') !== user.active) return false;
            if (!termo) return true;
            return [user.name, user.email, regional, user.escolas?.escolar]
                .some(campo => normalizar(campo).includes(termo));
        });
    }, [users, busca, filtroRegional, filtroFuncao, filtroStatus]);

    const filtrosAtivos = !!busca || filtroRegional !== TODOS || filtroFuncao !== TODOS || filtroStatus !== TODOS;
    const limparFiltros = () => {
        setBusca('');
        setFiltroRegional(TODOS);
        setFiltroFuncao(TODOS);
        setFiltroStatus(TODOS);
    };

    const handleEditClick = (user: Profile) => {
        setSelectedUser(user);
        setIsEditSheetOpen(true);
    };

    const refreshList = async () => {
        const updatedUsers = await getUsers();
        setUsers(updatedUsers);
    };

    const handleToggleStatus = (user: Profile) => {
        setPendingUserId(user.id);
        startTransition(async () => {
            const result = await toggleUserStatus(user.id, user.active);
            setPendingUserId(null);
            if (result.error) {
                toast({ title: 'Erro', description: result.error, variant: 'destructive' });
            } else {
                toast({ title: user.active ? 'Usuário Suspenso' : 'Usuário Reativado' });
                setUsers(prev => prev.map(u => u.id === user.id ? { ...u, active: !user.active } : u));
            }
        });
    };

    const handleDelete = () => {
        const user = userToDelete;
        if (!user) return;
        setPendingUserId(user.id);
        startTransition(async () => {
            const result = await deleteUser(user.id);
            setPendingUserId(null);
            setUserToDelete(null);
            if (result.error) {
                toast({ title: 'Erro ao excluir', description: result.error, variant: 'destructive' });
            } else {
                toast({ title: 'Usuário excluído', description: `${user.name || user.email} foi removido do sistema.` });
                setUsers(prev => prev.filter(u => u.id !== user.id));
            }
        });
    };

    return (
        <>
            <div className="mb-4 flex flex-col gap-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="relative w-full sm:max-w-sm">
                        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={busca}
                            onChange={(e) => setBusca(e.target.value)}
                            placeholder="Buscar por nome, regional ou escola..."
                            className="pl-8"
                        />
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => setIsImportOpen(true)}>
                            <FileSpreadsheet className="mr-2 h-4 w-4" />
                            Cadastro em Lote
                        </Button>
                        <Button onClick={() => setIsCreateSheetOpen(true)}>
                            <UserPlus className="mr-2 h-4 w-4" />
                            Criar Usuário
                        </Button>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Select value={filtroRegional} onValueChange={setFiltroRegional}>
                        <SelectTrigger className="h-9 w-[220px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={TODOS}>Todas as regionais</SelectItem>
                            <SelectItem value={SEM_REGIONAL}>Sem regional</SelectItem>
                            {regionais.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Select value={filtroFuncao} onValueChange={setFiltroFuncao}>
                        <SelectTrigger className="h-9 w-[170px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={TODOS}>Todas as funções</SelectItem>
                            <SelectItem value="admin">Administrador</SelectItem>
                            <SelectItem value="user">Usuário</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                        <SelectTrigger className="h-9 w-[150px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={TODOS}>Todos os status</SelectItem>
                            <SelectItem value="ativo">Ativos</SelectItem>
                            <SelectItem value="suspenso">Suspensos</SelectItem>
                        </SelectContent>
                    </Select>
                    {filtrosAtivos && (
                        <Button variant="ghost" size="sm" onClick={limparFiltros}>
                            <FilterX className="mr-1 h-4 w-4" />
                            Limpar filtros
                        </Button>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">
                        {usuariosFiltrados.length} de {users.length} usuário(s)
                    </span>
                </div>
            </div>

            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Nome</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Função</TableHead>
                            <TableHead>Regional</TableHead>
                            <TableHead>Escola</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="w-[60px] text-right"><span className="sr-only">Ações</span></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {usuariosFiltrados.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                                    {users.length === 0 ? 'Nenhum usuário cadastrado.' : 'Nenhum usuário corresponde à busca.'}
                                </TableCell>
                            </TableRow>
                        )}
                        {usuariosFiltrados.map((user) => {
                            const ehVoceMesmo = user.id === currentUserId;
                            const carregando = isPending && pendingUserId === user.id;
                            return (
                            <TableRow key={user.id} className={!user.active ? 'opacity-60 bg-muted/20' : ''}>
                                <TableCell className="font-medium">{user.name || '-'}</TableCell>
                                <TableCell>{user.email}</TableCell>
                                <TableCell>
                                    <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                                        {user.role}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-xs uppercase font-medium">{regionalDe(user) || '—'}</TableCell>
                                <TableCell className="text-xs uppercase font-medium">{user.escolas?.escolar || 'N/A'}</TableCell>
                                <TableCell>
                                    <Badge variant={user.active ? 'outline' : 'destructive'} className={user.active ? 'text-green-600 border-green-200 bg-green-50 dark:text-green-400 dark:border-green-800 dark:bg-green-950/30' : ''}>
                                        {user.active ? 'Ativo' : 'Suspenso'}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={carregando}>
                                                {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                                                <span className="sr-only">Ações de {user.name || user.email}</span>
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuLabel className="max-w-[220px] truncate">{user.name || user.email}</DropdownMenuLabel>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem onSelect={() => handleEditClick(user)}>
                                                <Edit className="mr-2 h-4 w-4" />
                                                Permissões
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                onSelect={() => handleToggleStatus(user)}
                                                disabled={ehVoceMesmo}
                                                className={user.active ? '' : 'text-green-600 focus:text-green-600'}
                                            >
                                                {user.active ? <UserX className="mr-2 h-4 w-4" /> : <UserCheck className="mr-2 h-4 w-4" />}
                                                {user.active ? 'Suspender' : 'Ativar'}
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                                onSelect={() => setUserToDelete(user)}
                                                disabled={ehVoceMesmo}
                                                className="text-destructive focus:text-destructive"
                                            >
                                                <Trash2 className="mr-2 h-4 w-4" />
                                                Excluir usuário
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>

            <AlertDialog open={!!userToDelete} onOpenChange={(open) => { if (!open && !isPending) setUserToDelete(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
                        <AlertDialogDescription>
                            A conta de <span className="font-semibold text-foreground">{userToDelete?.name || userToDelete?.email}</span> será
                            removida de forma permanente e a pessoa perde o acesso ao sistema. Os horários e cadastros da escola não são afetados.
                            Para bloquear o acesso sem apagar a conta, use <strong>Suspender</strong>.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => { e.preventDefault(); handleDelete(); }}
                            disabled={isPending}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Excluir
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {selectedUser && (
                <EditUserPermissionsSheet
                    isOpen={isEditSheetOpen}
                    setIsOpen={setIsEditSheetOpen}
                    user={selectedUser}
                    onUserUpdate={refreshList}
                    allEscolas={allEscolas}
                />
            )}
             <CreateUserSheet
                isOpen={isCreateSheetOpen}
                setIsOpen={setIsCreateSheetOpen}
                allEscolas={allEscolas}
                onUserCreated={refreshList}
            />
            <ImportUsersDialog
                isOpen={isImportOpen}
                setIsOpen={setIsImportOpen}
                regionais={regionais}
                onImported={refreshList}
            />
        </>
    );
}
