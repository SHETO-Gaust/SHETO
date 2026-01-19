'use client';

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Formacao, Profile } from "@/lib/types";
import { FormacaoCard } from "@/components/dashboard/formacao-card";
import { isPast, isToday } from "date-fns";

const isConcluida = (formacao: Formacao): boolean => {
    const { dates } = formacao;
    if (!dates || !Array.isArray(dates) || dates.length === 0) {
        return false; // Not concluded if no dates
    }
    // Check if ALL dates are in the past
    const allPast = dates.every((d: any) => isPast(new Date(d.date)) && !isToday(new Date(d.date)));
    return allPast;
}

export default function DashboardPage() {
  const [displayName, setDisplayName] = useState("Usuário");
  const [formacoes, setFormacoes] = useState<Formacao[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function fetchData() {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        setDisplayName(profileData?.name || user.email || "Usuário");
      }

      const { data: formacoesData, error: formacoesError } = await supabase
        .from('formacoes')
        .select('*')
        .order('created_at', { ascending: false });

      if (formacoesError) {
        console.error('Error fetching formacoes:', formacoesError);
        setFormacoes([]);
      } else if (formacoesData) {
        const activeFormacoes = formacoesData.filter(f => !isConcluida(f));
        setFormacoes(activeFormacoes);
      }
      
      setLoading(false);
    }

    fetchData();
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Olá, {displayName}!</h1>
        <p className="text-muted-foreground">Bem-vindo(a) ao painel Gerenciamento de Formações.</p>
      </div>

      <div className="space-y-2">
          <h2 className="text-xl font-semibold">Formações e Status</h2>
      </div>

      <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
        {loading ? (
          <>
            <Skeleton className="h-[28rem] w-full rounded-xl" />
            <Skeleton className="h-[28rem] w-full rounded-xl" />
          </>
        ) : (
          formacoes.map((formacao) => (
              <FormacaoCard key={formacao.id} formacao={formacao} />
          ))
        )}
      </div>
    </div>
  )
}
