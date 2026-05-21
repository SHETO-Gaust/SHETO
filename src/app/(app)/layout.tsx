
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
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
import { UserX, LogOut } from 'lucide-react';
import Image from 'next/image';
import { SchoolSelector } from '@/components/school-selector';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { signOut } from '@/app/login/actions';
import { headers } from 'next/headers';
import { ThemeToggle } from '@/components/theme-toggle';

const moduleMap: { [key: string]: string } = {
    '/dashboard': 'dashboard',
    '/professores': 'professores',
    '/componentes': 'disciplinas',
    '/turmas': 'turmas',
    '/gerarhorarios': 'horarios',
    '/visualizarhorario': 'horarios',
    '/relatorios': 'horarios',
    '/usuarios': 'usuarios',
    '/unidades': 'unidades',
    '/turno': 'turno',
    '/ensino': 'ensino',
    '/serie': 'serie',
    '/auditoria': 'auditoria',
    '/substituicoes': 'horarios',
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

  // Se não houver usuário, manda para o login. 
  // Isso não gera loop porque o login não redireciona usuários nulos.
  if (!user) {
    return redirect('/login');
  }

  const { data: profileData } = await supabase
    .from('profiles')
    .select(`*, escolas(*)`)
    .eq('id', user.id)
    .maybeSingle();
  
  const userProfile = (profileData as Profile | null) || {
      id: user.id,
      email: user.email!,
      role: 'user',
      active: true,
      modules: ['dashboard'],
      name: user.user_metadata?.name || user.email?.split('@')[0]
  };

  // Se o usuário está desativado, mostramos a tela de bloqueio em vez de redirecionar.
  // Isso mata o loop de redirecionamentos.
  if (userProfile && userProfile.active === false) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/20 p-4">
        <Card className="w-full max-w-md border-destructive shadow-2xl">
          <CardHeader className="text-center">
            <div className="mx-auto bg-destructive/10 p-3 rounded-full w-fit mb-4">
                <UserX className="h-12 w-12 text-destructive" />
            </div>
            <CardTitle className="text-2xl font-bold text-destructive">Acesso Suspenso</CardTitle>
            <CardDescription className="text-base mt-2">
              Seu acesso ao sistema SHE foi desativado pela coordenação ou administração central.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center text-sm text-muted-foreground">
            Caso acredite que isso seja um erro, entre em contato com o suporte da Secretaria de Educação.
          </CardContent>
          <CardFooter className="flex justify-center border-t pt-6 mt-4">
            <form action={signOut}>
                <Button variant="outline" className="gap-2">
                    <LogOut className="h-4 w-4" /> Sair do Sistema
                </Button>
            </form>
          </CardFooter>
        </Card>
      </div>
    );
  }
  
  const { data: allEscolasData } = await supabase
    .from('escolas')
    .select('*')
    .order('escolar', { ascending: true });
  const allEscolas = (allEscolasData as Escola[]) || [];

  const headerList = await headers();
  const pathname = headerList.get('x-next-url') || '/dashboard';
  
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
        const userModules = Array.isArray(userProfile?.modules) ? userProfile.modules : [];
        const groupModule = ['turno', 'ensino', 'disciplinas', 'professores', 'serie', 'turmas'].includes(moduleName) ? 'dados-horario'
                            : moduleName === 'horarios' ? 'horarios'
                            : ['usuarios', 'auditoria', 'unidades'].includes(moduleName) ? 'usuarios'
                            : null;

        if(groupModule) {
            hasPermission = userModules.includes(groupModule);
        } else {
            hasPermission = userModules.includes(moduleName);
        }
      }
  }

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center justify-center p-3">
            <Image
              src="/img/elements/01.png"
              alt="SHE - Sistema de Horário Escolar"
              width={180}
              height={50}
              className="object-contain"
              priority
            />
          </div>
        </SidebarHeader>
        <SidebarContent>
          <MainNav profile={userProfile as any} />
        </SidebarContent>
        <SidebarFooter />
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background/80 px-4 backdrop-blur-sm sm:px-6">
          <SidebarTrigger className="md:hidden" />
           <div className="flex-1 overflow-hidden">
            <SchoolSelector userProfile={userProfile as any} allEscolas={allEscolas} />
          </div>
          <div className="ml-auto flex items-center gap-4 shrink-0">
            <ThemeToggle />
            <UserNav user={user} profile={userProfile as any} />
          </div>
        </header>
        <div className="flex-1 relative overflow-auto">
          <Image
            src="/img/elements/10.png"
            alt=""
            fill
            className="object-cover object-center pointer-events-none select-none opacity-[0.3]"
          />
          <div className="relative z-10 p-4 sm:p-6">
            {hasPermission ? children : <AccessDenied />}
          </div>
        </div>
        <footer className="border-t bg-background p-4 text-center text-xs text-muted-foreground">
          Desenvolvido pela Secretaria da Educação do Tocantins - Todos os direitos reservados © 2026
        </footer>
      </SidebarInset>
    </SidebarProvider>
  );
}
