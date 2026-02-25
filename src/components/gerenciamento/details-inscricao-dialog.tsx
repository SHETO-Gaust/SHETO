
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
import type { Formacao, Inscricao } from '@/lib/types';
import { useMemo } from 'react';

type DetailsInscricaoDialogProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  inscricao: Inscricao;
  formacao: Formacao;
};

const DetailItem = ({ label, value }: { label: string; value: any }) => (
    <div className="flex flex-col">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="text-base text-foreground">
            {Array.isArray(value) ? value.join(', ') : (value || 'Não informado')}
        </p>
    </div>
);


export function DetailsInscricaoDialog({ isOpen, setIsOpen, inscricao, formacao }: DetailsInscricaoDialogProps) {
    if (!inscricao) return null;

    const allData = {
        'Nome Completo': inscricao.nome_completo,
        'CPF': inscricao.cpf,
        'Email': inscricao.email,
        ...inscricao.dados,
    };
    
    const fieldLabelMap = useMemo(() => {
        const map = new Map<string, string>();
        const config = formacao.subscription_form_config;
        if (!config) return map;

        // Mapeia campos padrão
        config.fields?.forEach((field: any) => {
            map.set(field.id, field.label);
        });

        // Mapeia campos customizados
        config.customFields?.forEach((field: any) => {
            map.set(field.id, field.label);
        });
        
        // Fallbacks para campos que podem estar nos dados mas não na config (ex: lotacao_especifica, escola)
        map.set('lotacao_especifica', 'Lotação Específica');
        map.set('escola', 'Unidade Escolar');
        map.set('regional', 'Regional');
        map.set('lotacao', 'Lotação');


        return map;
    }, [formacao]);

    const getLabel = (key: string) => {
        return fieldLabelMap.get(key) || key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());
    }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent onPointerDownOutside={(e) => e.preventDefault()} className="sm:max-w-lg">
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

                    const formattedKey = getLabel(key);
                    
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
