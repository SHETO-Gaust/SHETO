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
import { useState, useEffect } from 'react';
import { updateInscricao } from '@/app/(app)/gerenciamento/actions';
import { getRegionais, getEscolasPorRegional } from '@/lib/escolas';
import type { Formacao, Inscricao } from '@/lib/types';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetFooter } from '../ui/sheet';

const generateSchema = (formConfig: any) => {
    let schema: any = {
        id: z.string(),
        nome_completo: z.string().min(3, 'Nome completo é obrigatório.'),
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


export function EditInscricaoSheet({ isOpen, setIsOpen, inscricao, formacao }: { isOpen: boolean, setIsOpen: (open: boolean) => void, inscricao: Inscricao, formacao: Formacao }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  
  const formSchema = generateSchema(formacao.subscription_form_config);
  type InscricaoFormValues = z.infer<typeof formSchema>;

  const form = useForm<InscricaoFormValues>({
    resolver: zodResolver(formSchema),
    mode: 'onChange',
  });

  useEffect(() => {
    if (inscricao) {
        form.reset({
            id: inscricao.id,
            nome_completo: inscricao.nome_completo,
            cpf: inscricao.cpf,
            email: inscricao.email,
            ...(inscricao.dados || {})
        } as any);
    }
  }, [inscricao, form]);

  const [regionais, setRegionais] = useState<string[]>([]);
  const [escolas, setEscolas] = useState<string[]>([]);
  const [loadingRegionais, setLoadingRegionais] = useState(true);
  const [loadingEscolas, setLoadingEscolas] = useState(false);

  const selectedRegional = form.watch('regional');
  const selectedLotacao = form.watch('lotacao');

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
    const subscription = form.watch((value, { name, type }) => {
      if (name === 'regional' && type === 'change') {
        form.setValue('escola', undefined, { shouldValidate: true });
      }
    });
    return () => subscription.unsubscribe();
  }, [form]);

  useEffect(() => {
    if (selectedRegional) {
        const fetchEscolas = async () => {
            setLoadingEscolas(true);
            const data = await getEscolasPorRegional(selectedRegional);
            setEscolas(data);
            setLoadingEscolas(false);
        };
        fetchEscolas();
    } else {
        setEscolas([]);
    }
  }, [selectedRegional]);

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
    
    const { id, nome_completo, cpf, email, ...dados } = data;
    const submissionData = {
        id,
        nome_completo,
        cpf,
        email,
        dados: dados,
    };

    const result = await updateInscricao(submissionData as any);
    setLoading(false);

    if (result.error) {
       toast({
        title: 'Erro ao atualizar inscrição',
        description: result.error,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Inscrição Atualizada!',
        description: 'Os dados foram atualizados com sucesso.',
      });
      setIsOpen(false);
    }
  };

  const formConfig = formacao.subscription_form_config;
  if (!formConfig) return <p>Erro: Configuração do formulário não encontrada.</p>;

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent className="w-full sm:max-w-2xl flex flex-col">
        <SheetHeader>
            <SheetTitle>Editar Inscrição</SheetTitle>
            <SheetDescription>
                Altere os dados de {inscricao.nome_completo} para a formação {formacao.name}.
            </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto pr-6 pl-1 py-4">
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
                                    name="nome_completo"
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
                                        <Select onValueChange={field.onChange} value={field.value} disabled={loadingRegionais}>
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
                            <Select onValueChange={field.onChange} value={field.value} disabled={!selectedRegional || loadingEscolas}>
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
            </form>
        </Form>
        </div>
        <SheetFooter className="mt-auto pt-4 border-t">
          <Button variant="outline" onClick={() => setIsOpen(false)}>Cancelar</Button>
          <Button onClick={form.handleSubmit(onSubmit)} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar Alterações
          </Button>
        </SheetFooter>
    </SheetContent>
    </Sheet>
  );
}
