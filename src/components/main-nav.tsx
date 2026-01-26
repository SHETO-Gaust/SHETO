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
} from 'lucide-react';
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

const mainLinks = [
  { href: '/dashboard', label: 'Painel', icon: LayoutDashboard },
  { href: '/formacoes', label: 'Cadastrar Formação', icon: GraduationCap },
  { href: '/gerenciamento', label: 'Gerenciamento', icon: ListChecks },
  { href: '/ensalamentos', label: 'Ensalamentos', icon: School },
];

const analysisLinks = [
  { href: '/metricas-gerais', label: 'Métricas Gerais', icon: BarChart3 },
  { href: '/relatorios', label: 'Relatório de Frequência', icon: ClipboardList },
  { href: '/avaliacoes-admin', label: 'Avaliações', icon: Star },
];

export function MainNav() {
  const pathname = usePathname();

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
      
      <div className="pt-5">
        <p className="px-3 mb-2 text-xs font-semibold uppercase text-sidebar-foreground/60 tracking-wider">
          Análise de Dados
        </p>
        <SidebarMenu>
          {analysisLinks.map((link) => (
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
    </nav>
  );
}
