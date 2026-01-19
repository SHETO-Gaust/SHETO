'use client';

import { useState, useMemo, useEffect } from 'react';
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
import { syncFormadores } from '@/app/(app)/gerenciamento/actions';
import type { Formacao, Formador } from '@/lib/types';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


type FormadoresSheetProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  formacao: Formacao;
  formadores: Formador[];
  onUpdate: () => void;
};

export function FormadoresSheet({ isOpen, setIsOpen, formacao, formadores: initialFormadores, onUpdate }: FormadoresSheetProps) {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [newFormadoresInput, setNewFormadoresInput] = useState<{ [date: string]: { name: string; reference: string; periodo: 'matutino' | 'vespertino' | 'integral' } }>({});
  
  const [stagedFormadores, setStagedFormadores] = useState<Formador[]>([]);
  const [deletedFormadorIds, setDeletedFormadorIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) {
      setStagedFormadores([...initialFormadores]);
      setDeletedFormadorIds(new Set());
    }
  }, [isOpen, initialFormadores]);

  const formadoresByDate = useMemo(() => {
    const visibleFormadores = stagedFormadores.filter(f => !deletedFormadorIds.has(f.id));
    return visibleFormadores.reduce((acc, formador) => {
      const dateKey = format(parseISO(formador.formacao_date), 'yyyy-MM-dd');
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(formador);
      return acc;
    }, {} as { [date: string]: Formador[] });
  }, [stagedFormadores, deletedFormadorIds]);

  const sortedDates = useMemo(() => {
    return formacao.dates
      ? [...formacao.dates].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      : [];
  }, [formacao.dates]);

  const handleInputChange = (date: string, field: 'name' | 'reference' | 'periodo', value: string) => {
    setNewFormadoresInput(prev => ({
      ...prev,
      [date]: {
        ...(prev[date] || { name: '', reference: '', periodo: 'integral' }),
        [field]: value as any,
      },
    }));
  };
  
  const handleAddFormador = (dateKey: string) => {
    const formadorData = newFormadoresInput[dateKey];
    if (!formadorData || !formadorData.name) {
      toast({ title: 'O nome do formador é obrigatório.', variant: 'destructive' });
      return;
    }
    const newFormador: Formador = {
        id: `new_${Date.now()}`,
        formacao_id: formacao.id,
        formacao_date: dateKey,
        name: formadorData.name,
        reference: formadorData.reference,
        periodo: formadorData.periodo || 'integral',
        created_at: new Date().toISOString(),
    };
    setStagedFormadores(prev => [...prev, newFormador]);
    setNewFormadoresInput(prev => ({
        ...prev,
        [dateKey]: { name: '', reference: '', periodo: 'integral' }
    }));
  }

  const handleDeleteFormador = (idToDelete: string) => {
    if (idToDelete.startsWith('new_')) {
      setStagedFormadores(prev => prev.filter(f => f.id !== idToDelete));
    } else {
      setDeletedFormadorIds(prev => new Set(prev).add(idToDelete));
    }
  }

  const handleSave = async () => {
    setIsSaving(true);
    
    const toAdd = stagedFormadores
      .filter((f) => f.id.startsWith('new_'))
      .map(({ name, reference, formacao_date, periodo }) => ({ name, reference: reference || '', formacao_date, periodo: periodo || 'integral' }));

    const toDelete = Array.from(deletedFormadorIds);

    const result = await syncFormadores(formacao.id, toAdd, toDelete);
    
    setIsSaving(false);
    
    if (result.error) {
        toast({ title: 'Erro ao salvar', description: result.error, variant: 'destructive' });
    } else {
        toast({ title: 'Formadores salvos com sucesso!' });
        onUpdate();
        setIsOpen(false);
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
          <Accordion type="single" collapsible className="w-full" defaultValue={sortedDates[0]?.date}>
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
                      {formadoresDoDia.length > 0 && (
                        <div className="space-y-2">
                          {formadoresDoDia.map(formador => {
                             const periodoMap = {
                                matutino: 'Manhã',
                                vespertino: 'Tarde',
                                integral: 'Integral',
                             };
                             // @ts-ignore
                             const periodoLabel = formador.periodo ? periodoMap[formador.periodo] : 'Integral';

                            return (
                                <div key={formador.id} className="flex items-center justify-between p-2 border rounded-md bg-background">
                                <div className="flex items-center gap-2">
                                    <User className="h-4 w-4 text-muted-foreground" />
                                    <div>
                                    <p className="font-medium">{formador.name}</p>
                                    <p className="text-xs text-muted-foreground">{formador.reference} - {periodoLabel}</p>
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDeleteFormador(formador.id)}
                                >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                                </div>
                            )
                          })}
                        </div>
                      )}

                      <div className="p-4 border-t space-y-3">
                        <h4 className="font-semibold">Adicionar Novo Formador</h4>
                        <div className="space-y-2">
                          <Label htmlFor={`name-${dateKey}`}>Nome</Label>
                          <Input
                            id={`name-${dateKey}`}
                            placeholder="Nome completo do formador"
                            value={newFormadoresInput[dateKey]?.name || ''}
                            onChange={(e) => handleInputChange(dateKey, 'name', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`ref-${dateKey}`}>Referência/Cargo</Label>
                          <Input
                            id={`ref-${dateKey}`}
                            placeholder="Ex: Prof. de Química"
                            value={newFormadoresInput[dateKey]?.reference || ''}
                            onChange={(e) => handleInputChange(dateKey, 'reference', e.target.value)}
                          />
                        </div>
                         <div className="space-y-2">
                            <Label>Período</Label>
                            <Select
                                value={newFormadoresInput[dateKey]?.periodo || 'integral'}
                                onValueChange={(value: 'matutino' | 'vespertino' | 'integral') => handleInputChange(dateKey, 'periodo', value)}
                            >
                                <SelectTrigger>
                                <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                <SelectItem value="integral">Integral (Manhã e Tarde)</SelectItem>
                                <SelectItem value="matutino">Manhã</SelectItem>
                                <SelectItem value="vespertino">Tarde</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <Button
                          className="w-full"
                          onClick={() => handleAddFormador(dateKey)}
                        >
                          <PlusCircle className="mr-2 h-4 w-4" />
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
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar Alterações
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
