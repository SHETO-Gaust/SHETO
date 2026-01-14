'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Formacao } from '@/lib/types';
import { GerenciamentoCard } from '@/components/gerenciamento/gerenciamento-card';
import { Skeleton } from '@/components/ui/skeleton';

export default function GerenciamentoPage() {
  const [formacoes, setFormacoes] = useState<Formacao[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    async function getFormacoes() {
      setLoading(true);
      const { data, error } = await supabase
        .from('formacoes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching formacoes:', error);
        setFormacoes([]);
      } else {
        // Simple filter to get active formations (not concluded)
        const activeFormacoes = data.filter(f => {
            if (!f.dates || !Array.isArray(f.dates) || f.dates.length === 0) {
                return true; // Keep if no dates are set
            }
            const dateObjects = f.dates.map((d: any) => new Date(d.date));
            const lastDate = new Date(Math.max.apply(null, dateObjects.map(d => d.getTime())));
            return lastDate >= new Date();
        });
        setFormacoes(activeFormacoes);
      }
      setLoading(false);
    }

    getFormacoes();
  }, []);

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
            <GerenciamentoCard key={formacao.id} formacao={formacao} />
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
