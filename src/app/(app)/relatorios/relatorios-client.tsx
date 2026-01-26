'use client';

import { useState } from 'react';
import type { Formacao } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { RelatorioCard } from '@/components/relatorios/relatorio-card';
import { Skeleton } from '@/components/ui/skeleton';

type RelatoriosClientProps = {
    allFormacoes: Pick<Formacao, 'id' | 'name'>[];
};

export function RelatoriosClient({ allFormacoes }: RelatoriosClientProps) {
    const [open, setOpen] = useState(false);
    const [selectedFormacoes, setSelectedFormacoes] = useState<Pick<Formacao, 'id' | 'name'>[]>([]);
    const [loading, setLoading] = useState(false);
    const [formacoesToDisplay, setFormacoesToDisplay] = useState<Pick<Formacao, 'id' | 'name'>[]>([]);

    const handleGenerate = async () => {
        setLoading(true);
        setFormacoesToDisplay([]); // Clear previous results
        // This is a "lazy" component, but the data fetching is inside RelatorioCard.
        // So we can just set the state here. The "loading" state is more of a UX thing.
        await new Promise(resolve => setTimeout(resolve, 300)); // Simulate loading for better UX
        setFormacoesToDisplay(selectedFormacoes);
        setLoading(false);
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardContent className="pt-6 flex flex-col md:flex-row items-center gap-4">
                    <div className="w-full md:w-auto md:flex-1">
                        <Popover open={open} onOpenChange={setOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    role="combobox"
                                    aria-expanded={open}
                                    className="w-full justify-between"
                                >
                                    <span className="truncate">
                                        {selectedFormacoes.length > 0 ? `${selectedFormacoes.length} formação(ões) selecionada(s)` : "Selecione as formações..."}
                                    </span>
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                                <Command>
                                    <CommandInput placeholder="Buscar formação..." />
                                    <CommandList>
                                        <CommandEmpty>Nenhuma formação encontrada.</CommandEmpty>
                                        <CommandGroup>
                                            {allFormacoes.map((formacao) => (
                                                <CommandItem
                                                    key={formacao.id}
                                                    onSelect={() => {
                                                        const isSelected = selectedFormacoes.some(sf => sf.id === formacao.id);
                                                        if (isSelected) {
                                                            setSelectedFormacoes(selectedFormacoes.filter(sf => sf.id !== formacao.id));
                                                        } else {
                                                            setSelectedFormacoes([...selectedFormacoes, formacao]);
                                                        }
                                                    }}
                                                >
                                                    <Check className={cn("mr-2 h-4 w-4", selectedFormacoes.some(sf => sf.id === formacao.id) ? "opacity-100" : "opacity-0")} />
                                                    {formacao.name}
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                         <div className="pt-2 flex flex-wrap gap-1">
                            {selectedFormacoes.map(f => (
                                <Badge key={f.id} variant="secondary" className="truncate">{f.name}</Badge>
                            ))}
                        </div>
                    </div>
                    <Button onClick={handleGenerate} disabled={loading || selectedFormacoes.length === 0} className="w-full md:w-auto">
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Gerar Relatórios
                    </Button>
                </CardContent>
            </Card>
            
            {loading && (
                 <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
                    <Skeleton className="h-96 w-full rounded-xl" />
                    <Skeleton className="h-96 w-full rounded-xl" />
                 </div>
            )}

            {!loading && formacoesToDisplay.length > 0 && (
                 <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
                    {formacoesToDisplay.map((formacao) => (
                        <RelatorioCard key={formacao.id} formacaoId={formacao.id} />
                    ))}
                </div>
            )}
        </div>
    );
}
