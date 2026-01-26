'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Formacao, Inscricao, Formador } from '@/lib/types';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { GerenciamentoCard } from '@/components/gerenciamento/gerenciamento-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { isPast, isToday } from 'date-fns';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff } from 'lucide-react';

const isConcluida = (formacao: Formacao): boolean => {
    const { dates } = formacao;
    if (!dates || !Array.isArray(dates) || dates.length === 0) {
        return false;
    }
    const allPast = dates.every((d: any) => isPast(new Date(d.date)) && !isToday(new Date(d.date)));
    return allPast;
}

export default function GerenciamentoPage() {
  const [formacoes, setFormacoes] = useState<Formacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPast, setShowPast] = useState(false);
  const [dataCache, setDataCache] = useState<{[formacaoId: string]: {inscricoes: Inscricao[], formadores: Formador[]}}>({});
  const [loadingItems, setLoadingItems] = useState<Set<string>>(new Set());

  const fetchFormacoes = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data: formacoesData, error: formacoesError } = await supabase
      .from('formacoes')
      .select('*')
      .order('created_at', { ascending: false });

    if (formacoesError) {
      console.error('Error fetching formacoes:', formacoesError);
      setFormacoes([]);
    } else {
      setFormacoes(formacoesData || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchFormacoes();
  }, [fetchFormacoes]);

  const { activeFormacoes, pastFormacoes } = useMemo(() => {
    const active = formacoes.filter(f => !isConcluida(f));
    const past = formacoes.filter(f => isConcluida(f));
    return { activeFormacoes: active, pastFormacoes: past };
  }, [formacoes]);

  const handleAccordionChange = async (value: string[]) => {
    const openedId = value.find(id => !dataCache[id] && !loadingItems.has(id));
    if (!openedId) return;

    setLoadingItems(prev => new Set(prev).add(openedId));

    const supabase = createClient();
    const inscricoesPromise = supabase.from('inscricoes').select('*').eq('formacao_id', openedId).limit(10000);
    const formadoresPromise = supabase.from('formadores').select('*').eq('formacao_id', openedId);

    const [inscricoesResult, formadoresResult] = await Promise.all([inscricoesPromise, formadoresPromise]);
    
    setDataCache(prev => ({
        ...prev,
        [openedId]: {
            inscricoes: inscricoesResult.data || [],
            formadores: formadoresResult.data || [],
        }
    }));

    setLoadingItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(openedId);
        return newSet;
    });
  };
  
  const onCardUpdate = (formacaoId: string) => {
      // Invalidate cache for this formacao to refetch on next open
      setDataCache(prev => {
          const newCache = {...prev};
          delete newCache[formacaoId];
          return newCache;
      });
      // Also refetch formacoes list, as toggles update the formacao object
      fetchFormacoes();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Gerenciamento de Pendências</h1>
        <p className="text-muted-foreground">
          Acompanhe e gerencie as pendências das formações ativas.
        </p>
      </div>

      {loading ? (
        <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
        </div>
      ) : formacoes.length === 0 ? (
        <div className="text-center text-muted-foreground border-2 border-dashed rounded-lg p-12 mt-4">
            <p>Nenhuma formação cadastrada.</p>
        </div>
      ) : (
        <>
            {activeFormacoes.length > 0 ? (
                 <Accordion type="multiple" className="w-full space-y-4" onValueChange={handleAccordionChange}>
                    {activeFormacoes.map((formacao) => (
                        <AccordionItem value={formacao.id} key={formacao.id} className="border-b-0">
                            <Card>
                                <AccordionTrigger className="p-0 hover:no-underline">
                                <CardHeader className="flex-1 text-left">
                                    <CardTitle>{formacao.name}</CardTitle>
                                    <CardDescription>
                                        Clique para gerenciar as pendências e configurações
                                    </CardDescription>
                                </CardHeader>
                                </AccordionTrigger>
                                <AccordionContent>
                                {loadingItems.has(formacao.id) && (
                                        <div className="p-6 pt-0 space-y-3">
                                            <Skeleton className="h-16 w-full" />
                                            <Skeleton className="h-16 w-full" />
                                            <Skeleton className="h-16 w-full" />
                                        </div>
                                    )}
                                    {dataCache[formacao.id] && (
                                        <GerenciamentoCard 
                                            formacao={formacao}
                                            inscricoes={dataCache[formacao.id].inscricoes}
                                            formadores={dataCache[formacao.id].formadores}
                                            onUpdate={() => onCardUpdate(formacao.id)}
                                        />
                                    )}
                                </AccordionContent>
                            </Card>
                        </AccordionItem>
                    ))}
                </Accordion>
            ) : (
                <div className="text-center text-muted-foreground border-2 border-dashed rounded-lg p-12 mt-4">
                    <p>Nenhuma formação ativa encontrada.</p>
                </div>
            )}

            {pastFormacoes.length > 0 && (
                <div className="space-y-4 pt-4">
                    <Separator />
                    <div className="flex justify-center">
                        <Button variant="outline" onClick={() => setShowPast(!showPast)}>
                            {showPast ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                            {showPast ? 'Ocultar' : 'Ver'} Formações Concluídas ({pastFormacoes.length})
                        </Button>
                    </div>
                </div>
            )}
            
            {showPast && pastFormacoes.length > 0 && (
                <div className="pt-4 space-y-4">
                    <h2 className="text-xl font-bold">Formações Concluídas</h2>
                    <Accordion type="multiple" className="w-full space-y-4" onValueChange={handleAccordionChange}>
                        {pastFormacoes.map((formacao) => (
                            <AccordionItem value={formacao.id} key={formacao.id} className="border-b-0">
                                <Card className="opacity-80">
                                    <AccordionTrigger className="p-0 hover:no-underline">
                                    <CardHeader className="flex-1 text-left">
                                        <CardTitle>{formacao.name}</CardTitle>
                                        <CardDescription>
                                            Formação concluída. Clique para ver os detalhes.
                                        </CardDescription>
                                    </CardHeader>
                                    </AccordionTrigger>
                                    <AccordionContent>
                                    {loadingItems.has(formacao.id) && (
                                            <div className="p-6 pt-0 space-y-3">
                                                <Skeleton className="h-16 w-full" />
                                                <Skeleton className="h-16 w-full" />
                                                <Skeleton className="h-16 w-full" />
                                            </div>
                                        )}
                                        {dataCache[formacao.id] && (
                                            <GerenciamentoCard 
                                                formacao={formacao}
                                                inscricoes={dataCache[formacao.id].inscricoes}
                                                formadores={dataCache[formacao.id].formadores}
                                                onUpdate={() => onCardUpdate(formacao.id)}
                                            />
                                        )}
                                    </AccordionContent>
                                </Card>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </div>
            )}
        </>
      )}
    </div>
  );
}
