'use client';

import { StepCard } from '@/components/dashboard/step-card';
import { Sun, GraduationCap, BookOpen, Users, Layers, Users2, Clock, BarChart3 } from 'lucide-react';

const steps = [
  { step: 1, title: 'Turno', icon: Sun, href: '/turno' },
  { step: 2, title: 'Ensino', icon: GraduationCap, href: '/ensino' },
  { step: 3, title: 'Componentes', icon: BookOpen, href: '/componentes' },
  { step: 4, title: 'Professores', icon: Users, href: '/professores' },
  { step: 5, title: 'Série', icon: Layers, href: '/serie' },
  { step: 6, title: 'Turmas', icon: Users2, href: '/ensalamentos' },
  { step: 7, title: 'Gerar Horário', icon: Clock, href: '/avaliacoes-admin' },
  { step: 8, title: 'Relatórios', icon: BarChart3, href: '/relatorios' },
];

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">Painel RedeGrade TO</h1>
        <p className="text-muted-foreground">Bem-vindo(a) ao sistema de geração de horários escolares.</p>
        <p className="text-muted-foreground mt-2">Para informar os dados referentes ao horário, siga os passos sugeridos utilizando os botões abaixo ou o menu lateral.</p>
      </div>

       <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {steps.map((item) => (
          <StepCard
            key={item.step}
            step={item.step}
            title={item.title}
            icon={item.icon}
            href={item.href}
          />
        ))}
      </div>
    </div>
  )
}
