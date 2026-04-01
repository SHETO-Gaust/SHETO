'use client';

import { useEffect, useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { upsertTurma } from './actions';
import type { Serie, Turno, TurmaComDados } from '@/lib/types';

const formSchema = z.object({
  id: z.string().optional(),
  escola_id: z.any().transform(val => String(val)),
  serie_id: z.string({ required_error: 'Selecione uma série.' }).min(1, 'Selecione uma série.'),
  nome: z.string().min(1, 'O nome é obrigatório.'),
});

type FormValues = z.infer<typeof formSchema>;

type Props = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  escolaId: string | number;
  series: (Serie & { turno: Pick<Turno, 'id' | 'nome'> | null })[];
  turma?: TurmaComDados | null;
  onTurmaSaved: () => void;
};

export function CreateTurmaDialog({ isOpen, setIsOpen, escolaId, series, turma, onTurmaSaved }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const isEdit = !!turma;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      escola_id: String(escolaId),
      nome: '',
      serie_id: undefined,
    },
  });

  const seriesPorTurno = useMemo(() => {
    return series.reduce((acc, serie) => {
        const turnoNome = serie.turno?.nome || 'Sem Turno';
        if (!acc[turnoNome]) {
            acc[turnoNome] = [];
        }
        acc[turnoNome].push(serie);
        return acc;
    }, {} as Record<string, typeof series>);
  }, [series]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.pointerEvents = 'auto';
      if (turma) {
        form.reset({
          id: turma.id,
          escola_id: String(escolaId),
          nome: turma.nome,
          serie_id: turma.serie_id
        });
      } else {
        form.reset({
          escola_id: String(escolaId),
          nome: '',
          serie_id: undefined
        });
      }
    }
  }, [isOpen, form, escolaId, turma]);

  const onSubmit = async (data: FormValues) => {
    setLoading(true);
    try {
      const result = await upsertTurma(data);
      if (result?.error) {
        toast({ title: 'Erro', description: result.error, variant: 'destructive' });
      } else {
        toast({ title: 'Sucesso', description: isEdit ? 'Turma atualizada!' : 'Turma criada!' });
        onTurmaSaved();
        setIsOpen(false);
      }
    } catch (err) {
      console.error("❌ Erro fatal ao salvar turma:", err);
      toast({ title: 'Erro inesperado', description: 'Ocorreu um erro ao processar sua solicitação.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[425px] pointer-events-auto" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar Turma' : 'Nova Turma'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Atualize as informações desta turma.' : 'Crie uma nova turma a partir de um modelo de série.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form 
            onSubmit={form.handleSubmit(onSubmit)} 
            className="space-y-6"
          >
            <div className="space-y-4 py-4">
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
                        <ScrollArea className="h-[250px]">
                            {Object.entries(seriesPorTurno).map(([turnoNome, seriesDoTurno]) => (
                                <SelectGroup key={turnoNome}>
                                    <SelectLabel>{turnoNome}</SelectLabel>
                                    {seriesDoTurno.map(s => (
                                        <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                                    ))}
                                </SelectGroup>
                            ))}
                        </ScrollArea>
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
                      <Input {...field} value={field.value || ''} placeholder="Ex: A, B, C..." />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={loading}
                className="min-w-[120px]"
              >
                {loading ? <Loader2 className="animate-spin" /> : isEdit ? 'Salvar Alterações' : 'Criar Turma'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
