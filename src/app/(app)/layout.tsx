import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
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
import { NotificationsPopover } from '@/components/notifications-popover';
import type { Profile } from '@/lib/types';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);

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
        .select('*')
        .eq('id', user.id)
        .single();
      userProfile = profileData;
  }

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center justify-center p-2">
            <Image
              src="/img/logogforms.png"
              alt="GForms Logo"
              width={150}
              height={40}
              priority
            />
          </div>
        </SidebarHeader>
        <SidebarContent>
          <MainNav />
        </SidebarContent>
        <SidebarFooter>
          {/* Can add elements to footer here */}
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background/80 px-4 backdrop-blur-sm sm:px-6">
          <SidebarTrigger className="md/hidden" />
          <div className="ml-auto flex items-center gap-4">
            <NotificationsPopover />
            <UserNav user={user} profile={userProfile} />
          </div>
        </header>
        <div className="flex-1 bg-white p-4 sm:p-6">{children}</div>
        <footer className="border-t bg-background p-4 text-center text-xs text-muted-foreground">
          Desenvolvido pela Gerência de Apoio ao Usuário e Suporte Técnico da Seduc Tocantins - Todos os direitos reservados © 2026
        </footer>
      </SidebarInset>
    </SidebarProvider>
  );
}
