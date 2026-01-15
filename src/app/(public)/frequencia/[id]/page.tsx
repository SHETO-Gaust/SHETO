import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { notFound } from 'next/navigation';
import type { Formacao } from '@/lib/types';
import { FrequenciaClientPage } from "./_components/frequencia-client-page";

async function getFormacao(id: string): Promise<Formacao> {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);
    const { data, error } = await supabase
        .from('formacoes')
        .select('*')
        .eq('id', id)
        .single();

    if (error || !data.attendance_list_info?.open) {
        console.error('Error fetching formacao or attendance is closed:', error);
        notFound();
    }
    return data;
}

export default async function FrequenciaRegistroPage({ params }: { params: { id: string } }) {
  const formacao = await getFormacao(params.id);

  return <FrequenciaClientPage formacao={formacao} />;
}
