'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { updateAlocacaoProfessores } from './actions';
import type { TurmaComDados, ProfessorComDados, ComponenteCurricular } from '@/lib/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const formSchema = z.object({
    turma_id: z.string(),
    assignments: z.array(z.object({
        componente_id: z.string(),
        professor_id: z.string().nullable(),
    }))
});

type FormValues = z.infer<typeof formSchema>;

type Props = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  turma: TurmaComDados;
  dependencies: { 
      professores: ProfessorComDados[],
      componentes: ComponenteCurricular[],
  };
  onAlocacaoUpdated: () => void;
};

export function AlocacaoProfessoresSheet({ isOpen, setIsOpen, turma, dependencies, onAlocacaoUpdated }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [isOverloadDialogOpen, setIsOverloadDialogOpen] = useState(false);
  const [overloadInfo, setOverloadInfo] = useState<{ name: string; aulas: number }[]>([]);
  const [dataToSave, setDataToSave] = useState<FormValues | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { turma_id: turma.id, assignments: [] },
  });

  useEffect(() => {
    if (isOpen) {
      const ensalamentoExistente = new Map(turma.professores.map(p => [p.componente_id, p.professor_id]));
      const formAssignments = turma.serie.componentes
        .filter(c => (c.aulas_presenciais || 0) + (c.aulas_nao_presenciais || 0) > 0)
        .map(comp => ({
          componente_id: comp.componente_id,
          professor_id: ensalamentoExistente.get(comp.componente_id) || 'none',
      }));
      form.reset({ turma_id: turma.id, assignments: formAssignments });
    }
  }, [isOpen, turma, form]);

  const executeSave = async (data: FormValues) => {
    setLoading(true);
    const result = await updateAlocacaoProfessores(data);
    setLoading(false);

    if (result.error) {
      toast({ title: 'Erro', description: result.error, variant: 'destructive' });
      return;
    }

    toast({ title: 'Sucesso', description: 'Alocação salva.' });
    onAlocacaoUpdated();
    setIsOpen(false);
  };
  
  const onSubmit = (data: FormValues) => {
    const oldAssignments = new Map<string, string>();
    turma.professores.forEach(p => {
        oldAssignments.set(p.componente_id, p.professor_id);
    });

    const aulasPorComponente = new Map<string, number>();
    turma.serie.componentes.forEach(c => {
        aulasPorComponente.set(c.componente_id, (c.aulas_presenciais || 0) + (c.aulas_nao_presenciais || 0));
    });

    const professorLoadDelta = new Map<string, number>();

    data.assignments.forEach(newAssignment => {
        const oldProfId = oldAssignments.get(newAssignment.componente_id);
        const newProfId = newAssignment.professor_id;
        const aulas = aulasPorComponente.get(newAssignment.componente_id) || 0;

        if (oldProfId !== newProfId) {
            if (oldProfId) {
                professorLoadDelta.set(oldProfId, (professorLoadDelta.get(oldProfId) || 0) - aulas);
            }
            if (newProfId && newProfId !== 'none') {
                professorLoadDelta.set(newProfId, (professorLoadDelta.get(newProfId) || 0) + aulas);
            }
        }
    });

    const overloadedProfessors: { name: string; aulas: number }[] = [];
    professorLoadDelta.forEach((delta, profId) => {
        const professor = dependencies.professores.find(p => p.id === profId);
        if (!professor) return;
        
        const newTotalLoad = (professor.aulas_atribuidas || 0) + delta;
        const overload = newTotalLoad - professor.aulas_disponiveis;
        
        if (overload > 0) {
            overloadedProfessors.push({ name: professor.nome_horario, aulas: overload });
        }
    });
    
    if (overloadedProfessors.length > 0) {
        setOverloadInfo(overloadedProfessors);
        setDataToSave(data);
        setIsOverloadDialogOpen(true);
    } else {
        executeSave(data);
    }
  };
  
  const getProfessoresQualificados = (componenteId: string) => {
    return dependencies.professores.filter(prof => 
        prof.componentes.some(c => c.id === componenteId) && prof.turnos_ids.includes(turma.serie.turno_id)
    );
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent className="sm:max-w-2xl flex flex-col">
          <SheetHeader>
            <SheetTitle>Alocar Professores: {turma.serie.nome} - Turma {turma.nome}</SheetTitle>
            <SheetDescription>Aloque um professor para cada disciplina desta turma.</SheetDescription>
          </SheetHeader>

          <Form {...form}>
            <form id="ensalamento-form" onSubmit={form.handleSubmit(onSubmit)} className="flex-1 overflow-y-auto pr-2 -mr-4 space-y-4 py-4">
              {turma.serie.componentes.filter(c => (c.aulas_presenciais || 0) + (c.aulas_nao_presenciais || 0) > 0).map((serieComp, index) => {
                const professoresQualificados = getProfessoresQualificados(serieComp.componente_id);
                const totalAulas = (serieComp.aulas_presenciais || 0) + (serieComp.aulas_nao_presenciais || 0);

                return (
                  <div key={serieComp.componente_id} className="p-4 border rounded-lg bg-card">
                    <p className="font-semibold">{serieComp.componente.nome} ({totalAulas} aulas/sem)</p>
                    <div className="mt-2">
                      <FormField
                        control={form.control}
                        name={`assignments.${index}.professor_id`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Professor</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || 'none'} disabled={professoresQualificados.length === 0}>
                                <FormControl><SelectTrigger><SelectValue placeholder={professoresQualificados.length === 0 ? 'Nenhum prof. qualificado' : 'Selecione...'} /></SelectTrigger></FormControl>
                                <SelectContent>
                                    <SelectItem value="none">Nenhum/A definir</SelectItem>
                                    {professoresQualificados.map(p => (
                                        <SelectItem key={p.id} value={p.id}>{p.nome_horario} ({p.aulas_atribuidas || 0}/{p.aulas_disponiveis})</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {professoresQualificados.length === 0 && (
                                <p className="text-xs text-muted-foreground">
                                    Não há professores qualificados.
                                    <Link href="/professores" className="font-semibold text-primary hover:underline ml-1">
                                        Gerenciar Professores
                                    </Link>
                                </p>
                            )}
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                )
              })}
            </form>
          </Form>

          <SheetFooter className="mt-auto border-t pt-4">
            <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>Cancelar</Button>
            <Button type="submit" form="ensalamento-form" disabled={loading} className="min-w-[100px]">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={isOverloadDialogOpen} onOpenChange={setIsOverloadDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Professor com Carga Horária Excedida</AlertDialogTitle>
            <AlertDialogDescription>
              A seguinte alocação excederá a carga horária disponível dos professores:
              <ul className="list-disc pl-5 mt-2 text-foreground font-normal">
                {overloadInfo.map(info => (
                  <li key={info.name}>
                    <span className="font-semibold">{info.name}</span> excederá em <span className="font-semibold">{info.aulas}</span> {info.aulas > 1 ? 'aulas' : 'aula'}.
                  </li>
                ))}
              </ul>
              <br />
              Deseja salvar mesmo assim?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDataToSave(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (dataToSave) {
                executeSave(dataToSave);
              }
              setIsOverloadDialogOpen(false);
            }}>
              Salvar Mesmo Assim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
