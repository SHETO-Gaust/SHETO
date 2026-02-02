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
import { Badge } from '@/components/ui/badge';

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
            Acompanhe a distribuição de aulas para cada professor em todas as turmas.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto pr-2 -mr-4 space-y-4 py-4">
          {professores.map(prof => {
            const aulasAtribuidas = prof.aulas_atribuidas || 0;
            const aulasDisponiveis = prof.aulas_disponiveis;
            const progresso = aulasDisponiveis > 0 ? (aulasAtribuidas / aulasDisponiveis) * 100 : 0;
            const saldo = aulasDisponiveis - aulasAtribuidas;

            return (
              <div key={prof.id} className="p-4 border rounded-lg space-y-3">
                <div className="flex justify-between items-baseline">
                  <p className="font-semibold">{prof.nome_horario}</p>
                  <p className="text-sm font-medium">
                    {aulasAtribuidas} / {aulasDisponiveis}
                  </p>
                </div>
                <Progress value={progresso} />
                <div className="flex justify-between items-start pt-1">
                    <div className="flex flex-wrap gap-1">
                        {prof.alocacoes && prof.alocacoes.length > 0 ? (
                            prof.alocacoes.map((aloc, i) => (
                                <Badge key={`${prof.id}-${aloc.serie_nome}-${i}`} variant="secondary">
                                    {aloc.serie_nome} '{aloc.turma_nome}': {aloc.aulas} {aloc.aulas > 1 ? 'aulas' : 'aula'}
                                </Badge>
                            ))
                        ) : (
                            <p className="text-xs text-muted-foreground italic">Nenhuma aula atribuída</p>
                        )}
                    </div>
                    <p className="text-xs text-right text-muted-foreground shrink-0 pl-2">
                      {saldo >= 0 ? `${saldo} aulas restantes` : `${Math.abs(saldo)} aulas excedentes`}
                    </p>
                </div>
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
