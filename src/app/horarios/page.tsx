
'use client';

import { useState, useTransition } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Loader2, Clock, AlertCircle } from 'lucide-react';
import { getEscolaPorInep, getHorariosPublicos } from './actions';
import { useToast } from '@/hooks/use-toast';
import type { HorarioCompleto, Escola } from '@/lib/types';
import { HorariosPublicClient } from './horarios-public-client';

export default function ConsultaPublicaPage() {
  const [inep, setInep] = useState('');
  const [isSearching, startSearching] = useTransition();
  const [escola, setEscola] = useState<Escola | null>(null);
  const [horarios, setHorarios] = useState<HorarioCompleto[]>([]);
  const { toast } = useToast();

  const handleSearch = () => {
    if (!inep || inep.length < 5) {
      toast({ title: 'INEP Inválido', description: 'Por favor, digite um código INEP válido.', variant: 'destructive' });
      return;
    }

    startSearching(async () => {
      const eResult = await getEscolaPorInep(inep);
      if (eResult.error) {
        toast({ title: 'Erro', description: eResult.error, variant: 'destructive' });
        setEscola(null);
        setHorarios([]);
        return;
      }

      const hResult = await getHorariosPublicos(eResult.data!.id);
      setEscola(eResult.data!);
      setHorarios(hResult.data || []);
      
      if (hResult.data?.length === 0) {
          toast({ title: 'Sem horários ativos', description: 'Esta escola ainda não possui horários consolidados para este período.' });
      }
    });
  };

  return (
    <div className="min-h-screen bg-muted/30 p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex flex-col items-center justify-center space-y-4 text-center">
          <div className="flex items-center gap-2 text-3xl font-bold text-primary">
            <Clock className="h-8 w-8" />
            <span>SHE - Consulta de Horários</span>
          </div>
          <p className="text-muted-foreground max-w-lg">
            Acesse as grades horárias oficiais das unidades escolares da rede estadual do Tocantins.
          </p>
        </div>

        <Card className="shadow-xl border-t-4 border-t-primary">
          <CardHeader>
            <CardTitle>Pesquisar Escola</CardTitle>
            <CardDescription>Informe o código INEP da unidade escolar para visualizar os horários ativos.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Input
                  placeholder="Digite o INEP da escola..."
                  value={inep}
                  onChange={(e) => setInep(e.target.value)}
                  className="h-12 text-lg pl-10"
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                <Search className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
              </div>
              <Button onClick={handleSearch} disabled={isSearching} size="lg" className="h-12 px-8 font-bold">
                {isSearching ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Search className="mr-2 h-5 w-5" />}
                Consultar Horários
              </Button>
            </div>
          </CardContent>
        </Card>

        {escola && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1">
                            <h2 className="text-xl font-bold text-primary uppercase">{escola.escolar}</h2>
                            <p className="text-sm text-muted-foreground">
                                {escola.cidade} - {escola.regional} | INEP: <span className="font-semibold">{escola.inep}</span>
                            </p>
                        </div>
                        <div className="bg-background px-4 py-2 rounded-full border text-xs font-bold uppercase tracking-wider text-muted-foreground shadow-sm">
                            {horarios.length} Turno(s) Ativo(s)
                        </div>
                    </div>
                </CardContent>
            </Card>

            {horarios.length > 0 ? (
                <HorariosPublicClient horarios={horarios} />
            ) : (
                <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed rounded-xl bg-background">
                    <AlertCircle className="h-12 w-12 text-muted-foreground/30 mb-4" />
                    <p className="text-lg font-medium text-muted-foreground">Nenhum horário consolidado foi encontrado.</p>
                    <p className="text-sm text-muted-foreground/60 max-w-sm">
                        A unidade escolar pode estar em processo de elaboração das grades ou ainda não realizou a publicação oficial no sistema.
                    </p>
                </div>
            )}
          </div>
        )}
      </div>
      
      <footer className="mt-12 text-center text-xs text-muted-foreground pb-8">
        Desenvolvido pela Secretaria da Educação do Tocantins © 2026
      </footer>
    </div>
  );
}
