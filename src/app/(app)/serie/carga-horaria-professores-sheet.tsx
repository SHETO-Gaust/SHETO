'use client';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import type { ProfessorComDados } from '@/lib/types';
import { Progress } from '@/components/ui/progress';

type Props = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  professores: ProfessorComDados[];
};

export function CargaHorariaProfessoresSheet({ isOpen, setIsOpen, professores }: Props) {
  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent className="sm:max-w-xl flex flex-col">
        <SheetHeader>
          <SheetTitle>Carga Horária dos Professores</SheetTitle>
          <SheetDescription>
            Acompanhe a distribuição de aulas para cada professor.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto pr-2 -mr-4 space-y-4 py-4">
          {professores.map(prof => {
            const aulasAtribuidas = prof.aulas_atribuidas || 0;
            const aulasDisponiveis = prof.aulas_disponiveis;
            const progresso = aulasDisponiveis > 0 ? (aulasAtribuidas / aulasDisponiveis) * 100 : 0;
            const saldo = aulasDisponiveis - aulasAtribuidas;

            return (
              <div key={prof.id} className="p-4 border rounded-lg space-y-2">
                <div className="flex justify-between items-baseline">
                  <p className="font-semibold">{prof.nome_horario}</p>
                  <p className="text-sm font-medium">
                    {aulasAtribuidas} / {aulasDisponiveis}
                  </p>
                </div>
                <Progress value={progresso} />
                <p className="text-xs text-right text-muted-foreground">
                  {saldo >= 0 ? `${saldo} aulas restantes` : `${Math.abs(saldo)} aulas excedentes`}
                </p>
              </div>
            );
          })}
          {professores.length === 0 && (
            <div className="text-center text-muted-foreground p-8">
              Nenhum professor encontrado.
            </div>
          )}
        </div>

        <SheetFooter className="mt-auto border-t pt-4">
          <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
            Fechar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
