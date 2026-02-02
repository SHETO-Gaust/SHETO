'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Users } from 'lucide-react';
import { upsertProfessor } from './actions';
import type { ProfessorComDados, Turno } from '@/lib/types';

const formSchema = z.object({
  id: z.string().optional(),
  escola_id: z.string(),
  nome_completo: z.string().min(3, 'O nome completo é obrigatório.'),
  nome_horario: z.string().min(2, 'O nome para o horário é obrigatório.'),
  email: z.string().email('Email inválido.').optional().or(z.literal('')),
  turnos_ids: z.array(z.string()).min(1, 'Selecione ao menos um turno.'),
});

type FormValues = z.infer<typeof formSchema>;

type Props = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  professor: ProfessorComDados | null;
  escolaId: string;
  turnosDaEscola: Turno[];
  onProfessorUpdated: () => void;
};

export function EditProfessorSheet({ isOpen, setIsOpen, professor, escolaId, turnosDaEscola, onProfessorUpdated }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const isEdit = !!professor;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      escola_id: escolaId,
      nome_completo: '',
      nome_horario: '',
      email: '',
      turnos_ids: [],
    },
  });

  useEffect(() => {
    if (isOpen) {
      form.reset({
        id: professor?.id,
        escola_id: escolaId,
        nome_completo: professor?.nome_completo ?? '',
        nome_horario: professor?.nome_horario ?? '',
        email: professor?.email ?? '',
        turnos_ids: professor?.turnos_ids ?? [],
      });
    }
  }, [isOpen, professor, escolaId, form]);

  const onSubmit = async (data: FormValues) => {
    setLoading(true);
    const result = await upsertProfessor(data);
    setLoading(false);

    if (result.error) {
      toast({ title: 'Erro', description: result.error, variant: 'destructive' });
      return;
    }

    toast({
      title: isEdit ? 'Professor Atualizado' : 'Professor Criado',
      description: `Os dados de "${data.nome_completo}" foram salvos.`,
    });

    onProfessorUpdated();
    setIsOpen(false);
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent className="sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {isEdit ? 'Editar Professor' : 'Novo Professor'}
          </SheetTitle>
          <SheetDescription>
            {isEdit ? 'Atualize os dados do professor.' : 'Cadastre um novo professor.'}
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 space-y-6 py-6 overflow-y-auto pr-2">
                <FormField control={form.control} name="nome_completo" render={({ field }) => (
                <FormItem>
                    <FormLabel>Nome Completo</FormLabel>
                    <FormControl><Input {...field} placeholder="Nome completo do professor" /></FormControl>
                    <FormMessage />
                </FormItem>
                )} />
                <FormField control={form.control} name="nome_horario" render={({ field }) => (
                <FormItem>
                    <FormLabel>Nome (para o horário)</FormLabel>
                    <FormControl><Input {...field} placeholder="Ex: Prof. Silva" /></FormControl>
                    <FormMessage />
                </FormItem>
                )} />
                <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                    <FormLabel>Email (Opcional)</FormLabel>
                    <FormControl><Input type="email" {...field} value={field.value ?? ''} placeholder="email@exemplo.com" /></FormControl>
                    <FormMessage />
                </FormItem>
                )} />
                <FormField control={form.control} name="turnos_ids" render={() => (
                <FormItem>
                    <div className="mb-4">
                    <FormLabel>Turnos de Atuação</FormLabel>
                    <p className="text-sm text-muted-foreground">Selecione os turnos em que o professor trabalha.</p>
                    </div>
                    {turnosDaEscola.map((turno) => (
                    <FormField
                        key={turno.id}
                        control={form.control}
                        name="turnos_ids"
                        render={({ field }) => (
                        <FormItem key={turno.id} className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                            <Checkbox
                                checked={field.value?.includes(turno.id)}
                                onCheckedChange={(checked) => {
                                return checked
                                    ? field.onChange([...field.value, turno.id])
                                    : field.onChange(field.value?.filter((value) => value !== turno.id));
                                }}
                            />
                            </FormControl>
                            <FormLabel className="font-normal">{turno.nome}</FormLabel>
                        </FormItem>
                        )}
                    />
                    ))}
                    <FormMessage />
                </FormItem>
                )} />
            </div>

            <SheetFooter className="mt-auto border-t pt-4 bg-background">
              <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={loading} className="min-w-[100px]">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
