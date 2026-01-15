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
import type { Formacao, Inscricao } from '@/lib/types';
import { InscritosTable } from './inscritos-table';

type InscritosSheetProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  formacao: Formacao;
  inscricoes: Inscricao[];
};

export function InscritosSheet({ isOpen, setIsOpen, formacao, inscricoes }: InscritosSheetProps) {
  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent className="sm:max-w-4xl w-full flex flex-col">
        <SheetHeader>
          <SheetTitle>Inscritos: {formacao.name}</SheetTitle>
          <SheetDescription>
            Visualize, edite ou remova os participantes inscritos nesta formação. Atualmente há {inscricoes.length} inscrito(s).
          </SheetDescription>
        </SheetHeader>
        
        <div className="flex-1 overflow-y-auto pr-6 pl-1 space-y-6 py-4">
            <InscritosTable data={inscricoes} />
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
