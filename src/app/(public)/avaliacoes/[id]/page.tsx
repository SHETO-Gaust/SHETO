import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { notFound } from 'next/navigation';
import { AvaliacaoClientPage } from "./_components/avaliacao-client-page";

export default async function AvaliacaoFormacaoPage({ params }: { params: { id: string } }) {
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);

  const { data: formacao, error } = await supabase
    .from('formacoes')
    .select('*')
    .eq('id', params.id)
    .single();

  // @ts-ignore
  if (error || !formacao || !formacao.gadsg_info?.avaliacao?.open) {
    console.error('Error fetching formacao or avaliacao is closed:', error);
    notFound();
  }

  return <AvaliacaoClientPage formacao={formacao} />;
}
