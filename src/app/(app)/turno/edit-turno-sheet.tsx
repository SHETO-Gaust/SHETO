'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { upsertTurno } from './actions';
import { Loader2, Check } from 'lucide-react';
import type { Turno } from '@/lib/types';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type EditTurnoSheetProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  turno: Turno | null;
  escolaId: string;
  onTurnoUpdated: (turno: Turno) => void;
};

const ALL_WEEK_DAYS = [
  { id: 'domingo', label: 'Domingo' },
  { id: 'segunda', label: 'Segunda-feira' },
  { id: 'terca', label: 'Terça-feira' },
  { id: 'quarta', label: 'Quarta-feira' },
  { id: 'quinta', label: 'Quinta-feira' },
  { id: 'sexta', label: 'Sexta-feira' },
  { id: 'sabado', label: 'Sábado' },
];

// Days available for selection
const diasDaSemana = ALL_WEEK_DAYS;

const turnoFormSchema = z.object({
  id: z.string().optional(),
  escola_id: z.string(),
  nome: z.string().min(3, { message: "O nome deve ter pelo menos 3 caracteres." }),
  dias_semana: z.array(z.string()),
  aulas_por_dia: z.coerce.number().min(1, { message: "Deve haver pelo menos 1 aula por dia." }),
});

type TurnoFormValues = z.infer<typeof turnoFormSchema>;

type TurnoPreviewTableProps = {
  aulasPorDia: number;
  diasSelecionados: string[];
};

function TurnoPreviewTable({ aulasPorDia, diasSelecionados }: TurnoPreviewTableProps) {
  if (aulasPorDia <= 0 || !diasSelecionados) {
    return null;
  }

  const aulas = Array.from({ length: aulasPorDia }, (_, i) => i + 1);

  return (
    <div className="space-y-2 pt-4">
        <p className="text-sm font-medium">Pré-visualização</p>
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-[80px]"></TableHead>
                        {ALL_WEEK_DAYS.map(day => (
                            <TableHead key={day.id} className="text-center">{day.label}</TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {aulas.map(aulaNum => (
                        <TableRow key={aulaNum}>
                            <TableCell className="font-medium">{aulaNum}ª aula</TableCell>
                            {ALL_WEEK_DAYS.map(day => (
                                <TableCell key={day.id} className="text-center">
                                    {diasSelecionados.includes(day.id) && <Check className="h-4 w-4 mx-auto" />}
                                </TableCell>
                            ))}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    </div>
  );
}

export function EditTurnoSheet({ isOpen, setIsOpen, turno, escolaId, onTurnoUpdated }: EditTurnoSheetProps) {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const isEditMode = !!turno;

    const form = useForm<TurnoFormValues>({
        resolver: zodResolver(turnoFormSchema),
        defaultValues: {
            id: undefined,
            escola_id: escolaId,
            nome: '',
            dias_semana: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
            aulas_por_dia: 5,
        }
    });

    useEffect(() => {
        if (isOpen) {
            form.reset({
                id: turno?.id,
                escola_id: escolaId,
                nome: turno?.nome || '',
                dias_semana: isEditMode ? (turno.dias_semana ?? []) : ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
                aulas_por_dia: isEditMode ? (turno.aulas_por_dia || 5) : 5,
            });
        }
    }, [isOpen, turno, escolaId, form, isEditMode]);

    const aulasPorDia = form.watch('aulas_por_dia');
    const diasSelecionados = form.watch('dias_semana');

    const onSubmit = async (data: TurnoFormValues) => {
        setLoading(true);
        const result = await upsertTurno(data);
        setLoading(false);

        if (result.error) {
            toast({
                title: 'Erro ao salvar turno',
                description: result.error,
                variant: 'destructive',
            });
        } else {
            toast({
                title: isEditMode ? 'Turno Atualizado!' : 'Turno Criado!',
                description: `O turno "${data.nome}" foi salvo com sucesso.`,
            });
            onTurnoUpdated(result.data as Turno);
            setIsOpen(false);
        }
    };

    return (
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetContent className="sm:max-w-3xl flex flex-col">
                 <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col h-full">
                        <SheetHeader className="px-4">
                            <SheetTitle>{isEditMode ? 'Editar Turno' : 'Criar Novo Turno'}</SheetTitle>
                            <SheetDescription>
                                {isEditMode ? `Configure o turno "${turno.nome}".` : 'Adicione e configure um novo turno para a sua escola.'}
                            </SheetDescription>
                        </SheetHeader>

                        <div className="flex-1 space-y-6 overflow-y-auto p-4">
                            <FormField
                                control={form.control}
                                name="nome"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Nome do Turno</FormLabel>
                                        <FormControl><Input placeholder="Ex: Integral" {...field} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <Separator />
                            
                            <FormField
                                control={form.control}
                                name="dias_semana"
                                render={() => (
                                    <FormItem>
                                        <div className="mb-4">
                                            <FormLabel className="text-base">Dias da Semana</FormLabel>
                                            <p className="text-sm text-muted-foreground">
                                                Selecione os dias em que este turno opera.
                                            </p>
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                        {diasDaSemana.map((item) => (
                                            <FormField
                                            key={item.id}
                                            control={form.control}
                                            name="dias_semana"
                                            render={({ field }) => {
                                                return (
                                                <FormItem
                                                    key={item.id}
                                                    className="flex flex-row items-start space-x-3 space-y-0"
                                                >
                                                    <FormControl>
                                                    <Checkbox
                                                        checked={field.value?.includes(item.id)}
                                                        onCheckedChange={(checked) => {
                                                        return checked
                                                            ? field.onChange([...(field.value || []), item.id])
                                                            : field.onChange(
                                                                (field.value || []).filter(
                                                                (value) => value !== item.id
                                                                )
                                                            )
                                                        }}
                                                    />
                                                    </FormControl>
                                                    <FormLabel className="font-normal">
                                                    {item.label}
                                                    </FormLabel>
                                                </FormItem>
                                                )
                                            }}
                                            />
                                        ))}
                                        </div>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <Separator />
                            
                            <FormField
                                control={form.control}
                                name="aulas_por_dia"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Quantidade de Aulas por Dia</FormLabel>
                                        <FormControl>
                                            <Input type="number" min="1" max="15" placeholder="Ex: 5" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            
                             <TurnoPreviewTable aulasPorDia={aulasPorDia} diasSelecionados={diasSelecionados} />
                        </div>

                        <SheetFooter className="mt-auto border-t pt-4 px-4 py-4">
                            <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancelar</Button>
                            <Button type="submit" disabled={loading}>
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {isEditMode ? 'Salvar Alterações' : 'Criar Turno'}
                            </Button>
                        </SheetFooter>
                    </form>
                </Form>
            </SheetContent>
        </Sheet>
    );
}
