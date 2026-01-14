'use client';

import { useState } from 'react';
import type { Formacao } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Settings, AlertCircle } from 'lucide-react';
import { FormBuilderSheet } from './form-builder-sheet';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

type GerenciamentoCardProps = {
  formacao: Formacao;
};

const PendencyItem = ({ 
  name, 
  status, 
  onManageClick,
  onToggle,
  isToggleVisible,
  isToggleOn
}: { 
  name: string;
  status: 'done' | 'pending' | 'configured';
  onManageClick?: () => void;
  onToggle?: (checked: boolean) => void;
  isToggleVisible?: boolean;
  isToggleOn?: boolean;
}) => {
    const getStatusIcon = () => {
        switch (status) {
            case 'done':
                return <CheckCircle className="h-5 w-5 text-green-500" />;
            case 'pending':
                return <XCircle className="h-5 w-5 text-red-500" />;
            case 'configured':
                 return <AlertCircle className="h-5 w-5 text-orange-500" />;
            default:
                return <XCircle className="h-5 w-5 text-red-500" />;
        }
    }

    return (
        <div className="flex items-center justify-between p-3 border rounded-md">
            <div className="flex items-center gap-3">
            {getStatusIcon()}
            <span className="font-medium">{name}</span>
            </div>
            <div className="flex items-center gap-4">
                 {isToggleVisible && onToggle && (
                    <div className="flex items-center space-x-2">
                        <Switch
                            id={`toggle-${name.toLowerCase()}`}
                            checked={isToggleOn}
                            onCheckedChange={onToggle}
                        />
                        <Label htmlFor={`toggle-${name.toLowerCase()}`}>{isToggleOn ? 'Ligada' : 'Desligada'}</Label>
                    </div>
                )}
                {onManageClick && (
                <Button variant="outline" size="sm" onClick={onManageClick}>
                    <Settings className="mr-2 h-4 w-4" />
                    Gerenciar
                </Button>
                )}
            </div>
        </div>
    );
};


export function GerenciamentoCard({ formacao }: GerenciamentoCardProps) {
    const [isFormBuilderOpen, setIsFormBuilderOpen] = useState(false);
    const [isSubscriptionOn, setIsSubscriptionOn] = useState(false); // In a real app, this would come from `formacao.subscription_form_config.open`

    const handleSubscriptionToggle = (checked: boolean) => {
        setIsSubscriptionOn(checked);
        // Here you would call a server action to update the `subscription_form_config.open` status in the database.
    };

    const getSubscriptionStatus = (): 'done' | 'pending' | 'configured' => {
        if (!formacao.subscription_form_config) {
            return 'pending';
        }
        if (isSubscriptionOn) {
            return 'done';
        }
        return 'configured';
    }

    const pendencias = [
        { name: 'Formadores', status: formacao.gfcpe_info?.formadores ? 'done' : 'pending' },
        { name: 'Ensalamento', status: formacao.gfcpe_info?.ensalamento ? 'done' : 'pending' },
        { 
            name: 'Inscrição', 
            status: getSubscriptionStatus(), 
            onManageClick: () => setIsFormBuilderOpen(true),
            onToggle: handleSubscriptionToggle,
            isToggleVisible: !!formacao.subscription_form_config,
            isToggleOn: isSubscriptionOn
        },
        { name: 'Frequência', status: formacao.attendance_list_info ? 'done' : 'pending' },
        { name: 'Avaliação', status: formacao.gadsg_info?.avaliacao ? 'done' : 'pending' },
    ];


  return (
    <>
        <Card>
            <CardHeader>
                <CardTitle>{formacao.name}</CardTitle>
                <CardDescription>
                    Gerencie as pendências e configurações desta formação.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-3">
                {pendencias.map((p, index) => (
                    <PendencyItem 
                        key={index} 
                        name={p.name} 
                        status={p.status as any} 
                        onManageClick={p.onManageClick}
                        onToggle={p.onToggle}
                        isToggleVisible={p.isToggleVisible}
                        isToggleOn={p.isToggleOn}
                    />
                ))}
                </div>
            </CardContent>
        </Card>
        {isFormBuilderOpen && (
            <FormBuilderSheet
                isOpen={isFormBuilderOpen}
                setIsOpen={setIsFormBuilderOpen}
                formacao={formacao}
            />
        )}
    </>
  );
}
