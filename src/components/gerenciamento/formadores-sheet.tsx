'use client';

import { useState, useMemo } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, PlusCircle, Trash2, User } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { addFormador, deleteFormador } from '@/app/(app)/gerenciamento/actions';
import type { Formacao, Formador } from '@/lib/types';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type FormadoresSheetProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  formacao: Formacao;
  formadores: Formador[];
};

export function FormadoresSheet({ isOpen, setIsOpen, formacao, formadores }: FormadoresSheetProps) {
  const { toast } = useToast();
  const [loadingStates, setLoadingStates] = useState<{ [key: string]: boolean }>({});
  const [newFormadores, setNewFormadores] = useState<{ [date: string]: { name: string; reference: string } }>({});

  const formadoresByDate = useMemo(() => {
    return formadores.reduce((acc, formador) => {
      const dateKey = formador.formacao_date;
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(formador);
      return acc;
    }, {} as { [date: string]: Formador[] });
  }, [formadores]);

  const sortedDates = useMemo(() => {
    return formacao.dates
      ? [...formacao.dates].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      : [];
  }, [formacao.dates]);

  const handleInputChange = (date: string, field: 'name' | 'reference', value: string) => {
    setNewFormadores(prev => ({
      ...prev,
      [date]: {
        ...(prev[date] || { name: '', reference: '' }),
        [field]: value,
      },
    }));
  };

  const handleAddFormador = async (date: string) => {
    const formadorData = newFormadores[date];
    if (!formadorData || !formadorData.name) {
      toast({ title: 'O nome do formador é obrigatório.', variant: 'destructive' });
      return;
    }

    setLoadingStates(prev => ({ ...prev, [`add-${date}`]: true }));
    const result = await addFormador({
      formacao_id: formacao.id,
      formacao_date: date,
      name: formadorData.name,
      reference: formadorData.reference,
    });
    setLoadingStates(prev => ({ ...prev, [`add-${date}`]: false }));

    if (result.error) {
      toast({ title: 'Erro ao adicionar formador', description: result.error, variant: 'destructive' });
    } else {
      toast({ title: 'Formador adicionado com sucesso!' });
      handleInputChange(date, 'name', '');
      handleInputChange(date, 'reference', '');
    }
  };

  const handleDeleteFormador = async (id: string) => {
    setLoadingStates(prev => ({ ...prev, [`delete-${id}`]: true }));
    const result = await deleteFormador(id);
    setLoadingStates(prev => ({ ...prev, [`delete-${id}`]: false }));

    if (result.error) {
      toast({ title: 'Erro ao deletar formador', description: result.error, variant: 'destructive' });
    } else {
      toast({ title: 'Formador removido com sucesso!' });
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent className="sm:max-w-xl w-full flex flex-col">
        <SheetHeader>
          <SheetTitle>Gerenciar Formadores</SheetTitle>
          <SheetDescription>
            Adicione ou remova formadores para cada dia da formação: <span className="font-semibold text-foreground">{formacao.name}</span>.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto pr-6 pl-1 space-y-4 py-4">
          <Accordion type="single" collapsible className="w-full">
            {sortedDates.length > 0 ? sortedDates.map((day) => {
              const dateKey = format(parseISO(day.date), 'yyyy-MM-dd');
              const formadoresDoDia = formadoresByDate[dateKey] || [];
              
              return (
                <AccordionItem value={day.date} key={day.date}>
                  <AccordionTrigger>
                    <div className="flex flex-col items-start">
                      <span className="font-semibold">{format(parseISO(day.date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</span>
                      <span className="text-sm text-muted-foreground">{formadoresDoDia.length} formador(es)</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4">
                      {formadoresDoDia.length > 0 ? (
                        <div className="space-y-2">
                          {formadoresDoDia.map(formador => (
                            <div key={formador.id} className="flex items-center justify-between p-2 border rounded-md bg-background">
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-muted-foreground" />
                                <div>
                                  <p className="font-medium">{formador.name}</p>
                                  <p className="text-xs text-muted-foreground">{formador.reference}</p>
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteFormador(formador.id)}
                                disabled={loadingStates[`delete-${formador.id}`]}
                              >
                                {loadingStates[`delete-${formador.id}`] ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                )}
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : <p className="text-sm text-center text-muted-foreground py-2">Nenhum formador para esta data.</p>}

                      <div className="p-4 border-t space-y-3">
                        <h4 className="font-semibold">Adicionar Novo Formador</h4>
                        <div className="space-y-2">
                          <Label htmlFor={`name-${dateKey}`}>Nome</Label>
                          <Input
                            id={`name-${dateKey}`}
                            placeholder="Nome completo do formador"
                            value={newFormadores[dateKey]?.name || ''}
                            onChange={(e) => handleInputChange(dateKey, 'name', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`ref-${dateKey}`}>Referência/Cargo</Label>
                          <Input
                            id={`ref-${dateKey}`}
                            placeholder="Ex: Prof. de Química"
                            value={newFormadores[dateKey]?.reference || ''}
                            onChange={(e) => handleInputChange(dateKey, 'reference', e.target.value)}
                          />
                        </div>
                        <Button
                          className="w-full"
                          onClick={() => handleAddFormador(dateKey)}
                          disabled={loadingStates[`add-${dateKey}`]}
                        >
                          {loadingStates[`add-${dateKey}`] ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <PlusCircle className="mr-2 h-4 w-4" />
                          )}
                          Adicionar Formador
                        </Button>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )
            }) : (
              <p className="text-center text-muted-foreground p-4">Não há datas cadastradas para esta formação.</p>
            )}
          </Accordion>
        </div>

        <SheetFooter className="mt-auto pt-4 border-t">
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Fechar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
