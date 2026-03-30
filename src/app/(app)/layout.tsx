
import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import Image from 'next/image';
import {
  SidebarProvider,
  Sidebar,
  SidebarInset,
  SidebarTrigger,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
} from '@/components/ui/sidebar';
import { MainNav } from '@/components/main-nav';
import { UserNav } from '@/components/user-nav';
import type { Profile, Escola } from '@/lib/types';
import { AccessDenied } from '@/components/access-denied';
import { Clock } from 'lucide-react';
import { SchoolSelector } from '@/components/school-selector';

const moduleMap: { [key: string]: string } = {
    '/dashboard': 'dashboard',
    '/professores': 'professores',
    '/componentes': 'disciplinas',
    '/turmas': 'turmas',
    '/gerarhorarios': 'horarios',
    '/relatorios': 'horarios',
    '/usuarios': 'usuarios',
    '/turno': 'turno',
    '/ensino': 'ensino',
    '/serie': 'serie',
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect('/login');
  }

  let userProfile: Profile | null = null;
  if (user) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select(`*, escolas(*)`)
        .eq('id', user.id)
        .single();
      userProfile = profileData as Profile;
  }
  
  const { data: allEscolasData } = await supabase
    .from('escolas')
    .select('*')
    .order('escolar', { ascending: true });
  const allEscolas = allEscolasData as Escola[] || [];

  const headerList = await headers();
  const pathname = headerList.get('x-next-url') || '';
  
  const requiredModuleKey = Object.keys(moduleMap).find(key => pathname.startsWith(key));
  let hasPermission = true;

  if (requiredModuleKey) {
      const moduleName = moduleMap[requiredModuleKey as keyof typeof moduleMap];
      const isAdmin = userProfile?.role === 'admin';

      if (isAdmin) {
        hasPermission = true;
      } else if (moduleName === 'dashboard') {
        hasPermission = true;
      } else {
        const groupModule = ['turno', 'ensino', 'disciplinas', 'professores', 'serie', 'turmas'].includes(moduleName) ? 'dados-horario'
                            : moduleName === 'horarios' ? 'horarios' : null;

        if(groupModule) {
            hasPermission = userProfile?.modules?.includes(groupModule) || false;
        } else {
            hasPermission = userProfile?.modules?.includes(moduleName) || false;
        }
      }
  }

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center justify-center p-2">
            <div className="flex items-center gap-2 text-xl font-bold text-sidebar-foreground">
                <Clock className="h-6 w-6 text-orange-400" />
                <span>SHE</span>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <MainNav profile={userProfile} />
        </SidebarContent>
        <SidebarFooter>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background/80 px-4 backdrop-blur-sm sm:px-6">
          <SidebarTrigger className="md:hidden" />
           <div className="flex-1">
            {userProfile && <SchoolSelector userProfile={userProfile} allEscolas={allEscolas} />}
          </div>
          <div className="ml-auto flex items-center gap-4">
            <UserNav user={user} profile={userProfile} />
          </div>
        </header>
        <div className="flex-1 bg-white p-4 sm:p-6">
            {hasPermission ? children : <AccessDenied />}
        </div>
        <footer className="border-t bg-background p-4 text-center text-xs text-muted-foreground">
          Desenvolvido pela Diretoria de Tecnologia e Inovação Educacional da Seduc Tocantins - Todos os direitos reservados © 2026
        </footer>
      </SidebarInset>
    </SidebarProvider>
  );
}
