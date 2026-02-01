'use client';

import { useState, useEffect } from 'react';
import type { Profile, Escola } from '@/lib/types';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { updateUserPermissions } from './actions';
import { Loader2 } from 'lucide-react';

type Module = {
    id: string;
    label: string;
}

type EditUserPermissionsSheetProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  user: Profile;
  allModules: Module[];
  onUserUpdate: (updatedUser: Profile) => void;
  allEscolas: Pick<Escola, 'id' | 'escolar'>[];
};

export function EditUserPermissionsSheet({ isOpen, setIsOpen, user, allModules, onUserUpdate, allEscolas }: EditUserPermissionsSheetProps) {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [selectedModules, setSelectedModules] = useState<string[]>([]);
    const [selectedRole, setSelectedRole] = useState<'admin' | 'user'>('user');
    const [selectedSchool, setSelectedSchool] = useState<string | null | undefined>(null);

    useEffect(() => {
        if (user) {
            setSelectedModules(user.modules || []);
            setSelectedRole(user.role || 'user');
            setSelectedSchool(user.ue);
        }
    }, [user]);

    const handleModuleToggle = (moduleId: string) => {
        setSelectedModules(prev =>
            prev.includes(moduleId) ? prev.filter(m => m !== moduleId) : [...prev, moduleId]
        );
    };

    const handleSave = async () => {
        setLoading(true);
        const result = await updateUserPermissions(user.id, selectedModules, selectedRole, selectedSchool);
        setLoading(false);

        if (result.error) {
            toast({
                title: 'Erro ao atualizar permissões',
                description: result.error,
                variant: 'destructive',
            });
        } else {
            toast({
                title: 'Permissões Atualizadas!',
                description: `As permissões de ${user.name || user.email} foram salvas.`,
            });
            onUserUpdate({ ...user, modules: selectedModules, role: selectedRole, ue: selectedSchool });
            setIsOpen(false);
        }
    };
    
    const isAdmin = selectedRole === 'admin';

    return (
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetContent className="sm:max-w-lg flex flex-col">
                <SheetHeader>
                    <SheetTitle>Gerenciar Permissões</SheetTitle>
                    <SheetDescription>
                        Defina a função e os módulos que <span className="font-semibold text-foreground">{user.name || user.email}</span> pode acessar.
                    </SheetDescription>
                </SheetHeader>

                <div className="flex-1 space-y-6 overflow-y-auto p-1">
                    <div className="space-y-2">
                        <Label htmlFor="role-select">Função</Label>
                        <Select value={selectedRole} onValueChange={(value: 'admin' | 'user') => setSelectedRole(value)}>
                            <SelectTrigger id="role-select">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="user">Usuário</SelectItem>
                                <SelectItem value="admin">Administrador</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">Administradores têm acesso a todos os módulos.</p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="school-select">Escola Vinculada</Label>
                         <Select value={selectedSchool || ''} onValueChange={(value) => setSelectedSchool(value === 'null' ? null : value)} disabled={isAdmin}>
                            <SelectTrigger id="school-select">
                                <SelectValue placeholder="Selecione uma escola" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="null">Nenhuma</SelectItem>
                                {allEscolas.map(escola => (
                                    <SelectItem key={escola.id} value={escola.id}>{escola.escolar}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">Vincule o usuário a uma unidade escolar.</p>
                    </div>

                    <div className="space-y-2">
                        <h4 className="font-medium">Módulos Acessíveis</h4>
                        <div className="space-y-3 rounded-md border p-4">
                            {allModules.map(module => (
                                <div key={module.id} className="flex items-center space-x-2">
                                    <Checkbox
                                        id={module.id}
                                        checked={isAdmin || selectedModules.includes(module.id)}
                                        onCheckedChange={() => handleModuleToggle(module.id)}
                                        disabled={isAdmin || module.id === 'dashboard'}
                                    />
                                    <Label htmlFor={module.id} className="font-normal leading-snug">
                                        {module.label}
                                        {module.id === 'dashboard' && <span className="text-muted-foreground text-xs"> (acesso padrão)</span>}
                                    </Label>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <SheetFooter className="mt-auto border-t pt-4">
                    <Button variant="outline" onClick={() => setIsOpen(false)}>Cancelar</Button>
                    <Button onClick={handleSave} disabled={loading}>
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Salvar Alterações
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
