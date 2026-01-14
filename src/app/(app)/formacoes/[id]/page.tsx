import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { FormacaoDetails } from "@/components/formacoes/formacao-details";
import type { Formacao } from "@/lib/types";

async function getFormacao(id: string): Promise<Formacao | null> {
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);
  const { data, error } = await supabase
    .from('formacoes')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching formacao:', error);
    return null;
  }

  return data;
}

export default async function FormacaoDetailsPage({ params }: { params: { id: string } }) {
  const formacao = await getFormacao(params.id);

  if (!formacao) {
    notFound();
  }

  return <FormacaoDetails formacao={formacao} />;
}
