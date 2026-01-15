'use client';

import { useState } from 'react';
import type { Formacao } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { RealTimeClock } from './real-time-clock';
import { FrequenciaInscricaoForm } from './frequencia-inscricao-form';
import { checkInscricao, registerFrequency } from '../../actions';

export function FrequenciaClientPage({ formacao }: { formacao: Formacao }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [cpf, setCpf] = useState('');
  const [pageState, setPageState] = useState<'idle' | 'registering' | 'success' | 'error'>('idle');
  const [userName, setUserName] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const formatCPF = (value: string) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})/, '$1-$2')
      .slice(0, 14);
  };

  const handleCpfCheck = async () => {
    if (cpf.length !== 14) {
      toast({ title: 'CPF inválido.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    const result = await checkInscricao(formacao.id, cpf);
    
    if (result.status === 'FOUND') {
      setUserName(result.nome_completo || '');
      setPageState('success');
    } else if (result.status === 'NOT_FOUND') {
      setPageState('registering');
    } else {
      setErrorMessage(result.error || 'Ocorreu um erro desconhecido.');
      setPageState('error');
    }
    setLoading(false);
  };
  
  const handleFullRegistration = async (formData: any) => {
      setLoading(true);
      const result = await registerFrequency(formacao.id, formData);
      if (result.success) {
          setUserName(result.nome_completo || '');
          setPageState('success');
      } else {
          setErrorMessage(result.error || 'Ocorreu um erro ao registrar.');
          setPageState('error');
      }
      setLoading(false);
  }
  
  if (pageState === 'success') {
      return (
           <Card className="w-full max-w-lg mx-auto">
            <CardHeader className="text-center">
                <CardTitle className="text-2xl">Frequência Registrada!</CardTitle>
                <CardDescription className="text-lg pt-2">
                    Bem-vindo(a), <span className="font-bold text-foreground">{userName}</span>!
                </CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-center text-muted-foreground">Sua presença na formação <strong>{formacao.name}</strong> foi confirmada com sucesso.</p>
            </CardContent>
        </Card>
      );
  }
  
   if (pageState === 'error') {
      return (
           <Card className="w-full max-w-lg mx-auto border-destructive">
            <CardHeader className="text-center">
                <CardTitle className="text-2xl text-destructive">Ocorreu um Erro</CardTitle>
            </CardHeader>
            <CardContent className="text-center space-y-4">
                <p className="text-muted-foreground">{errorMessage}</p>
                <Button onClick={() => { setPageState('idle'); setCpf(''); }}>Tentar Novamente</Button>
            </CardContent>
        </Card>
      );
  }

  if (pageState === 'registering') {
      return <FrequenciaInscricaoForm formacao={formacao} cpf={cpf} onSubmit={handleFullRegistration} loading={loading} />
  }

  return (
    <Card className="w-full max-w-lg mx-auto">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">{formacao.name}</CardTitle>
        <CardDescription>
          Para registrar sua frequência, informe seu CPF.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <RealTimeClock />
        <div className="space-y-2">
          <Label htmlFor="cpf">CPF</Label>
          <Input
            id="cpf"
            placeholder="000.000.000-00"
            value={cpf}
            onChange={(e) => setCpf(formatCPF(e.target.value))}
            disabled={loading}
          />
        </div>
        <Button onClick={handleCpfCheck} className="w-full" disabled={loading || cpf.length !== 14}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Registrar Frequência
        </Button>
      </CardContent>
    </Card>
  );
}
