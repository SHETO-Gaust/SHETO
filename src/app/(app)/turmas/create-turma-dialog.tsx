
'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { upsertTurma } from './actions';
import type { Serie } from '@/lib/types';

const formSchema = z.object({
  id: z.string().optional(),
  escola_id: z.coerce.string().min(1),
  serie_id: z.string({ required_error: 'Selecione um modelo de série.' }),
  nome: z.string().min(1, 'O nome/letra da turma é obrigatório.'),
});

type FormValues = z.infer<typeof formSchema>;

type Props = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  escolaId: string | number;
  series: Serie[];
  onTurmaCreated: () => void;
};

export function CreateTurmaDialog({ isOpen, setIsOpen, escolaId, series, onTurmaCreated }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      escola_id: String(escolaId),
      nome: '',
      serie_id: undefined,
    },
  });

  // CORREÇÃO 1: Destrava o mouse no Next 15/Radix
  useEffect(() => {
    if (isOpen) {
      document.body.style.pointerEvents = 'auto';
      form.reset({
        escola_id: String(escolaId),
        nome: '',
        serie_id: undefined
      });
    }
  }, [isOpen, form, escolaId]);

  const onSubmit = async (data: FormValues) => {
    console.log("🚀 Submit disparado:", data);
    setLoading(true);
    try {
      const result = await upsertTurma(data);
      if (result.error) {
        toast({ title: 'Erro', description: result.error, variant: 'destructive' });
        return;
      }
      toast({ title: 'Sucesso', description: `Turma criada com sucesso.` });
      onTurmaCreated();
      setIsOpen(false);
    } catch (err) {
      console.error("❌ Erro na Action:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {/* CORREÇÃO 2: pointer-events-auto forçado na camada do Dialog */}
      <DialogContent onPointerDownOutside={(e) => e.preventDefault()} className="sm:max-w-[425px] pointer-events-auto">
        <DialogHeader>
          <DialogTitle>Nova Turma</DialogTitle>
          <DialogDescription>Crie uma nova turma a partir de um modelo de série.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form 
            id="create-turma-form" 
            // CORREÇÃO 3: Log de erros para debug caso o Zod bloqueie
            onSubmit={form.handleSubmit(onSubmit, (errors) => console.log("⚠️ Erros de validação:", errors))} 
            className="space-y-4 py-4"
          >
            <FormField
              control={form.control}
              name="serie_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Modelo de Série</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {series.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="nome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome/Letra da Turma</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ''} placeholder="Ex: A, B, C, ou Única" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>Cancelar</Button>
          {/* Botão com clique físico logado para teste */}
          <Button 
            type="submit" 
            form="create-turma-form" 
            disabled={loading}
            onClick={() => console.log("🖱️ Botão clicado")}
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Criar Turma'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
