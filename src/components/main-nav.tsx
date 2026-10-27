'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  BookOpen,
  Clock,
  Users2,
  BarChart3,
  Sun,
  GraduationCap,
  Layers,
  Search,
  UserX,
  Wand2,
  ShieldCheck,
  Building2,
  LifeBuoy,
} from 'lucide-react';
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import type { Profile } from '@/lib/types';
import { podeAcessarModulo } from '@/lib/permissoes';

const allLinks = [
  { href: '/dashboard', label: 'Painel', icon: LayoutDashboard, module: 'dashboard' },
  { href: '/turno', label: 'Turno', icon: Sun, module: 'turno', group: 'dados-horario', step: 1 },
  { href: '/ensino', label: 'Ensino', icon: GraduationCap, module: 'ensino', group: 'dados-horario', step: 2 },
  { href: '/componentes', label: 'Componentes', icon: BookOpen, module: 'disciplinas', group: 'dados-horario', step: 3 },
  { href: '/professores', label: 'Professores', icon: Users, module: 'professores', group: 'dados-horario', step: 4 },
  { href: '/serie', label: 'Série', icon: Layers, module: 'serie', group: 'dados-horario', step: 5 },
  { href: '/turmas', label: 'Turmas', icon: Users2, module: 'turmas', group: 'dados-horario', step: 6 },
  { href: '/gerarhorarios', label: 'Gerar Horário', icon: Clock, module: 'horarios', group: 'horarios', step: 7 },
  { href: '/visualizarhorario', label: 'Visualizar Horário', icon: Search, module: 'horarios', group: 'horarios', step: 8 },
  { href: '/relatorios', label: 'Relatórios', icon: BarChart3, module: 'horarios', group: 'horarios', step: 9 },
  { href: '/refinodehorario', label: 'Refino de Horário', icon: Wand2, module: 'horarios', group: 'detalhes', step: 10 },
  { href: '/substituicoes', label: 'Substituições', icon: UserX, module: 'horarios', group: 'detalhes', step: 11 },
  { href: '/auditoria', label: 'Auditoria de Dados', icon: ShieldCheck, module: 'auditoria', group: 'management' },
  { href: '/usuarios', label: 'Usuários', icon: Users, module: 'usuarios', group: 'management' },
  { href: '/unidades', label: 'Unidades', icon: Building2, module: 'unidades', group: 'management' },
  // Gestao (auditoria, usuarios, unidades, chamados): so admin ve.
  { href: '/chamados', label: 'Chamados', icon: LifeBuoy, module: 'chamados', group: 'management' },
];

const linkGroups = [
  { id: 'dados-horario', label: 'Dados do Horário' },
  { id: 'horarios', label: 'Horários' },
  { id: 'detalhes', label: 'Detalhes' },
  { id: 'management', label: 'Gestão' },
];

export function MainNav({ profile }: { profile: Profile | null }) {
  const pathname = usePathname();

  const hasAccess = (module: string) =>
    profile ? podeAcessarModulo(profile.role, module) : module === 'dashboard';

  const visibleLinks = allLinks.filter(link => hasAccess(link.module));
  const mainLinks = visibleLinks.filter(l => !l.group);

  return (
    <nav className="p-2">
      <SidebarMenu>
        {mainLinks.map((link) => (
          <SidebarMenuItem key={link.href}>
            <Link href={link.href} passHref>
              <SidebarMenuButton
                data-tutorial={`nav${link.href.replace(/\//g, '-')}`}
                className={cn('justify-start')}
                isActive={pathname.startsWith(link.href)}
                tooltip={link.label}
              >
                <link.icon className="h-5 w-5" />
                <span className="text-base flex-1">{link.label}</span>
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
                      data-tutorial={`nav${link.href.replace(/\//g, '-')}`}
                      className={cn('justify-start')}
                      isActive={pathname.startsWith(link.href)}
                      tooltip={link.label}
                    >
                      <link.icon className="h-5 w-5" />
                      <span className="text-base flex-1">{link.label}</span>
                      {link.step && (
                        <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-sidebar-accent text-[10px] font-bold text-sidebar-accent-foreground">
                          {link.step}
                        </span>
                      )}
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
