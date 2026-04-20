'use client';

import { useState, useTransition } from 'react';
import type { EscolaCompleta, EscolaInput } from './actions';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { PlusCircle, Pencil, Trash2, Loader2, Search, Building2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { deleteEscola, getEscolas } from './actions';
import { EscolaFormSheet } from './escola-form-sheet';
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

export function UnidadesClient({ initialEscolas }: { initialEscolas: EscolaCompleta[] }) {
    const { toast } = useToast();
    const [escolas, setEscolas] = useState<EscolaCompleta[]>(initialEscolas);
    const [filtro, setFiltro] = useState('');
    const [sheetOpen, setSheetOpen] = useState(false);
    const [escolaEditando, setEscolaEditando] = useState<EscolaCompleta | null>(null);
    const [escolaParaExcluir, setEscolaParaExcluir] = useState<EscolaCompleta | null>(null);
    const [isPending, startTransition] = useTransition();

    const refreshList = async () => {
        const updated = await getEscolas();
        setEscolas(updated);
    };

    const handleNova = () => {
        setEscolaEditando(null);
        setSheetOpen(true);
    };

    const handleEditar = (escola: EscolaCompleta) => {
        setEscolaEditando(escola);
        setSheetOpen(true);
    };

    const handleExcluirConfirm = () => {
        if (!escolaParaExcluir) return;
        startTransition(async () => {
            const result = await deleteEscola(escolaParaExcluir.id);
            setEscolaParaExcluir(null);
            if (result.error) {
                toast({ variant: 'destructive', title: 'Erro ao excluir', description: result.error });
            } else {
                toast({ title: 'Unidade excluída', description: `"${escolaParaExcluir.escolar}" foi removida.` });
                setEscolas(prev => prev.filter(e => e.id !== escolaParaExcluir.id));
            }
        });
    };

    // Filtro por texto livre (escolar, cidade, regional, inep)
    const escolasFiltradas = escolas.filter(e => {
        if (!filtro.trim()) return true;
        const q = filtro.toLowerCase();
        return (
            e.escolar?.toLowerCase().includes(q) ||
            e.cidade?.toLowerCase().includes(q) ||
            e.regional?.toLowerCase().includes(q) ||
            e.inep?.toLowerCase().includes(q)
        );
    });

    return (
        <>
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <div className="flex items-center gap-2 flex-1 max-w-sm">
                    <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                    <Input
                        placeholder="Buscar por escola, cidade, regional ou INEP..."
                        value={filtro}
                        onChange={e => setFiltro(e.target.value)}
                        className="h-9"
                    />
                </div>
                <Button onClick={handleNova} size="sm">
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Nova Unidade
                </Button>
            </div>

            {/* Contador */}
            <p className="text-xs text-muted-foreground mb-3">
                {escolasFiltradas.length} {escolasFiltradas.length === 1 ? 'unidade encontrada' : 'unidades encontradas'}
                {filtro && ` para "${filtro}"`}
            </p>

            {/* Tabela */}
            <div className="rounded-md border overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/40">
                            <TableHead className="w-[60px]">ID</TableHead>
                            <TableHead>Escola / Unidade</TableHead>
                            <TableHead>INEP</TableHead>
                            <TableHead>Regional</TableHead>
                            <TableHead>Cidade</TableHead>
                            <TableHead>Classificação</TableHead>
                            <TableHead>LOC</TableHead>
                            <TableHead className="text-right w-[120px]">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {escolasFiltradas.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={8} className="text-center py-16 text-muted-foreground">
                                    <div className="flex flex-col items-center gap-2">
                                        <Building2 className="h-10 w-10 opacity-20" />
                                        <span className="text-sm">
                                            {filtro ? 'Nenhuma unidade encontrada para este filtro.' : 'Nenhuma unidade cadastrada ainda.'}
                                        </span>
                                        {!filtro && (
                                            <Button variant="outline" size="sm" onClick={handleNova} className="mt-2">
                                                <PlusCircle className="mr-2 h-4 w-4" /> Cadastrar primeira unidade
                                            </Button>
                                        )}
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : (
                            escolasFiltradas.map(e => (
                                <TableRow key={e.id} className="hover:bg-muted/20 transition-colors">
                                    <TableCell className="text-muted-foreground text-xs font-mono">{e.id}</TableCell>
                                    <TableCell className="font-medium max-w-[260px]">
                                        <div className="truncate" title={e.escolar ?? undefined}>{e.escolar || '—'}</div>
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">{e.inep || '—'}</TableCell>
                                    <TableCell className="text-xs">{e.regional || '—'}</TableCell>
                                    <TableCell className="text-xs">{e.cidade || '—'}</TableCell>
                                    <TableCell>
                                        {e.classificacao ? (
                                            <Badge variant="secondary" className="text-[10px] font-normal">
                                                {e.classificacao}
                                            </Badge>
                                        ) : '—'}
                                    </TableCell>
                                    <TableCell className="text-xs">{e.loc || '—'}</TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                                onClick={() => handleEditar(e)}
                                                title="Editar"
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                                onClick={() => setEscolaParaExcluir(e)}
                                                title="Excluir"
                                                disabled={isPending}
                                            >
                                                {isPending && escolaParaExcluir?.id === e.id
                                                    ? <Loader2 className="h-4 w-4 animate-spin" />
                                                    : <Trash2 className="h-4 w-4" />
                                                }
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Sheet de criação / edição */}
            <EscolaFormSheet
                isOpen={sheetOpen}
                onClose={() => setSheetOpen(false)}
                escolaEditando={escolaEditando}
                onSaved={async () => {
                    setSheetOpen(false);
                    await refreshList();
                }}
            />

            {/* Dialog de confirmação de exclusão */}
            <AlertDialog open={!!escolaParaExcluir} onOpenChange={open => { if (!open) setEscolaParaExcluir(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                        <AlertDialogDescription>
                            Você está prestes a excluir a unidade{' '}
                            <strong>"{escolaParaExcluir?.escolar}"</strong>.
                            Esta ação não pode ser desfeita.
                            Usuários vinculados a esta unidade perderão o vínculo.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={handleExcluirConfirm}
                            disabled={isPending}
                        >
                            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Excluir
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
