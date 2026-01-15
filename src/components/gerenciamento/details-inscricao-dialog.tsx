
'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { Inscricao } from '@/lib/types';

type DetailsInscricaoDialogProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  inscricao: Inscricao;
};

const DetailItem = ({ label, value }: { label: string; value: any }) => (
    <div className="flex flex-col">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="text-base text-foreground">
            {Array.isArray(value) ? value.join(', ') : (value || 'Não informado')}
        </p>
    </div>
);


export function DetailsInscricaoDialog({ isOpen, setIsOpen, inscricao }: DetailsInscricaoDialogProps) {
    if (!inscricao) return null;

    const allData = {
        'Nome Completo': inscricao.nome_completo,
        'CPF': inscricao.cpf,
        'Email': inscricao.email,
        ...inscricao.dados,
    };
    
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Detalhes da Inscrição</DialogTitle>
          <DialogDescription>
            Informações completas de {inscricao.nome_completo}.
          </DialogDescription>
        </DialogHeader>
        
        <div className="max-h-[60vh] overflow-y-auto pr-4 space-y-4 my-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(allData).map(([key, value]) => {
                    if (key === 'formacao_id' || key === 'id') return null;

                    // Converte camelCase para Título (ex: nomeCompleto -> Nome Completo)
                    const formattedKey = key
                        .replace(/([A-Z])/g, ' $1')
                        .replace(/^./, (str) => str.toUpperCase());
                    
                    return <DetailItem key={key} label={formattedKey} value={value} />
                })}
            </div>
        </div>

        <DialogFooter className="mt-auto pt-4 border-t">
          <DialogClose asChild>
            <Button variant="outline">Fechar</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
