'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  GraduationCap,
  School,
  ClipboardList,
  Star,
  ListChecks,
  BarChart3,
  Users,
} from 'lucide-react';
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import type { Profile } from '@/lib/types';

// Define all possible menu items with a unique module key
const allLinks = [
  // No Group (Main)
  { href: '/dashboard', label: 'Painel', icon: LayoutDashboard, module: 'dashboard' },
  { href: '/formacoes', label: 'Cadastrar Formação', icon: GraduationCap, module: 'formacoes' },
  { href: '/gerenciamento', label: 'Gerenciamento', icon: ListChecks, module: 'gerenciamento' },
  { href: '/ensalamentos', label: 'Ensalamentos', icon: School, module: 'ensalamentos' },
  
  // Analysis group
  { href: '/metricas-gerais', label: 'Métricas Gerais', icon: BarChart3, module: 'metricas', group: 'analysis' },
  { href: '/relatorios', label: 'Relatório de Frequência', icon: ClipboardList, module: 'relatorios', group: 'analysis' },
  { href: '/avaliacoes-admin', label: 'Avaliações', icon: Star, module: 'avaliacoes', group: 'analysis' },

  // Management group
  { href: '/usuarios', label: 'Usuários', icon: Users, module: 'usuarios', group: 'management' },
];

const linkGroups = [
    { id: 'analysis', label: 'Análise de Dados' },
    { id: 'management', label: 'Gestão' },
];


export function MainNav({ profile }: { profile: Profile | null }) {
  const pathname = usePathname();

  const hasAccess = (module: string) => {
      if (profile?.role === 'admin') return true;
      return profile?.modules?.includes(module) || false;
  }

  const visibleLinks = allLinks.filter(link => hasAccess(link.module));
  
  const mainLinks = visibleLinks.filter(l => !l.group);
  
  return (
    <nav className="p-2">
      <SidebarMenu>
        {mainLinks.map((link) => (
          <SidebarMenuItem key={link.href}>
            <Link href={link.href} passHref>
              <SidebarMenuButton
                className={cn('justify-start')}
                isActive={pathname.startsWith(link.href)}
                tooltip={link.label}
              >
                <link.icon className="h-5 w-5" />
                <span className="text-base">{link.label}</span>
              </SidebarMenuButton>
            </Link>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
      
      {linkGroups.map(group => {
          const groupLinks = visibleLinks.filter(l => l.group === group.id);
          if (groupLinks.length === 0) return null;

          return (
             <div className="pt-5" key={group.id}>
                <p className="px-3 mb-2 text-xs font-semibold uppercase text-sidebar-foreground/60 tracking-wider">
                  {group.label}
                </p>
                <SidebarMenu>
                {groupLinks.map((link) => (
                    <SidebarMenuItem key={link.href}>
                    <Link href={link.href} passHref>
                        <SidebarMenuButton
                        className={cn('justify-start')}
                        isActive={pathname.startsWith(link.href)}
                        tooltip={link.label}
                        >
                        <link.icon className="h-5 w-5" />
                        <span className="text-base">{link.label}</span>
                        </SidebarMenuButton>
                    </Link>
                    </SidebarMenuItem>
                ))}
                </SidebarMenu>
            </div>
          )
      })}
    </nav>
  );
}
