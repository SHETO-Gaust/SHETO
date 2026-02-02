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

// O Schema corrigido para aceitar ID numérico ou string e converter para string
const formSchema = z.object({
  id: z.string().optional(),
  escola_id: z.union([z.string(), z.number()]).transform(val => String(val)),
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
  escolaId: string | number;
  turnosDaEscola: Turno[];
  onProfessorUpdated: () => void;
};

export function EditProfessorSheet({ 
  isOpen, 
  setIsOpen, 
  professor, 
  escolaId, 
  turnosDaEscola, 
  onProfessorUpdated 
}: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const isEdit = !!professor;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      escola_id: String(escolaId),
      nome_completo: '',
      nome_horario: '',
      email: '',
      turnos_ids: [],
    },
  });

  // Limpa o bloqueio de cliques do Radix e reseta o formulário
  useEffect(() => {
    if (isOpen) {
      document.body.style.pointerEvents = 'auto';
      form.reset({
        id: professor?.id,
        escola_id: String(escolaId),
        nome_completo: professor?.nome_completo ?? '',
        nome_horario: professor?.nome_horario ?? '',
        email: professor?.email ?? '',
        turnos_ids: professor?.turnos_ids ?? [],
      });
    }
  }, [isOpen, professor, escolaId, form]);

  const onSubmit = async (data: FormValues) => {
    console.log("🚀 Dados validados e prontos para enviar:", data);
    setLoading(true);
    try {
      const result = await upsertProfessor(data);
      
      if (result?.error) {
        toast({ title: 'Erro', description: result.error, variant: 'destructive' });
        return;
      }

      toast({
        title: isEdit ? 'Professor Atualizado' : 'Professor Criado',
        description: `Os dados de "${data.nome_completo}" foram salvos.`,
      });

      setIsOpen(false);
      onProfessorUpdated();
    } catch (error) {
      console.error("❌ Erro ao salvar:", error);
      toast({ title: 'Erro', description: 'Erro interno ao processar a requisição.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent className="sm:max-w-lg flex flex-col h-full pointer-events-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {isEdit ? 'Editar Professor' : 'Novo Professor'}
          </SheetTitle>
          <SheetDescription>
            {isEdit ? 'Edite as informações abaixo.' : 'Preencha os dados do novo professor.'}
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form 
            id="professor-form"
            onSubmit={form.handleSubmit(onSubmit, (err) => console.log("⚠️ Validação falhou:", err))} 
            className="flex-1 flex flex-col overflow-hidden"
          >
            <div className="flex-1 space-y-5 py-6 overflow-y-auto pr-2">
              <FormField control={form.control} name="nome_completo" render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome Completo</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="nome_horario" render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome para Exibição (Horário)</FormLabel>
                  <FormControl><Input {...field} placeholder="Ex: Prof. Carlos" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>Email (Opcional)</FormLabel>
                  <FormControl>
                    <Input 
                      type="email" 
                      {...field} 
                      value={field.value ?? ''} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="space-y-3">
                <FormLabel>Turnos de Atuação</FormLabel>
                <div className="grid grid-cols-2 gap-3">
                  {turnosDaEscola.map((turno) => (
                    <FormField
                      key={turno.id}
                      control={form.control}
                      name="turnos_ids"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center space-x-3 space-y-0 p-3 border rounded-md">
                          <FormControl>
                            <Checkbox
                              checked={field.value?.includes(turno.id)}
                              onCheckedChange={(checked) => {
                                return checked
                                  ? field.onChange([...field.value, turno.id])
                                  : field.onChange(field.value?.filter((v) => v !== turno.id));
                              }}
                            />
                          </FormControl>
                          <FormLabel className="font-normal cursor-pointer text-xs uppercase">
                            {turno.nome}
                          </FormLabel>
                        </FormItem>
                      )}
                    />
                  ))}
                </div>
                {form.formState.errors.turnos_ids && (
                  <p className="text-[0.8rem] font-medium text-destructive">
                    {form.formState.errors.turnos_ids.message}
                  </p>
                )}
              </div>
            </div>

            <SheetFooter className="mt-auto border-t pt-4">
              <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>
                Cancelar
              </Button>
              <Button 
                type="submit" 
                form="professor-form" 
                disabled={loading}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Salvar
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}