import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { notFound } from 'next/navigation';
import type { Formacao } from '@/lib/types';
import { FrequenciaClientPage } from "./_components/frequencia-client-page";

export default async function FrequenciaRegistroPage({ params }: { params: { id: string } }) {
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);
  const { data: formacao, error } = await supabase
    .from('formacoes')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error || !formacao || !formacao.attendance_list_info?.open) {
    console.error('Error fetching formacao or attendance is closed:', error);
    notFound();
  }

  return <FrequenciaClientPage formacao={formacao} />;
}
