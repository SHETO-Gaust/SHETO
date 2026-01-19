'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Formacao, Inscricao, Formador } from '@/lib/types';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { GerenciamentoCard } from '@/components/gerenciamento/gerenciamento-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function GerenciamentoPage() {
  const [formacoes, setFormacoes] = useState<Formacao[]>([]);
  const [loading, setLoading] = useState(true);
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
          Acompanhe e gerencie as pendências de todas as formações.
        </p>
      </div>

      {loading ? (
        <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
        </div>
      ) : formacoes.length > 0 ? (
        <Accordion type="multiple" className="w-full space-y-4" onValueChange={handleAccordionChange}>
          {formacoes.map((formacao) => (
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
        <p className="text-center text-muted-foreground">
          Nenhuma formação cadastrada.
        </p>
      )}
    </div>
  );
}
