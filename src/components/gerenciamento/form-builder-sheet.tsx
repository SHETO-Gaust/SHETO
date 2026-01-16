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
import { Loader2, PlusCircle, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { updateSubscriptionFormConfig } from '@/app/(app)/gerenciamento/actions';
import type { Formacao } from '@/lib/types';
import { Switch } from '../ui/switch';
import { Separator } from '../ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

type FormBuilderSheetProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  formacao: Formacao;
  onUpdate: () => void;
};

const defaultFields = [
    { id: 'nomeCompleto', label: 'Nome Completo', type: 'text', required: true, hidden: false },
    { id: 'cpf', label: 'CPF', type: 'text', required: true, hidden: false },
    { id: 'email', label: 'Email', type: 'email', required: true, hidden: false },
    { id: 'regional', label: 'Regional', type: 'select', required: true, hidden: false },
    { id: 'lotacao', label: 'Lotação', type: 'radio', required: true, hidden: false },
];

const initialCustomField = {
  id: '',
  label: '',
  type: 'text',
  options: [],
};


export function FormBuilderSheet({ isOpen, setIsOpen, formacao, onUpdate }: FormBuilderSheetProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formConfig, setFormConfig] = useState(
    formacao.subscription_form_config || { fields: defaultFields, customFields: [] }
  );
  const [newCustomField, setNewCustomField] = useState<any>(null);
  const [optionInput, setOptionInput] = useState('');

  const handleFieldChange = (fieldId: string, property: string, value: any) => {
    setFormConfig((prevConfig: any) => ({
      ...prevConfig,
      fields: prevConfig.fields.map((field: any) =>
        field.id === fieldId ? { ...field, [property]: value } : field
      ),
    }));
  };
  
  const handleCustomFieldChange = (fieldId: string, property: string, value: any) => {
    setFormConfig((prevConfig: any) => ({
      ...prevConfig,
      customFields: prevConfig.customFields.map((field: any) =>
        field.id === fieldId ? { ...field, [property]: value } : field
      ),
    }));
  };

  const removeCustomField = (fieldId: string) => {
    setFormConfig((prevConfig: any) => ({
        ...prevConfig,
        customFields: prevConfig.customFields.filter((field: any) => field.id !== fieldId),
    }));
  };

  const handleAddNewCustomField = () => {
    setNewCustomField({ ...initialCustomField, id: `custom_${Date.now()}` });
  };
  
  const handleSaveNewCustomField = () => {
    if (newCustomField && newCustomField.label) {
      setFormConfig((prevConfig: any) => ({
        ...prevConfig,
        customFields: [...(prevConfig.customFields || []), newCustomField],
      }));
      setNewCustomField(null);
    } else {
        toast({ title: "O título da pergunta é obrigatório.", variant: 'destructive' })
    }
  };

  const addOptionToNewField = () => {
    if (optionInput.trim() !== '') {
      setNewCustomField((prev: any) => ({
        ...prev,
        options: [...(prev.options || []), optionInput.trim()],
      }));
      setOptionInput('');
    }
  };

  const removeOptionFromNewField = (option: string) => {
    setNewCustomField((prev: any) => ({
        ...prev,
        options: prev.options.filter((o: string) => o !== option),
    }));
  };

  const handleSave = async () => {
    if (newCustomField) {
        toast({ title: "Você tem um campo personalizado não salvo.", description: "Salve ou cancele a criação do novo campo antes de salvar as configurações.", variant: 'destructive'});
        return;
    }
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
      onUpdate();
      setIsOpen(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent className="sm:max-w-3xl w-full flex flex-col">
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
                    {formConfig.fields.map((field: any) => (
                        <div key={field.id} className="p-4 border rounded-lg bg-slate-50/50">
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
                                {field.id !== 'email' && field.id !== 'nomeCompleto' && field.id !== 'cpf' ? 'Este campo é obrigatório no sistema.' : 'Este campo é obrigatório e sempre visível.'}
                             </p>
                        </div>
                    ))}
                </div>
            </div>

            <Separator />

            <div>
                <div className="flex justify-between items-center mb-4">
                    <h4 className="text-lg font-semibold">Campos Personalizados</h4>
                    <Button variant="outline" size="sm" onClick={handleAddNewCustomField} disabled={!!newCustomField}>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Adicionar Campo
                    </Button>
                </div>
                 <div className="space-y-4">
                    {/* Saved Custom Fields */}
                    {formConfig.customFields?.map((field: any) => (
                         <div key={field.id} className="p-4 border rounded-lg">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-semibold">{field.label}</p>
                                    <p className="text-sm text-muted-foreground">Tipo: {field.type}</p>
                                </div>
                                <Button variant="ghost" size="icon" onClick={() => removeCustomField(field.id)}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                            </div>
                         </div>
                    ))}

                    {/* New Custom Field Builder */}
                    {newCustomField && (
                        <div className="p-4 border-2 border-primary/50 rounded-lg space-y-4 bg-primary/5">
                            <h5 className="font-semibold">Novo Campo Personalizado</h5>
                            <div className="space-y-2">
                                <Label>Título da Pergunta</Label>
                                <Input 
                                    placeholder="Ex: Qual sua função?" 
                                    value={newCustomField.label}
                                    onChange={(e) => setNewCustomField({ ...newCustomField, label: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Tipo de Campo</Label>
                                <Select
                                    value={newCustomField.type}
                                    onValueChange={(value) => setNewCustomField({ ...newCustomField, type: value })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecione o tipo" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="text">Texto</SelectItem>
                                        <SelectItem value="multiple-choice">Múltipla Escolha</SelectItem>
                                        <SelectItem value="checkboxes">Caixas de Seleção</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {(newCustomField.type === 'multiple-choice' || newCustomField.type === 'checkboxes') && (
                                <div className="space-y-2 pt-2">
                                    <Label>Opções de Resposta</Label>
                                    <div className="flex gap-2">
                                        <Input 
                                            placeholder="Digite a opção" 
                                            value={optionInput}
                                            onChange={(e) => setOptionInput(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && addOptionToNewField()}
                                        />
                                        <Button onClick={addOptionToNewField}>Adicionar</Button>
                                    </div>
                                    <div className="space-y-2 mt-2">
                                        {newCustomField.options.map((option: string, index: number) => (
                                            <div key={index} className="flex items-center justify-between bg-background p-2 rounded-md border">
                                                <span>{option}</span>
                                                <Button variant="ghost" size="icon" onClick={() => removeOptionFromNewField(option)}>
                                                    <Trash2 className="h-4 w-4 text-destructive/70"/>
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="flex justify-end gap-2 pt-4">
                                <Button variant="ghost" onClick={() => setNewCustomField(null)}>Cancelar</Button>
                                <Button onClick={handleSaveNewCustomField}>Salvar Campo</Button>
                            </div>
                        </div>
                    )}

                    {!formConfig.customFields?.length && !newCustomField && (
                        <div className="text-center text-muted-foreground border-2 border-dashed rounded-lg p-8">
                            <p>Nenhum campo personalizado adicionado.</p>
                        </div>
                    )}
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
