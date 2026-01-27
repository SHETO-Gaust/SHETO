'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
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
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2 } from 'lucide-react';
import type { Formacao } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';

const setupSchema = z.object({
  formationId: z.string({ required_error: 'Selecione uma formação.' }),
  roomCount: z.coerce.number().min(1, 'Deve haver pelo menos 1 sala.'),
  participantsPerRoom: z.coerce.number().min(1, 'Deve haver pelo menos 1 participante por sala.'),
  source: z.enum(['system', 'sheet'], { required_error: 'Selecione a fonte dos participantes.' }),
});

type SetupFormValues = z.infer<typeof setupSchema>;

type EnsalamentoSetupProps = {
  formations: Pick<Formacao, 'id' | 'name'>[];
  onProcess: (data: SetupFormValues & { file?: File | null }) => void;
};

export function EnsalamentoSetup({ formations, onProcess }: EnsalamentoSetupProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const form = useForm<SetupFormValues>({
    resolver: zodResolver(setupSchema),
  });

  const dataSource = form.watch('source');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
    }
  };

  const onSubmit = (data: SetupFormValues) => {
    if (data.source === 'sheet' && !file) {
      toast({
        title: 'Arquivo não selecionado',
        description: 'Por favor, selecione uma planilha para continuar.',
        variant: 'destructive',
      });
      return;
    }
    setLoading(true);
    // Simulate processing
    setTimeout(() => {
      onProcess({ ...data, file });
      setLoading(false);
    }, 1000);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Passo 1: Configuração Inicial do Ensalamento</CardTitle>
        <CardDescription>
          Selecione a formação, defina a estrutura das salas e escolha a origem da lista de participantes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="formationId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Formação</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a formação para ensalar" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {formations.length > 0 ? (
                        formations.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)
                      ) : (
                        <SelectItem value="none" disabled>Nenhuma formação ativa encontrada</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="roomCount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantidade de Salas</FormLabel>
                    <FormControl>
                      <Input type="number" min="1" placeholder="Ex: 5" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="participantsPerRoom"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pessoas por Sala</FormLabel>
                    <FormControl>
                      <Input type="number" min="1" placeholder="Ex: 30" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="source"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel>Fonte dos Participantes</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      className="flex flex-col md:flex-row gap-4"
                    >
                      <FormItem className="flex-1">
                        <Label className="flex flex-col items-center justify-center p-4 border-2 rounded-md cursor-pointer has-[:checked]:border-primary">
                          <FormControl>
                            <RadioGroupItem value="system" className="sr-only" />
                          </FormControl>
                          <span className="text-lg font-semibold">Inscritos no Sistema</span>
                          <span className="text-sm text-muted-foreground text-center mt-1">
                            Utilizar a lista de participantes já inscritos nesta formação. (Recomendado)
                          </span>
                        </Label>
                      </FormItem>
                      <FormItem className="flex-1">
                         <Label className="flex flex-col items-center justify-center p-4 border-2 rounded-md cursor-pointer has-[:checked]:border-primary">
                          <FormControl>
                            <RadioGroupItem value="sheet" className="sr-only" />
                          </FormControl>
                          <span className="text-lg font-semibold">Planilha (.xlsx)</span>
                           <span className="text-sm text-muted-foreground text-center mt-1">
                            Fazer o upload de uma lista de participantes a partir de um arquivo.
                          </span>
                        </Label>
                      </FormItem>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {dataSource === 'sheet' && (
              <FormItem>
                  <FormLabel>Arquivo da Planilha</FormLabel>
                  <FormControl>
                      <Input type="file" accept=".xlsx,.xls" onChange={handleFileChange} />
                  </FormControl>
                  <FormMessage />
              </FormItem>
            )}

            <div className="flex justify-end">
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Processar e Continuar
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
