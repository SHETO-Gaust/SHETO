import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { Formacao } from "@/lib/types";
import { InscricaoForm } from "@/components/inscricoes/inscricao-form";

async function getFormacao(id: string): Promise<Formacao | null> {
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);
  const { data, error } = await supabase
    .from('formacoes')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data.subscription_form_config?.open) {
    console.error('Error fetching formacao or subscription is closed:', error);
    return null;
  }

  return data;
}

export default async function InscricaoDetailPage({ params }: { params: { id: string } }) {
  const formacao = await getFormacao(params.id);

  if (!formacao) {
    notFound();
  }

  return <InscricaoForm formacao={formacao} />;
}
