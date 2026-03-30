
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
import { Button } from '@/components/ui/button';
import type { ProfessorComDados } from '@/lib/types';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Filter } from 'lucide-react';

type FilterType = 'todos' | 'incompleta' | 'completa' | 'excedente';

type Props = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  professores: ProfessorComDados[];
};

export function CargaHorariaProfessoresSheet({ isOpen, setIsOpen, professores }: Props) {
  const [filter, setFilter] = useState<FilterType>('todos');

  const filteredProfessores = useMemo(() => {
    return professores.filter(prof => {
      const atribuidas = prof.aulas_atribuidas || 0;
      const disponiveis = prof.aulas_disponiveis;

      if (filter === 'incompleta') return atribuidas < disponiveis;
      if (filter === 'completa') return atribuidas === disponiveis;
      if (filter === 'excedente') return atribuidas > disponiveis;
      return true;
    });
  }, [professores, filter]);

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent onPointerDownOutside={(e) => e.preventDefault()} className="sm:max-w-xl flex flex-col">
        <SheetHeader>
          <SheetTitle>Carga Horária dos Professores</SheetTitle>
          <SheetDescription>
            Acompanhe a distribuição de aulas para cada professor em todas as turmas.
          </SheetDescription>
        </SheetHeader>

        <div className="pt-6 pb-2 space-y-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filtrar por situação:</span>
          </div>
          <Select value={filter} onValueChange={(v) => setFilter(v as FilterType)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecione um filtro" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Professores ({professores.length})</SelectItem>
              <SelectItem value="incompleta">Carga horária incompleta</SelectItem>
              <SelectItem value="completa">Carga horária completa</SelectItem>
              <SelectItem value="excedente">Carga horária excedente</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 -mr-4 space-y-4 py-4">
          {filteredProfessores.length > 0 ? (
            filteredProfessores.map(prof => {
              const aulasAtribuidas = prof.aulas_atribuidas || 0;
              const aulasDisponiveis = prof.aulas_disponiveis;
              const progresso = aulasDisponiveis > 0 ? (aulasAtribuidas / aulasDisponiveis) * 100 : 0;
              const saldo = aulasDisponiveis - aulasAtribuidas;

              const isExcedente = aulasAtribuidas > aulasDisponiveis;
              const isCompleto = aulasAtribuidas === aulasDisponiveis && aulasDisponiveis > 0;

              return (
                <div key={prof.id} className="p-4 border rounded-lg space-y-3 bg-card shadow-sm">
                  <div className="flex justify-between items-baseline">
                    <p className="font-semibold text-foreground">{prof.nome_horario}</p>
                    <p className="text-sm font-bold">
                      {aulasAtribuidas} / {aulasDisponiveis}
                    </p>
                  </div>
                  <Progress 
                    value={Math.min(progresso, 100)} 
                    className={isExcedente ? "[&>div]:bg-destructive" : isCompleto ? "[&>div]:bg-green-500" : ""}
                  />
                  <div className="flex justify-between items-start pt-1">
                      <div className="flex flex-wrap gap-1.5 flex-1">
                          {prof.alocacoes && prof.alocacoes.length > 0 ? (
                              prof.alocacoes.map((aloc, i) => (
                                  <Badge key={`${prof.id}-${aloc.serie_nome}-${i}`} variant="secondary" className="text-[10px] py-1 px-2 h-auto flex flex-col items-start gap-0.5 max-w-[250px]">
                                      <span className="font-bold text-foreground">Turma: {aloc.turma_nome}</span>
                                      <span className="opacity-80">{aloc.aulas} {aloc.aulas > 1 ? 'aulas' : 'aula'} • {aloc.componente_nome}</span>
                                      <span className="text-[9px] italic opacity-60">({aloc.serie_nome})</span>
                                  </Badge>
                              ))
                          ) : (
                              <p className="text-xs text-muted-foreground italic">Nenhuma aula atribuída</p>
                          )}
                      </div>
                      <p className={`text-xs text-right shrink-0 pl-2 font-bold uppercase tracking-tight ${saldo < 0 ? 'text-destructive' : isCompleto ? 'text-green-600' : 'text-muted-foreground'}`}>
                        {saldo > 0 ? `${saldo} aulas restantes` : saldo < 0 ? `${Math.abs(saldo)} excedentes` : 'Carga completa'}
                      </p>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center text-muted-foreground p-12 border-2 border-dashed rounded-lg bg-muted/20">
              <Filter className="h-8 w-8 mx-auto mb-3 opacity-20" />
              <p>Nenhum professor encontrado com este filtro.</p>
            </div>
          )}
        </div>

        <SheetFooter className="mt-auto border-t pt-4">
          <Button type="button" variant="outline" onClick={() => setIsOpen(false)} className="w-full">
            Fechar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
