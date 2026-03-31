
import { StepCard } from '@/components/dashboard/step-card';
import { Sun, GraduationCap, BookOpen, Users, Layers, Users2, Clock, BarChart3, Calendar, ArrowRight, CheckCircle2, Search } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Horario, Turno } from '@/lib/types';

const steps = [
  { step: 1, title: 'Turno', icon: Sun, href: '/turno' },
  { step: 2, title: 'Ensino', icon: GraduationCap, href: '/ensino' },
  { step: 3, title: 'Componentes', icon: BookOpen, href: '/componentes' },
  { step: 4, title: 'Professores', icon: Users, href: '/professores' },
  { step: 5, title: 'Série', icon: Layers, href: '/serie' },
  { step: 6, title: 'Turmas', icon: Users2, href: '/turmas' },
  { step: 7, title: 'Gerar Horário', icon: Clock, href: '/gerarhorarios' },
  { step: 8, title: 'Visualizar Horário', icon: Search, href: '/visualizarhorario' },
  { step: 9, title: 'Relatórios', icon: BarChart3, href: '/relatorios' },
];

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('ue')
    .eq('id', user.id)
    .single();

  const escolaId = profile?.ue;

  let horariosPublicados: (Horario & { turno: Turno })[] = [];

  if (escolaId) {
    const { data } = await supabase
      .from('horarios')
      .select('*, turno:turnos(*)')
      .eq('escola_id', escolaId)
      .eq('status', 'publicado')
      .order('created_at', { ascending: false });
    
    horariosPublicados = data as any[] || [];
  }

  return (
    <div className="flex flex-col gap-10">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Painel do SHE</h1>
        <p className="text-muted-foreground text-lg">Bem-vindo(a) ao SHE - Sistema de Horário Escolar.</p>
        <p className="text-sm text-muted-foreground">Siga os passos abaixo para configurar os dados e gerar a grade horária da sua unidade escolar.</p>
      </div>

      <section className="space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Layers className="h-4 w-4" /> Fluxo de Configuração
        </h2>
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
      </section>

      <section className="space-y-6">
        <div className="flex items-center justify-between border-b pb-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                Grades Horárias Oficiais
            </h2>
            {escolaId && (
                <Link href="/horarios" target="_blank">
                    <Button variant="ghost" size="sm" className="text-primary font-bold">
                        <Search className="mr-2 h-4 w-4" />
                        Ver Consulta Pública
                    </Button>
                </Link>
            )}
        </div>

        {horariosPublicados.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {horariosPublicados.map((h) => (
                    <Card key={h.id} className="border-2 border-primary/10 shadow-md hover:shadow-xl transition-all group">
                        <CardHeader className="pb-3">
                            <div className="flex justify-between items-start">
                                <Badge className="bg-green-500 hover:bg-green-600 text-white font-bold uppercase tracking-tighter">
                                    <CheckCircle2 className="mr-1 h-3 w-3" /> Consolidado
                                </Badge>
                                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    Publicado em {format(new Date(h.created_at), "dd/MM/yy", { locale: ptBR })}
                                </span>
                            </div>
                            <CardTitle className="text-lg pt-2">{h.nome}</CardTitle>
                            <CardDescription className="font-medium text-foreground">
                                Turno: <span className="text-primary">{h.turno.nome}</span>
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="pb-4">
                            <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
                                <p>• {h.turno.aulas_por_dia} aulas diárias</p>
                                <p>• {h.turno.dias_semana.length} dias na semana</p>
                            </div>
                        </CardContent>
                        <CardFooter className="pt-0">
                            <Link href={`/visualizarhorario`} className="w-full">
                                <Button className="w-full font-bold group-hover:bg-primary transition-colors">
                                    Visualizar Grade Completa
                                    <ArrowRight className="ml-2 h-4 w-4" />
                                </Button>
                            </Link>
                        </CardFooter>
                    </Card>
                ))}
            </div>
        ) : (
            <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed rounded-2xl bg-muted/5">
                <div className="h-16 w-16 bg-muted/20 rounded-full flex items-center justify-center mb-4">
                    <Clock className="h-8 w-8 text-muted-foreground/40" />
                </div>
                <h3 className="text-lg font-semibold text-muted-foreground">Nenhuma grade consolidada</h3>
                <p className="text-sm text-muted-foreground/60 max-w-xs mt-1">
                    Após gerar e aprovar um horário no <span className="font-bold">Passo 7</span>, ele aparecerá aqui para consulta rápida.
                </p>
                <Link href="/gerarhorarios" className="mt-6">
                    <Button variant="outline" size="sm">Ir para Gerador de Horários</Button>
                </Link>
            </div>
        )}
      </section>
    </div>
  )
}
