'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  GraduationCap,
  School,
  ClipboardList,
  Star,
} from 'lucide-react';
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

const links = [
  { href: '/dashboard', label: 'Painel', icon: LayoutDashboard },
  { href: '/formacoes', label: 'Formações', icon: GraduationCap },
  { href: '/ensalamentos', label: 'Ensalamentos', icon: School },
  { href: '/relatorios', label: 'Relatórios', icon: ClipboardList },
  { href: '/avaliacoes', label: 'Avaliações', icon: Star },
];

export function MainNav() {
  const pathname = usePathname();

  return (
    <nav className="p-2">
      <SidebarMenu>
        {links.map((link) => (
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
    </nav>
  );
}
