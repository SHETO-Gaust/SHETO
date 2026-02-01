'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  BookOpen,
  Clock,
  Save,
  Building2,
  Users2,
  Ban,
} from 'lucide-react';
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import type { Profile } from '@/lib/types';

// New structure for RedeGrade TO
const allLinks = [
  // Main
  { href: '/dashboard', label: 'Painel', icon: LayoutDashboard, module: 'dashboard' },

  // Dados do Horário
  { href: '/metricas-gerais', label: 'Unidades Escolares', icon: Building2, module: 'unidades-escolares', group: 'dados-horario' },
  { href: '/formacoes', label: 'Professores', icon: Users, module: 'professores', group: 'dados-horario' },
  { href: '/gerenciamento', label: 'Disciplinas', icon: BookOpen, module: 'disciplinas', group: 'dados-horario' },
  { href: '/ensalamentos', label: 'Turmas', icon: Users2, module: 'turmas', group: 'dados-horario' },
  { href: '/relatorios', label: 'Restrições', icon: Ban, module: 'restricoes', group: 'dados-horario' },
  
  // Horários
  { href: '/avaliacoes-admin', label: 'Gerar Novo Horário', icon: Clock, module: 'horarios', group: 'horarios' },
  { href: '/emitir-certificado', label: 'Horários Salvos', icon: Save, module: 'horarios', group: 'horarios' },

  // Gestão
  { href: '/usuarios', label: 'Usuários', icon: Users, module: 'usuarios', group: 'management' },
];

const linkGroups = [
    { id: 'dados-horario', label: 'Dados do Horário' },
    { id: 'horarios', label: 'Horários' },
    { id: 'management', label: 'Gestão' },
];


export function MainNav({ profile }: { profile: Profile | null }) {
  const pathname = usePathname();

  const hasAccess = (module: string) => {
      if (profile?.role === 'admin') return true;
      if (module === 'dashboard') return true;
      
      const groupModules: {[key: string]: string[]} = {
        'dados-horario': ['unidades-escolares', 'professores', 'disciplinas', 'turmas', 'restricoes'],
        'horarios': ['horarios']
      };

      for (const group in groupModules) {
        if (groupModules[group].includes(module)) {
          return profile?.modules?.includes(group) || false;
        }
      }

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
