'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { createInscricao, fetchErgonDataByCpf } from '@/app/(public)/inscricoes/actions';
import { getRegionais, getEscolasPorRegional } from '@/lib/escolas';
import type { Formacao } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { useRouter } from 'next/navigation';
import { validateCPF } from '@/lib/utils';
import { cn } from '@/lib/utils';


const generateSchema = (formConfig: any) => {
    let schema: any = {
        nomeCompleto: z.string().min(3, 'Nome completo é obrigatório.'),
        cpf: z.string().length(14, 'CPF inválido.').refine(validateCPF, 'CPF inválido.'),
        email: z.string().email('Email inválido.'),
    };

    if (formConfig?.fields.find((f: any) => f.id === 'regional' && !f.hidden)) {
        schema.regional = z.string({ required_error: 'Selecione uma regional.' });
    }
    
    if (formConfig?.fields.find((f: any) => f.id === 'lotacao' && !f.hidden)) {
        schema.lotacao = z.enum(['sre', 'sede', 'ue'], { required_error: 'Selecione uma lotação.'});
        schema.lotacao_especifica = z.string().optional();
        schema.escola = z.string().optional();
    }

    formConfig?.customFields?.forEach((field: any) => {
        if (field.type === 'text') {
            schema[field.id] = z.string().optional();
        } else if (field.type === 'multiple-choice') {
            schema[field.id] = z.string().optional();
        } else if (field.type === 'checkboxes') {
            schema[field.id] = z.array(z.string()).optional();
        }
    });
    
    return z.object(schema).refine(
        (data) => {
            if (data.lotacao === 'ue') {
                return !!data.escola;
            }
            if (data.lotacao === 'sre' || data.lotacao === 'sede') {
                 return !!data.lotacao_especifica && data.lotacao_especifica.length > 0;
            }
            return true;
        }, {
            message: 'Campo obrigatório.',
            path: ['lotacao_especifica'],
        }
    );
};

const initialValues = {
  nomeCompleto: '',
  cpf: '',
  email: '',
  regional: undefined,
  lotacao: undefined,
  lotacao_especifica: '',
  escola: undefined,
};


export function InscricaoForm({ formacao }: { formacao: Formacao }) {
  const { toast } = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isCpfLoading, setIsCpfLoading] = useState(false);
  const [isCpfValidated, setIsCpfValidated] = useState(false);
  const [ergonData, setErgonData] = useState<any>(null);
  
  const formSchema = useMemo(() => generateSchema(formacao.subscription_form_config), [formacao.subscription_form_config]);
  type InscricaoFormValues = z.infer<typeof formSchema>;

  const form = useForm<InscricaoFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialValues as any,
    mode: 'onChange',
  });
  
  const [regionais, setRegionais] = useState<string[]>([]);
  const [escolas, setEscolas] = useState<string[]>([]);
  const [loadingRegionais, setLoadingRegionais] = useState(true);
  const [loadingEscolas, setLoadingEscolas] = useState(false);

  const selectedRegional = form.watch('regional');
  const selectedLotacao = form.watch('lotacao');
  const cpfValue = form.watch('cpf');

  // Efeito para buscar dados do Ergon via CPF
  useEffect(() => {
    const rawCpf = cpfValue?.replace(/\D/g, '') || '';
    if (rawCpf.length === 11) {
      const timer = setTimeout(() => {
        const fetchData = async () => {
          setIsCpfLoading(true);
          const result = await fetchErgonDataByCpf(cpfValue);
          setIsCpfLoading(false);

          if (result.data) {
            setErgonData(result.data);
            setIsCpfValidated(true);
            toast({
              title: "Dados encontrados!",
              description: "Seu nome e email foram preenchidos. Por favor, confirme ou complete os demais campos."
            });
          } else {
             setErgonData(null);
             if (result.error) {
                setIsCpfValidated(false);
                toast({
                  title: "Erro na consulta de CPF",
                  description: result.error,
                  variant: 'destructive',
                });
             } else {
                 setIsCpfValidated(true); 
                 toast({
                    title: "CPF não encontrado",
                    description: "Por favor, preencha o formulário manualmente.",
                    variant: 'default',
                });
             }
          }
        };
        fetchData();
      }, 500); 

      return () => clearTimeout(timer);
    } else {
        setIsCpfValidated(false);
        setErgonData(null);
        const currentCpf = form.getValues('cpf');
        form.reset(initialValues as any);
        form.setValue('cpf', currentCpf);
    }
  }, [cpfValue, form, toast]);
  
  // Efeito para preencher o formulário após a busca no Ergon
  useEffect(() => {
    if (ergonData && regionais.length > 0) {
      form.setValue('nomeCompleto', ergonData.nome || '', {
        shouldValidate: true,
      });
      form.setValue('email', ergonData.email || '', { shouldValidate: true });

      const vinculo = ergonData.vinculos?.[0];
      if (vinculo) {
        const apiRegional = vinculo.regional;
        const setorNome = vinculo.setorNome?.trim().toLowerCase();

        let regionalToSet: string | undefined = undefined;

        if (apiRegional === 'PALMAS_SEDE') {
          regionalToSet = regionais.find(
            (r) => r.toLowerCase() === 'palmas'
          );
          form.setValue('lotacao', 'sede', { shouldValidate: true });
          form.setValue('lotacao_especifica', vinculo.setorNome, {
            shouldValidate: true,
          });
        } else if (setorNome.includes('superintendência regional')) {
          form.setValue('lotacao', 'sre', { shouldValidate: true });
          form.setValue('lotacao_especifica', vinculo.setorNome, {
            shouldValidate: true,
          });

          // Tenta extrair a regional do nome do setor
          const match = vinculo.setorNome.match(/de\s(.*)$/i);
          if (match && match[1]) {
            const extractedRegional = match[1].trim().toLowerCase();
            regionalToSet = regionais.find(
              (r) => r.toLowerCase() === extractedRegional
            );
          }

          // Fallback para a regional principal se a extração falhar
          if (!regionalToSet) {
            regionalToSet = regionais.find(
              (r) => r.toLowerCase() === apiRegional.toLowerCase()
            );
          }
        } else {
          // Assume que é uma unidade escolar
          form.setValue('lotacao', 'ue', { shouldValidate: true });
           regionalToSet = regionais.find(
            (r) => r.toLowerCase() === apiRegional.toLowerCase()
          );
        }

        if (regionalToSet) {
          form.setValue('regional', regionalToSet, { shouldValidate: true });
        }
      }
    }
  }, [ergonData, form, regionais]);

  useEffect(() => {
    const fetchRegionais = async () => {
        setLoadingRegionais(true);
        const data = await getRegionais();
        setRegionais(data);
        setLoadingRegionais(false);
    };
    fetchRegionais();
  }, []);

  useEffect(() => {
    if (selectedRegional) {
        const fetchEscolas = async () => {
            setLoadingEscolas(true);
            if (!ergonData || form.getValues('lotacao') !== 'ue') {
                form.setValue('escola', undefined, { shouldValidate: true });
            }
            const data = await getEscolasPorRegional(selectedRegional);
            setEscolas(data);
            setLoadingEscolas(false);
            
            if (ergonData && ergonData.vinculos?.[0] && form.getValues('lotacao') === 'ue') {
                const setorNomeFromApi = ergonData.vinculos[0].setorNome?.trim().toLowerCase();
                if (setorNomeFromApi) {
                    const matchingSchool = data.find(schoolName => schoolName.trim().toLowerCase() === setorNomeFromApi);
                    if (matchingSchool) {
                        form.setValue('escola', matchingSchool, { shouldValidate: true });
                    }
                }
            }
        };
        fetchEscolas();
    } else {
        setEscolas([]);
    }
  }, [selectedRegional, form, ergonData]);

  const formatCPF = (value: string) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})/, '$1-$2')
      .slice(0, 14);
  };
  
  const onSubmit = async (data: InscricaoFormValues) => {
    setLoading(true);
    
    const { nomeCompleto, cpf, email, ...dados } = data;
    const submissionData = {
        formacao_id: formacao.id,
        nome_completo: nomeCompleto,
        cpf: cpf,
        email: email,
        dados: dados,
    };

    const result = await createInscricao(submissionData as any);
    setLoading(false);

    if (result.error) {
       toast({
        title: 'Erro ao realizar inscrição',
        description: result.error,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Inscrição Realizada com Sucesso!',
        description: 'Sua inscrição foi confirmada. Verifique seu email.',
      });
      setSuccess(true);
    }
  };

  const formConfig = formacao.subscription_form_config;
  if (!formConfig) return <p>Erro: Configuração do formulário não encontrada.</p>;

  if (success) {
      return (
        <Card className="w-full max-w-2xl mx-auto">
            <CardHeader className="text-center">
                <CardTitle className="text-2xl">Inscrição Realizada com Sucesso!</CardTitle>
                <CardDescription>
                    Você está inscrito(a) na formação <strong>{formacao.name}</strong>.
                    Enviamos um email de confirmação para você.
                </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
                <Button onClick={() => router.push('/inscricoes')}>
                    Voltar para lista de formações
                </Button>
            </CardContent>
        </Card>
      )
  }

  const formFieldsDisabled = !isCpfValidated;

  return (
    <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
            <CardTitle className="text-2xl">Formulário de Inscrição</CardTitle>
            <CardDescription>
                Preencha seu CPF para buscar seus dados ou preencha manualmente para se inscrever na formação <span className="font-semibold text-foreground">{formacao.name}</span>.
            </CardDescription>
        </CardHeader>
        <CardContent>
            <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                <FormField
                    control={form.control}
                    name="cpf"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>CPF</FormLabel>
                        <FormControl>
                            <div className="relative">
                                <Input 
                                    placeholder="000.000.000-00" 
                                    {...field} 
                                    onChange={e => field.onChange(formatCPF(e.target.value))}
                                    type="tel"
                                    inputMode="numeric"
                                />
                                {isCpfLoading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin" />}
                            </div>
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                />

                <fieldset disabled={formFieldsDisabled} className="space-y-8 disabled:opacity-50">
                    {formConfig.fields.map((field: any) => {
                        if (field.hidden || field.id === 'cpf') return null;
                        switch (field.id) {
                            case 'nomeCompleto':
                                return (
                                    <FormField
                                        key={field.id}
                                        control={form.control}
                                        name="nomeCompleto"
                                        render={({ field }) => (
                                            <FormItem>
                                            <FormLabel>Nome Completo</FormLabel>
                                            <FormControl>
                                                <Input placeholder="Seu nome completo" {...field} readOnly={!!ergonData} className={cn(ergonData && 'bg-muted/50')} />
                                            </FormControl>
                                            <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                );
                            case 'email':
                                return (
                                    <FormField
                                        key={field.id}
                                        control={form.control}
                                        name="email"
                                        render={({ field }) => (
                                            <FormItem>
                                            <FormLabel>Email</FormLabel>
                                            <FormControl>
                                                <Input placeholder="seu.email@exemplo.com" {...field} readOnly={!!ergonData} className={cn(ergonData && 'bg-muted/50')} />
                                            </FormControl>
                                            <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                );
                            case 'regional':
                                return (
                                    <FormField
                                        key={field.id}
                                        control={form.control}
                                        name="regional"
                                        render={({ field }) => (
                                            <FormItem>
                                            <FormLabel>Regional</FormLabel>
                                            <Select onValueChange={field.onChange} value={field.value} disabled={loadingRegionais || !!ergonData}>
                                                <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder={loadingRegionais ? "Carregando..." : "Selecione sua regional"} />
                                                </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {regionais.map(regional => (
                                                        <SelectItem key={regional} value={regional}>{regional}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                );
                            case 'lotacao':
                                return (
                                    <FormField
                                        key={field.id}
                                        control={form.control}
                                        name="lotacao"
                                        render={({ field }) => (
                                            <FormItem className="space-y-3">
                                            <FormLabel>Lotação</FormLabel>
                                            <FormControl>
                                                <RadioGroup
                                                onValueChange={field.onChange}
                                                value={field.value}
                                                className="flex flex-col space-y-1"
                                                disabled={!!ergonData}
                                                >
                                                <FormItem className="flex items-center space-x-3 space-y-0">
                                                    <FormControl>
                                                    <RadioGroupItem value="sre" />
                                                    </FormControl>
                                                    <FormLabel className="font-normal">
                                                    Superintendência Regional
                                                    </FormLabel>
                                                </FormItem>
                                                <FormItem className="flex items-center space-x-3 space-y-0">
                                                    <FormControl>
                                                    <RadioGroupItem value="sede" />
                                                    </FormControl>
                                                    <FormLabel className="font-normal">
                                                    SEDUC Sede
                                                    </FormLabel>
                                                </FormItem>
                                                <FormItem className="flex items-center space-x-3 space-y-0">
                                                    <FormControl>
                                                    <RadioGroupItem value="ue" />
                                                    </FormControl>
                                                    <FormLabel className="font-normal">
                                                    Unidade Escolar
                                                    </FormLabel>
                                                </FormItem>
                                                </RadioGroup>
                                            </FormControl>
                                            <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                );
                            default:
                                return null;
                        }
                    })}

                    {(selectedLotacao === 'sre' || selectedLotacao === 'sede') && (
                        <FormField
                            control={form.control}
                            name="lotacao_especifica"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel>Especifique sua lotação</FormLabel>
                                <FormControl>
                                    <Input placeholder="Ex: Supervisão, setor, etc." {...field} readOnly={!!ergonData} className={cn(ergonData && 'bg-muted/50')} />
                                </FormControl>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                    )}
                    {selectedLotacao === 'ue' && (
                        <FormField
                            control={form.control}
                            name="escola"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel>Unidade Escolar</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value} disabled={!selectedRegional || loadingEscolas || !!ergonData}>
                                    <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder={
                                            loadingEscolas ? "Carregando escolas..." :
                                            !selectedRegional ? "Selecione uma regional primeiro" : "Selecione sua escola"
                                        } />
                                    </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {escolas.map(escola => (
                                            <SelectItem key={escola} value={escola}>{escola}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                    )}

                    {/* Custom Fields */}
                    {formConfig.customFields?.map((field: any) => (
                        <FormField
                            key={field.id}
                            control={form.control}
                            name={field.id}
                            render={({ field: formField }) => (
                                <FormItem>
                                    <FormLabel>{field.label}</FormLabel>
                                    {field.type === 'text' && (
                                        <FormControl>
                                            <Input {...formField} value={formField.value || ''} />
                                        </FormControl>
                                    )}
                                    {(field.type === 'multiple-choice') && (
                                        <FormControl>
                                            <RadioGroup
                                                onValueChange={formField.onChange}
                                                value={formField.value}
                                                className="flex flex-col space-y-1"
                                            >
                                                {field.options.map((option: string) => (
                                                    <FormItem key={option} className="flex items-center space-x-3 space-y-0">
                                                        <FormControl><RadioGroupItem value={option} /></FormControl>
                                                        <FormLabel className="font-normal">{option}</FormLabel>
                                                    </FormItem>
                                                ))}
                                            </RadioGroup>
                                        </FormControl>
                                    )}
                                    {field.type === 'checkboxes' && (
                                        <div className="space-y-2">
                                        {field.options.map((option: string) => (
                                            <Controller
                                                key={option}
                                                control={form.control}
                                                name={field.id}
                                                render={({ field: controllerField }) => {
                                                    const fieldValue = controllerField.value || [];
                                                    return (
                                                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                                            <FormControl>
                                                                <Checkbox
                                                                    checked={fieldValue.includes(option)}
                                                                    onCheckedChange={(checked) => {
                                                                        return checked
                                                                            ? controllerField.onChange([...fieldValue, option])
                                                                            : controllerField.onChange(
                                                                                fieldValue.filter(
                                                                                    (value: string) => value !== option
                                                                                )
                                                                            );
                                                                    }}
                                                                />
                                                            </FormControl>
                                                            <FormLabel className="font-normal">
                                                                {option}
                                                            </FormLabel>
                                                        </FormItem>
                                                    )
                                                }}
                                            />
                                        ))}
                                        </div>
                                    )}
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    ))}
                </fieldset>

                <Button type="submit" disabled={loading || formFieldsDisabled} className="w-full">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Finalizar Inscrição
                </Button>
            </form>
            </Form>
        </CardContent>
    </Card>
  );
}
