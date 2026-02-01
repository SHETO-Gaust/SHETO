
'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { upsertNivelEnsino } from './actions';
import type { NivelEnsino } from '@/lib/types';

const formSchema = z.object({
  id: z.string().optional(),
  escola_id: z.string().min(1),
  nome: z.string().min(3, "O nome deve ter pelo menos 3 caracteres."),
  sigla: z.string().min(1, "A sigla é obrigatória."),
});

type FormValues = z.infer<typeof formSchema>;

type Props = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  nivelEnsino: NivelEnsino | null;
  escolaId: string;
  onNivelUpdated: (nivel: NivelEnsino) => void;
};

export function EditEnsinoSheet({ isOpen, setIsOpen, nivelEnsino, escolaId, onNivelUpdated }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const isEdit = !!nivelEnsino;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      escola_id: escolaId,
      nome: '',
      sigla: '',
    },
  });

  useEffect(() => {
    if (isOpen) {
      form.reset({
        id: nivelEnsino?.id,
        escola_id: escolaId,
        nome: nivelEnsino?.nome ?? '',
        sigla: nivelEnsino?.sigla ?? '',
      });
    }
  }, [isOpen, nivelEnsino, escolaId, form]);

  const onSubmit = async (data: FormValues) => {
    setLoading(true);
    const result = await upsertNivelEnsino(data);
    setLoading(false);

    if (result?.error) {
      toast({ title: 'Erro', description: result.error, variant: 'destructive' });
      return;
    }

    toast({ 
        title: isEdit ? 'Etapa atualizada' : 'Etapa criada', 
        description: `A etapa "${data.nome}" foi salva com sucesso.` 
    });
    
    if (result.data) {
        onNivelUpdated(result.data);
    }
    setIsOpen(false);
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent className="sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>
            {isEdit ? 'Editar Etapa de Ensino' : 'Nova Etapa de Ensino'}
          </SheetTitle>
          <SheetDescription>
            {isEdit ? 'Altere o nome e a sigla da etapa.' : 'Crie uma nova etapa de ensino para sua escola.'}
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex-1 space-y-6 overflow-y-auto p-1">
            <FormField
              control={form.control}
              name="nome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome da Etapa</FormLabel>
                  <FormControl><Input {...field} placeholder="Ex: Ensino Fundamental I" /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="sigla"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sigla</FormLabel>
                  <FormControl><Input {...field} placeholder="Ex: EF-I" /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>

        <SheetFooter className="mt-auto border-t pt-4">
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={form.handleSubmit(onSubmit)} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Salvar'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
