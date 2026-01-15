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
import { useState } from 'react';
import { createInscricao } from '@/app/(public)/inscricoes/actions';
import { REGIONAIS, ESCOLAS_POR_REGIONAL } from '@/lib/escolas-mock';
import type { Formacao } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { useRouter } from 'next/navigation';


const generateSchema = (formConfig: any) => {
    let schema: any = {
        nomeCompleto: z.string().min(3, 'Nome completo é obrigatório.'),
        cpf: z.string().length(14, 'CPF inválido.'),
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


export function InscricaoForm({ formacao }: { formacao: Formacao }) {
  const { toast } = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  
  const formSchema = generateSchema(formacao.subscription_form_config);
  type InscricaoFormValues = z.infer<typeof formSchema>;

  const form = useForm<InscricaoFormValues>({
    resolver: zodResolver(formSchema),
    mode: 'onChange',
  });

  const selectedRegional = form.watch('regional');
  const selectedLotacao = form.watch('lotacao');

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

  return (
    <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
            <CardTitle className="text-2xl">Formulário de Inscrição</CardTitle>
            <CardDescription>
                Preencha seus dados para se inscrever na formação <span className="font-semibold">{formacao.name}</span>.
            </CardDescription>
        </CardHeader>
        <CardContent>
            <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                {formConfig.fields.map((field: any) => {
                    if (field.hidden) return null;
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
                                            <Input placeholder="Seu nome completo" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            );
                        case 'cpf':
                             return (
                                <FormField
                                    key={field.id}
                                    control={form.control}
                                    name="cpf"
                                    render={({ field }) => (
                                        <FormItem>
                                        <FormLabel>CPF</FormLabel>
                                        <FormControl>
                                            <Input 
                                                placeholder="000.000.000-00" 
                                                {...field} 
                                                onChange={e => field.onChange(formatCPF(e.target.value))}
                                            />
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
                                            <Input placeholder="seu.email@exemplo.com" {...field} />
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
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Selecione sua regional" />
                                            </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {REGIONAIS.map(regional => (
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
                                            defaultValue={field.value}
                                            className="flex flex-col space-y-1"
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
                                <Input placeholder="Ex: Supervisão, setor, etc." {...field} />
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
                            <Select onValueChange={field.onChange} defaultValue={field.value} disabled={!selectedRegional}>
                                <FormControl>
                                <SelectTrigger>
                                    <SelectValue placeholder={!selectedRegional ? "Selecione uma regional primeiro" : "Selecione sua escola"} />
                                </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {(ESCOLAS_POR_REGIONAL[selectedRegional] || []).map(escola => (
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
                                        <Input {...formField} />
                                     </FormControl>
                                )}
                                {(field.type === 'multiple-choice') && (
                                    <FormControl>
                                        <RadioGroup
                                            onValueChange={formField.onChange}
                                            defaultValue={formField.value}
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

                <Button type="submit" disabled={loading} className="w-full">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Finalizar Inscrição
                </Button>
            </form>
            </Form>
        </CardContent>
    </Card>
  );
}
