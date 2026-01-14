'use client';

import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { updateSubscriptionFormConfig } from '@/app/(app)/gerenciamento/actions';
import type { Formacao } from '@/lib/types';
import { Switch } from '../ui/switch';
import { Separator } from '../ui/separator';

type FormBuilderSheetProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  formacao: Formacao;
};

const defaultFields = [
    { id: 'nomeCompleto', label: 'Nome Completo', type: 'text', required: true },
    { id: 'cpf', label: 'CPF', type: 'text', required: true },
    { id: 'email', label: 'Email', type: 'email', required: true },
    { id: 'regional', label: 'Regional', type: 'select', required: true },
    { id: 'lotacao', label: 'Lotação', type: 'radio', required: true },
];

export function FormBuilderSheet({ isOpen, setIsOpen, formacao }: FormBuilderSheetProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formConfig, setFormConfig] = useState(
    formacao.subscription_form_config || { fields: defaultFields }
  );

  const handleFieldChange = (fieldId: string, property: string, value: any) => {
    setFormConfig((prevConfig: any) => ({
      ...prevConfig,
      fields: prevConfig.fields.map((field: any) =>
        field.id === fieldId ? { ...field, [property]: value } : field
      ),
    }));
  };

  const handleSave = async () => {
    setLoading(true);
    const result = await updateSubscriptionFormConfig(formacao.id, formConfig);
    setLoading(false);

    if (result.error) {
      toast({
        title: 'Erro ao salvar',
        description: result.error,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Configurações Salvas',
        description: 'O formulário de inscrição foi atualizado com sucesso.',
      });
      setIsOpen(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent className="sm:max-w-2xl w-full flex flex-col">
        <SheetHeader>
          <SheetTitle>Construtor de Formulário de Inscrição</SheetTitle>
          <SheetDescription>
            Personalize os campos para a inscrição na formação: <span className="font-semibold text-foreground">{formacao.name}</span>.
          </SheetDescription>
        </SheetHeader>
        
        <div className="flex-1 overflow-y-auto pr-6 pl-1 space-y-6 py-4">
            <div>
                <h4 className="text-lg font-semibold mb-4">Campos Padrão</h4>
                <div className="space-y-4">
                    {formConfig.fields.filter((f: any) => f.required).map((field: any) => (
                        <div key={field.id} className="p-4 border rounded-lg">
                            <div className="flex items-center justify-between">
                                <Label htmlFor={`field-${field.id}`} className="text-base">{field.label}</Label>
                                <div className="flex items-center space-x-2">
                                    <Switch
                                        id={`field-${field.id}`}
                                        checked={!field.hidden}
                                        onCheckedChange={(checked) => handleFieldChange(field.id, 'hidden', !checked)}
                                    />
                                    <Label htmlFor={`field-${field.id}`}>{field.hidden ? 'Oculto' : 'Visível'}</Label>
                                </div>
                            </div>
                             <p className="text-sm text-muted-foreground mt-1">
                                Este campo é obrigatório no sistema.
                             </p>
                        </div>
                    ))}
                </div>
            </div>

            <Separator />

            <div>
                <h4 className="text-lg font-semibold mb-4">Campos Personalizados</h4>
                 <div className="text-center text-muted-foreground border-2 border-dashed rounded-lg p-8">
                    <p>Funcionalidade de adicionar campos personalizados em breve.</p>
                </div>
            </div>
        </div>

        <SheetFooter className="mt-auto pt-4 border-t">
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar Configurações
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
