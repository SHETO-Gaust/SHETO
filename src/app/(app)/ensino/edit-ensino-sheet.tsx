
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
import { Loader2, GraduationCap } from 'lucide-react';
import { upsertNivelEnsino } from './actions';
import type { NivelEnsino } from '@/lib/types';

const formSchema = z.object({
  id: z.string().optional(),
  escola_id: z.coerce.string().min(1),
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

  // CORREÇÃO 1: Definindo isEdit novamente
  const isEdit = !!nivelEnsino;

  // CORREÇÃO 2: Adicionando o hook useForm que estava faltando no seu snippet
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      escola_id: String(escolaId),
      nome: '',
      sigla: '',
    },
  });

  // CORREÇÃO 3: Adicionando o reset para preencher os dados ao editar
  useEffect(() => {
    if (isOpen) {
      form.reset({
        id: nivelEnsino?.id,
        escola_id: String(escolaId),
        nome: nivelEnsino?.nome ?? '',
        sigla: nivelEnsino?.sigla ?? '',
      });
    }
  }, [isOpen, nivelEnsino, escolaId, form]);

  // Trava de segurança para garantir que os cliques voltem ao fechar
  useEffect(() => {
    return () => {
      document.body.style.pointerEvents = 'auto';
    };
  }, []);

  const onSubmit = async (data: FormValues) => {
    setLoading(true);
    try {
      const result = await upsertNivelEnsino(data);
      
      if (result?.error) {
        toast({ title: 'Erro', description: result.error, variant: 'destructive' });
        return;
      }

      toast({ 
          title: 'Sucesso', 
          description: `Etapa "${data.nome}" salva.` 
      });
      
      setIsOpen(false);

      if (result.data) {
        onNivelUpdated(result.data);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent onPointerDownOutside={(e) => e.preventDefault()} className="sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5" />
            {isEdit ? 'Editar Etapa' : 'Nova Etapa'}
          </SheetTitle>
          <SheetDescription>
            {isEdit ? 'Atualize as informações da etapa de ensino.' : 'Crie um nova etapa de ensino.'}
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form 
            id="ensino-form" 
            onSubmit={form.handleSubmit(onSubmit)} 
            className="flex-1 space-y-6 py-6"
          >
            <FormField
              control={form.control}
              name="nome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome da Etapa</FormLabel>
                  <FormControl><Input {...field} placeholder="Ex: Ensino Médio" /></FormControl>
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
                  <FormControl><Input {...field} placeholder="Ex: EM" /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>

        <SheetFooter className="mt-auto border-t pt-4 bg-background">
          <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>
            Cancelar
          </Button>
          <Button 
            type="submit" 
            form="ensino-form" 
            disabled={loading}
            className="min-w-[100px]"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
