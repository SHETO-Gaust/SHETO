'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2 } from 'lucide-react';
import type { Inscricao } from '@/lib/types';
import { Label } from '@/components/ui/label';

const criteriaSchema = z.object({
  criterion: z.string({ required_error: 'Selecione um critério de agrupamento.' }),
  strategy: z.enum(['exclusividade', 'preferencial'], {
    required_error: 'Selecione uma estratégia.',
  }),
});

type CriteriaFormValues = z.infer<typeof criteriaSchema>;

type EnsalamentoCriteriaProps = {
  participants: Inscricao[];
  onGenerate: (data: CriteriaFormValues) => void;
};

const formatLabel = (key: string) => {
    return key
        .replace(/_/g, ' ')
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (str) => str.toUpperCase())
        .trim();
}

export function EnsalamentoCriteria({ participants, onGenerate }: EnsalamentoCriteriaProps) {
  const [loading, setLoading] = React.useState(false);
  const [criteriaOptions, setCriteriaOptions] = React.useState<string[]>([]);
  
  React.useEffect(() => {
    if (participants.length > 0) {
        const allKeys = new Set<string>();
        participants.forEach(p => {
            Object.keys(p).forEach(k => {
                if (!['id', 'formacao_id', 'created_at', 'dados', 'fonte'].includes(k)) {
                    allKeys.add(k);
                }
            });
            if (p.dados) {
                Object.keys(p.dados).forEach(k => allKeys.add(k));
            }
        });
       setCriteriaOptions(Array.from(allKeys));
    }
  }, [participants]);

  const form = useForm<CriteriaFormValues>({
    resolver: zodResolver(criteriaSchema),
  });

  const onSubmit = (data: CriteriaFormValues) => {
    setLoading(true);
    setTimeout(() => {
      onGenerate(data);
      setLoading(false);
    }, 1000);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Passo 2: Definição de Critérios</CardTitle>
        <CardDescription>
          Escolha como os {participants.length} participantes serão agrupados nas salas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="criterion"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Critério Principal de Agrupamento</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o critério" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {criteriaOptions.length > 0 ? (
                        criteriaOptions.map(key => <SelectItem key={key} value={key}>{formatLabel(key)}</SelectItem>)
                      ) : (
                        <SelectItem value="none" disabled>Nenhum critério disponível</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="strategy"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel>Estratégia de Agrupamento</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      className="flex flex-col gap-4"
                    >
                      <FormItem className="flex-1">
                         <Label className="flex flex-col p-4 border-2 rounded-md cursor-pointer has-[:checked]:border-primary">
                          <FormControl>
                            <RadioGroupItem value="exclusividade" className="sr-only" />
                          </FormControl>
                          <span className="font-semibold">Exclusividade</span>
                          <span className="text-sm text-muted-foreground mt-1">
                            Monta salas apenas com participantes que compartilham o mesmo valor para o critério (ex: salas apenas com pessoas da mesma regional).
                          </span>
                        </Label>
                      </FormItem>
                      <FormItem className="flex-1">
                         <Label className="flex flex-col p-4 border-2 rounded-md cursor-pointer has-[:checked]:border-primary">
                          <FormControl>
                            <RadioGroupItem value="preferencial" className="sr-only" />
                          </FormControl>
                          <span className="font-semibold">Preferencial</span>
                           <span className="text-sm text-muted-foreground mt-1">
                            Tenta agrupar por critério, mas pode misturar participantes para preencher as salas e evitar que fiquem vazias.
                          </span>
                        </Label>
                      </FormItem>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end">
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Gerar Ensalamento
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
