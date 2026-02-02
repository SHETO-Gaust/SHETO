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
import { Loader2, BookOpen } from 'lucide-react';
import { upsertComponente } from './actions';
import type { ComponenteCurricular } from '@/lib/types';

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
  componente: ComponenteCurricular | null;
  escolaId: string;
  onComponenteUpdated: (componente: ComponenteCurricular) => void;
};

export function EditComponenteSheet({ isOpen, setIsOpen, componente, escolaId, onComponenteUpdated }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const isEdit = !!componente;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      escola_id: String(escolaId),
      nome: '',
      sigla: '',
    },
  });

  useEffect(() => {
    if (isOpen) {
      form.reset({
        id: componente?.id,
        escola_id: String(escolaId),
        nome: componente?.nome ?? '',
        sigla: componente?.sigla ?? '',
      });
    }
  }, [isOpen, componente, escolaId, form]);

  const onSubmit = async (data: FormValues) => {
    setLoading(true);
    const result = await upsertComponente(data);
    setLoading(false);
      
    if (result?.error) {
      toast({ title: 'Erro', description: result.error, variant: 'destructive' });
      return;
    }

    toast({ 
        title: 'Sucesso', 
        description: `Componente "${data.nome}" salvo.` 
    });
    
    if (result.data) {
        onComponenteUpdated(result.data);
    }
    setIsOpen(false);
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent className="sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            {isEdit ? 'Editar Componente' : 'Novo Componente'}
          </SheetTitle>
          <SheetDescription>
            {isEdit ? 'Atualize as informações do componente curricular.' : 'Crie um novo componente curricular.'}
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form 
            id="componente-form" 
            onSubmit={form.handleSubmit(onSubmit)} 
            className="flex-1 space-y-6 py-6"
          >
            <FormField
              control={form.control}
              name="nome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome do Componente</FormLabel>
                  <FormControl><Input {...field} placeholder="Ex: Matemática" /></FormControl>
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
                  <FormControl><Input {...field} placeholder="Ex: MAT" /></FormControl>
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
            form="componente-form" 
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
