
'use client';

import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Loader2, BookCopy } from 'lucide-react';
import { updateProfessorComponentes } from './actions';
import type { ProfessorComDados, ComponenteCurricular } from '@/lib/types';
import { Label } from '@/components/ui/label';

type Props = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  professor: ProfessorComDados;
  componentesDaEscola: ComponenteCurricular[];
  onDisciplinasUpdated: () => void;
};

export function DisciplinasProfessorSheet({ isOpen, setIsOpen, professor, componentesDaEscola, onDisciplinasUpdated }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [selectedComponentes, setSelectedComponentes] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      const professorComponenteIds = professor.componentes.map(c => c.id);
      setSelectedComponentes(professorComponenteIds);
    }
  }, [isOpen, professor]);

  const handleToggle = (componenteId: string) => {
    setSelectedComponentes(prev => 
      prev.includes(componenteId)
        ? prev.filter(id => id !== componenteId)
        : [...prev, componenteId]
    );
  };

  const handleSave = async () => {
    setLoading(true);
    const result = await updateProfessorComponentes(professor.id, selectedComponentes);
    setLoading(false);

    if (result.error) {
      toast({ title: 'Erro', description: result.error, variant: 'destructive' });
      return;
    }

    toast({
      title: 'Disciplinas Atualizadas',
      description: `As disciplinas para "${professor.nome_completo}" foram salvas.`,
    });

    onDisciplinasUpdated();
    setIsOpen(false);
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent onPointerDownOutside={(e) => e.preventDefault()} className="sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <BookCopy className="h-5 w-5" />
            Gerenciar Disciplinas
          </SheetTitle>
          <SheetDescription>
            Selecione as disciplinas que {professor.nome_completo} pode lecionar.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 py-6 overflow-y-auto pr-2">
            {componentesDaEscola.length > 0 ? componentesDaEscola.map((comp) => (
                <div key={comp.id} className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                    <Checkbox
                        id={`comp-${comp.id}`}
                        checked={selectedComponentes.includes(comp.id)}
                        onCheckedChange={() => handleToggle(comp.id)}
                    />
                    <div className="space-y-1 leading-none">
                        <Label htmlFor={`comp-${comp.id}`} className="font-medium">
                            {comp.nome} ({comp.sigla})
                        </Label>
                    </div>
                </div>
            )) : (
                <div className="text-center text-muted-foreground p-8">
                    Nenhum componente curricular cadastrado para esta escola.
                </div>
            )}
        </div>

        <SheetFooter className="mt-auto border-t pt-4 bg-background">
          <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={loading} className="min-w-[100px]">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
