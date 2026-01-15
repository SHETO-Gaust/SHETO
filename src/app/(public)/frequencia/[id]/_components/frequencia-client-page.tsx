'use client';

import { useState } from 'react';
import type { Formacao } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { RealTimeClock } from './real-time-clock';
import { FrequenciaInscricaoForm } from './frequencia-inscricao-form';
import { checkInscricao, registerFrequency } from '../../actions';

type PageState = 'idle' | 'registering' | 'success' | 'already_registered' | 'error';

export function FrequenciaClientPage({ formacao }: { formacao: Formacao }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [cpf, setCpf] = useState('');
  const [pageState, setPageState] = useState<PageState>('idle');
  const [userName, setUserName] = useState('');
  const [formacaoName, setFormacaoName] = useState('');
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
    setLoading(false);
    
    setFormacaoName(result.formacao_name || formacao.name);

    if (result.status === 'FOUND') {
      const { inscricao } = result;
      // If found, immediately try to register frequency
      const registrationData = {
          nome_completo: inscricao.nome_completo,
          cpf: cpf,
          email: inscricao.email,
          // Não passamos 'dados' aqui para que a action saiba que é um usuário existente
      };
      await handleFullRegistration(registrationData);

    } else if (result.status === 'NOT_FOUND') {
      setPageState('registering');
    } else if (result.status === 'ALREADY_REGISTERED') {
      setUserName(result.nome_completo || '');
      setErrorMessage(result.error || 'Frequência já registrada.');
      setPageState('already_registered');
    } else { // ERROR
      setErrorMessage(result.error || 'Ocorreu um erro desconhecido.');
      setPageState('error');
    }
  };
  
  const handleFullRegistration = async (formData: any) => {
      setLoading(true);
      const result = await registerFrequency(formacao.id, formData);
      if (result.success) {
          setUserName(result.nome_completo || '');
          setFormacaoName(formacao.name);
          setPageState('success');
      } else {
          setErrorMessage(result.error || 'Ocorreu um erro ao registrar.');
          setPageState('error');
      }
      setLoading(false);
  }
  
  const SuccessCard = ({ title, children }: { title: string, children: React.ReactNode }) => (
    <Card className="w-full max-w-lg mx-auto border-green-500 bg-green-50/50">
        <CardHeader className="text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <CardTitle className="text-2xl">{title}</CardTitle>
        </CardHeader>
        <CardContent>
            {children}
        </CardContent>
    </Card>
  );

  const ErrorCard = ({ title, children, showRetry = true }: { title: string, children: React.ReactNode, showRetry?: boolean }) => (
    <Card className="w-full max-w-lg mx-auto border-destructive bg-destructive/5">
        <CardHeader className="text-center">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <CardTitle className="text-2xl text-destructive">{title}</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
            {children}
            {showRetry && <Button variant="outline" onClick={() => { setPageState('idle'); setCpf(''); }}>Tentar Novamente</Button>}
        </CardContent>
    </Card>
  );
  
  if (pageState === 'success') {
      return (
           <SuccessCard title="Frequência Registrada!">
                <p className="text-center text-lg text-muted-foreground">
                    Bem-vindo(a), <span className="font-bold text-foreground">{userName}</span>!
                </p>
                <p className="text-center text-muted-foreground mt-2">Sua presença na formação <strong>{formacaoName}</strong> foi confirmada com sucesso.</p>
           </SuccessCard>
      );
  }

  if (pageState === 'already_registered') {
    return (
         <ErrorCard title="Frequência Duplicada">
              <p className="text-center text-lg text-muted-foreground">
                  Olá, <span className="font-bold text-foreground">{userName}</span>!
              </p>
              <p className="text-muted-foreground mt-2">{errorMessage}</p>
         </ErrorCard>
    );
  }
  
   if (pageState === 'error') {
      return (
           <ErrorCard title="Ocorreu um Erro">
              <p className="text-muted-foreground">{errorMessage}</p>
           </ErrorCard>
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
