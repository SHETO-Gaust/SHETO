'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Formacao, Coordinates } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle, AlertTriangle, MapPin, Star } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { RealTimeClock } from './real-time-clock';
import { FrequenciaInscricaoForm } from './frequencia-inscricao-form';
import { checkInscricao, registerFrequency } from '../../actions';
import { format } from 'date-fns';

type PageState = 'idle' | 'getting_location' | 'registering' | 'success' | 'already_registered' | 'error';

const CountdownRedirect = ({ formacaoId, cpf }: { formacaoId: string, cpf: string }) => {
    const router = useRouter();
    const [countdown, setCountdown] = useState(8);

    useEffect(() => {
        if (countdown <= 0) {
            router.push(`/avaliacoes/${formacaoId}?cpf=${encodeURIComponent(cpf)}`);
            return;
        }

        const timer = setInterval(() => {
            setCountdown((prev) => prev - 1);
        }, 1000);

        return () => clearInterval(timer);
    }, [countdown, router, formacaoId, cpf]);
    
    const handleRedirectNow = () => {
        router.push(`/avaliacoes/${formacaoId}?cpf=${encodeURIComponent(cpf)}`);
    };

    return (
        <div className="pt-4 mt-4 border-t">
            <div className="pt-4 space-y-2 text-center">
                <p className="font-semibold text-primary">Sua opinião é muito importante para nós!</p>
                <p className="text-muted-foreground text-sm">Você será redirecionado para a avaliação em:</p>
                <p className="text-6xl font-bold tabular-nums">{countdown}</p>
                 <Button onClick={handleRedirectNow} size="lg">
                    <Star className="mr-2 h-4 w-4" />
                    Avaliar Agora
                </Button>
            </div>
        </div>
    );
};


export function FrequenciaClientPage({ formacao }: { formacao: Formacao }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [cpf, setCpf] = useState('');
  const [pageState, setPageState] = useState<PageState>('idle');
  const [userName, setUserName] = useState('');
  const [formacaoName, setFormacaoName] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [registrationPeriod, setRegistrationPeriod] = useState<'MAT' | 'VESP' | null>(null);
  const [registrationTime, setRegistrationTime] = useState<Date | null>(null);
  const [userCoords, setUserCoords] = useState<Coordinates | null>(null);
  const [showAvaliacaoPrompt, setShowAvaliacaoPrompt] = useState(false);

  const isGeolocationEnabled = formacao.attendance_list_info?.geolocation?.enabled === true;

  const formatCPF = (value: string) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})/, '$1-$2')
      .slice(0, 14);
  };
  
  const getUserLocation = (): Promise<Coordinates> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocalização não é suportada por este navegador."));
        return;
      }
      setPageState('getting_location');
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          setUserCoords(coords);
          resolve(coords);
        },
        (error) => {
          let message = "Ocorreu um erro ao obter sua localização.";
          if (error.code === 1) message = "Você precisa permitir o acesso à localização para registrar a frequência.";
          reject(new Error(message));
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  }

  const handleCpfCheck = async () => {
    if (cpf.length !== 14) {
      toast({ title: 'CPF inválido.', variant: 'destructive' });
      return;
    }
    
    let coords = userCoords;
    if (isGeolocationEnabled && !coords) {
      try {
        coords = await getUserLocation();
      } catch (error: any) {
        setErrorMessage(error.message);
        setPageState('error');
        return;
      }
    }

    setLoading(true);
    setPageState('idle');
    const result = await checkInscricao(formacao.id, cpf, coords ?? undefined);
    setLoading(false);
    
    setFormacaoName(result.formacao_name || formacao.name);

    if (result.status === 'FOUND') {
      const { inscricao } = result;
      const registrationData = {
          inscricao_id: inscricao.id,
          nome_completo: inscricao.nome_completo,
          cpf: cpf,
      };
      await handleFullRegistration(registrationData, coords ?? undefined);

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
  
  const handleFullRegistration = async (formData: any, coords?: Coordinates) => {
      setLoading(true);
      const result = await registerFrequency(formacao.id, formData, coords);
      if (result.success) {
          setUserName(result.nome_completo || '');
          setFormacaoName(formacao.name);
          setRegistrationPeriod(result.periodo || null);
          setRegistrationTime(new Date());
          setShowAvaliacaoPrompt(result.showAvaliacaoPrompt || false);
          setPageState('success');
      } else {
          setErrorMessage(result.error || 'Não foi possível registrar sua frequência.');
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
      const periodText = registrationPeriod === 'MAT' ? 'matutino' : 'vespertino';
      const timeText = registrationTime ? format(registrationTime, 'HH:mm:ss') : '';

      return (
           <SuccessCard title="Frequência Registrada!">
                <div className="space-y-2 text-center">
                    <p className="text-lg text-muted-foreground">
                        Bem-vindo(a), <span className="font-bold text-foreground">{userName}</span>!
                    </p>
                    <p className="text-muted-foreground">Sua presença na formação <strong>{formacaoName}</strong> foi confirmada com sucesso.</p>
                     {registrationPeriod && registrationTime && (
                        <p className="text-sm text-muted-foreground pt-2">
                            Frequência para o período <strong>{periodText}</strong> registrada às <strong>{timeText}</strong>.
                        </p>
                    )}
                </div>
                {showAvaliacaoPrompt && (
                    <CountdownRedirect formacaoId={formacao.id} cpf={cpf} />
                )}
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
  
  if (pageState === 'getting_location') {
      return (
           <Card className="w-full max-w-lg mx-auto">
              <CardContent className="text-center p-8">
                  <Loader2 className="h-10 w-10 text-primary animate-spin mx-auto mb-4" />
                  <p className="font-semibold text-lg">Obtendo sua localização...</p>
                  <p className="text-muted-foreground text-sm">Por favor, aguarde.</p>
              </CardContent>
           </Card>
      );
  }

  if (pageState === 'registering') {
      return <FrequenciaInscricaoForm formacao={formacao} cpf={cpf} onSubmit={(data) => handleFullRegistration(data, userCoords ?? undefined)} loading={loading} />
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
        {isGeolocationEnabled && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground bg-secondary p-3 rounded-md">
                <MapPin className="h-4 w-4"/>
                <span>Este evento requer sua localização para o registro.</span>
            </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="cpf">CPF</Label>
          <Input
            id="cpf"
            placeholder="000.000.000-00"
            value={cpf}
            onChange={(e) => setCpf(formatCPF(e.target.value))}
            disabled={loading}
            type="tel"
            inputMode="numeric"
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
