'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Formacao, Inscricao, Formador } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, AlertTriangle, CheckCircle, UserCheck, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { checkParticipantForAvaliacao } from '../../actions';
import { AvaliacaoForm } from './avaliacao-form';

type Step = 'cpf' | 'select_formadores' | 'form' | 'success' | 'error';

const formatCPF = (value: string) => {
  return value
    .replace(/\D/g, '')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})/, '$1-$2')
    .slice(0, 14);
};

export function AvaliacaoClientPage({ formacao }: { formacao: Formacao }) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>('cpf');
  const [loading, setLoading] = useState(false);
  const [cpf, setCpf] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const [inscricao, setInscricao] = useState<Inscricao | null>(null);
  const [allFormadores, setAllFormadores] = useState<Formador[]>([]);
  const [selectedFormadores, setSelectedFormadores] = useState<Formador[]>([]);
  const [hasFrequencia, setHasFrequencia] = useState(false);
  const [isFrequenciaOpen, setIsFrequenciaOpen] = useState(false);
  const [periodo, setPeriodo] = useState<'MAT' | 'VESP' | null>(null);

  const handleCpfCheck = async () => {
    if (cpf.length !== 14) {
      toast({ title: 'CPF inválido.', variant: 'destructive' });
      return;
    }
    
    setLoading(true);
    const result = await checkParticipantForAvaliacao(formacao.id, cpf);
    setLoading(false);

    if (result.success) {
        setInscricao(result.inscricao!);
        setAllFormadores(result.formadores!);
        setHasFrequencia(result.hasFrequencia);
        setIsFrequenciaOpen(result.isFrequenciaOpen);
        setPeriodo(result.periodo!);
        setStep('select_formadores');
    } else {
        setErrorMessage(result.error || 'Ocorreu um erro desconhecido.');
        setStep('error');
    }
  };

  const handleSelectFormadores = (formadores: Formador[]) => {
      setSelectedFormadores(formadores);
      setStep('form');
  };

  if (step === 'error') {
      return (
        <Card className="w-full max-w-lg mx-auto border-destructive bg-destructive/5">
            <CardHeader className="text-center">
                <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
                <CardTitle className="text-2xl text-destructive">Acesso Negado</CardTitle>
            </CardHeader>
            <CardContent className="text-center space-y-4">
                <p className="text-muted-foreground">{errorMessage}</p>
                <Button variant="outline" onClick={() => { setStep('cpf'); setCpf(''); }}>Tentar Novamente</Button>
            </CardContent>
        </Card>
      );
  }
  
  if (step === 'success') {
      return (
        <Card className="w-full max-w-lg mx-auto border-green-500 bg-green-50/50">
            <CardHeader className="text-center">
                <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                <CardTitle className="text-2xl">Avaliação Enviada!</CardTitle>
            </CardHeader>
            <CardContent className="text-center space-y-2">
                 <p className="text-lg text-muted-foreground">
                    Obrigado, <span className="font-bold text-foreground">{inscricao?.nome_completo}</span>!
                </p>
                <p>Sua avaliação sobre a formação <strong>{formacao.name}</strong> foi registrada com sucesso.</p>

                { !hasFrequencia && isFrequenciaOpen && (
                    <div className="pt-4 mt-4 border-t">
                         <div className="pt-4 space-y-2">
                             <p className="font-semibold text-orange-600">Ação necessária!</p>
                             <p className="text-muted-foreground text-sm">Percebemos que você ainda não registrou sua frequência. Por favor, faça isso agora.</p>
                             <Link href={`/frequencia/${formacao.id}`} passHref>
                                <Button>
                                    <Clock className="mr-2 h-4 w-4" />
                                    Registrar Frequência
                                </Button>
                            </Link>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
      )
  }

  if (step === 'select_formadores') {
      return <FormadorSelector formadores={allFormadores} onConfirm={handleSelectFormadores} />;
  }

  if (step === 'form') {
      return <AvaliacaoForm 
                formacao={formacao} 
                inscricao={inscricao!} 
                formadoresToRate={selectedFormadores} 
                periodo={periodo!}
                onSuccess={() => setStep('success')}
                showFrequenciaWarning={!hasFrequencia && isFrequenciaOpen}
             />
  }

  return (
    <Card className="w-full max-w-lg mx-auto">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Avaliação: {formacao.name}</CardTitle>
        <CardDescription>
          Para iniciar sua avaliação, por favor, informe seu CPF.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
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
          Verificar
        </Button>
      </CardContent>
    </Card>
  );
}


function FormadorSelector({ formadores, onConfirm }: { formadores: Formador[], onConfirm: (selected: Formador[]) => void }) {
    const [selected, setSelected] = useState<string[]>([]);

    const toggleFormador = (id: string) => {
        setSelected(prev => 
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    }

    const handleConfirm = () => {
        const selectedFormadores = formadores.filter(f => selected.includes(f.id));
        onConfirm(selectedFormadores);
    }

    if (formadores.length === 0) {
        return (
            <Card className="w-full max-w-lg mx-auto">
                <CardHeader>
                    <CardTitle>Nenhum Formador Encontrado</CardTitle>
                    <CardDescription>Não há formadores cadastrados para este período da formação. Não é possível continuar a avaliação.</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    return (
         <Card className="w-full max-w-lg mx-auto">
            <CardHeader>
                <CardTitle>Selecione os Formadores</CardTitle>
                <CardDescription>Escolha um ou mais formadores que você deseja avaliar neste período.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="max-h-60 overflow-y-auto space-y-2 p-1">
                    {formadores.map(formador => (
                        <div key={formador.id} onClick={() => toggleFormador(formador.id)} className={`p-3 rounded-md border flex items-center justify-between cursor-pointer ${selected.includes(formador.id) ? 'bg-primary/10 border-primary' : 'bg-background'}`}>
                            <div>
                                <p className="font-semibold">{formador.name}</p>
                                <p className="text-sm text-muted-foreground">{formador.reference}</p>
                            </div>
                           {selected.includes(formador.id) && <UserCheck className="h-5 w-5 text-primary" />}
                        </div>
                    ))}
                </div>
                 <Button onClick={handleConfirm} className="w-full" disabled={selected.length === 0}>
                    Continuar para Avaliação
                </Button>
            </CardContent>
        </Card>
    );
}
