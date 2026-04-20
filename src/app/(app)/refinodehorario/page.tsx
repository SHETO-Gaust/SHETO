import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { RefinoClient } from './refino-client';
import { getHorariosParaRefino } from './actions';

export const metadata = {
  title: 'Refino de Horário',
};

export default async function RefinoPage() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData?.user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, escolas(id, escolar)')
    .eq('id', userData.user.id)
    .single();

  if (!profile || !profile.ue) {
    redirect('/dashboard');
  }

  const { data: horarios } = await getHorariosParaRefino(profile.ue);

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6 h-[calc(100vh-64px)] overflow-y-hidden flex flex-col">
      <div className="flex items-center justify-between space-y-2 shrink-0">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Refino de Horário</h2>
          <p className="text-muted-foreground text-sm">
            Mova aulas pendentes ou faça ajustes manuais rápidos visualizando o impacto.
          </p>
        </div>
      </div>
      
      <div className="flex-1 min-h-0 bg-background/50 backdrop-blur-sm border rounded-xl shadow-sm p-4 overflow-y-auto">
        <RefinoClient escolaId={profile.ue} horariosParaRefino={(horarios as any) || []} />
      </div>
    </div>
  );
}
