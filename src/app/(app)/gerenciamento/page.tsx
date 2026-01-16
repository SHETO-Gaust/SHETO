'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Formacao, Inscricao, Formador } from '@/lib/types';
import { GerenciamentoCard } from '@/components/gerenciamento/gerenciamento-card';
import { Skeleton } from '@/components/ui/skeleton';

export default function GerenciamentoPage() {
  const [formacoes, setFormacoes] = useState<Formacao[]>([]);
  const [inscricoes, setInscricoes] = useState<{[formacaoId: string]: Inscricao[]}>({});
  const [formadores, setFormadores] = useState<{[formacaoId: string]: Formador[]}>({});
  const [loading, setLoading] = useState(true);

  const fetchGerenciamentoData = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data: formacoesData, error: formacoesError } = await supabase
      .from('formacoes')
      .select('*')
      .order('created_at', { ascending: false });

    if (formacoesError) {
      console.error('Error fetching formacoes:', formacoesError);
      setFormacoes([]);
      setLoading(false);
      return;
    }
    
    const activeFormacoes = formacoesData.filter(f => {
        if (!f.dates || !Array.isArray(f.dates) || f.dates.length === 0) {
            return true; 
        }
        const dateObjects = f.dates.map((d: any) => new Date(d.date));
        const lastDate = new Date(Math.max.apply(null, dateObjects.map(d => d.getTime())));
        return lastDate >= new Date();
    });
    setFormacoes(activeFormacoes);

    if (activeFormacoes.length > 0) {
        const formacaoIds = activeFormacoes.map(f => f.id);
        
        const { data: inscricoesData, error: inscricoesError } = await supabase
            .from('inscricoes')
            .select('*')
            .in('formacao_id', formacaoIds);
        
        if (inscricoesError) {
            console.error('Error fetching inscricoes:', inscricoesError);
        } else {
            const inscricoesByFormacao = inscricoesData.reduce((acc, inscricao) => {
                if (!acc[inscricao.formacao_id]) {
                    acc[inscricao.formacao_id] = [];
                }
                acc[inscricao.formacao_id].push(inscricao);
                return acc;
            }, {} as {[formacaoId: string]: Inscricao[]});
            setInscricoes(inscricoesByFormacao);
        }

        const { data: formadoresData, error: formadoresError } = await supabase
          .from('formadores')
          .select('*')
          .in('formacao_id', formacaoIds);
      
        if (formadoresError) {
            console.error('Error fetching formadores:', formadoresError);
        } else {
            const formadoresByFormacao = formadoresData.reduce((acc, formador) => {
                if (!acc[formador.formacao_id]) {
                    acc[formador.formacao_id] = [];
                }
                acc[formador.formacao_id].push(formador);
                return acc;
            }, {} as {[formacaoId: string]: Formador[]});
            setFormadores(formadoresByFormacao);
        }
    } else {
        setInscricoes({});
        setFormadores({});
    }
    
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchGerenciamentoData();
  }, [fetchGerenciamentoData]);

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
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
        </div>
      ) : formacoes.length > 0 ? (
        <div className="space-y-4">
          {formacoes.map((formacao) => (
            <GerenciamentoCard 
                key={formacao.id} 
                formacao={formacao}
                inscricoes={inscricoes[formacao.id] || []}
                formadores={formadores[formacao.id] || []}
                onUpdate={fetchGerenciamentoData}
            />
          ))}
        </div>
      ) : (
        <p className="text-center text-muted-foreground">
          Nenhuma formação ativa encontrada.
        </p>
      )}
    </div>
  );
}
