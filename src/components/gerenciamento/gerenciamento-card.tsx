'use client';

import { useState } from 'react';
import type { Formacao, Inscricao } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Settings, AlertCircle, Users, FileUp } from 'lucide-react';
import { FormBuilderSheet } from './form-builder-sheet';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toggleSubscription } from '@/app/(app)/gerenciamento/actions';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { InscritosSheet } from './inscritos-sheet';
import { UploadInscritosDialog } from './upload-inscritos-dialog';

type GerenciamentoCardProps = {
  formacao: Formacao;
  inscricoes: Inscricao[];
};

const PendencyItem = ({ 
  name, 
  status, 
  onManageClick,
  onUploadClick,
  onToggle,
  isToggleVisible,
  isToggleOn,
  isToggleLoading,
  onViewClick,
  viewCount
}: { 
  name: string;
  status: 'done' | 'pending' | 'configured';
  onManageClick?: () => void;
  onUploadClick?: () => void;
  onToggle?: (checked: boolean) => void;
  isToggleVisible?: boolean;
  isToggleOn?: boolean;
  isToggleLoading?: boolean;
  onViewClick?: () => void;
  viewCount?: number;
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
        <div className="flex items-center justify-between p-3 border rounded-md min-h-[62px]">
            <div className="flex items-center gap-3">
            {getStatusIcon()}
            <span className="font-medium">{name}</span>
            </div>
            <div className="flex items-center gap-4">
                 {isToggleVisible && onToggle && (
                    <div className="flex items-center space-x-2">
                        {isToggleLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                           <Switch
                                id={`toggle-${name.toLowerCase()}`}
                                checked={isToggleOn}
                                onCheckedChange={onToggle}
                           />
                        )}
                        <Label htmlFor={`toggle-${name.toLowerCase()}`}>{isToggleOn ? 'Ligada' : 'Desligada'}</Label>
                    </div>
                )}
                {onManageClick && (
                    <Button variant="outline" size="sm" onClick={onManageClick}>
                        <Settings className="mr-2 h-4 w-4" />
                        Gerenciar
                    </Button>
                )}
                {onUploadClick && (
                    <Button variant="outline" size="sm" onClick={onUploadClick}>
                        <FileUp className="mr-2 h-4 w-4" />
                        Importar via Planilha
                    </Button>
                )}
                {onViewClick && (
                    <Button variant="secondary" size="sm" onClick={onViewClick}>
                        <Users className="mr-2 h-4 w-4" />
                        Ver Inscritos ({viewCount})
                    </Button>
                )}
            </div>
        </div>
    );
};


export function GerenciamentoCard({ formacao, inscricoes }: GerenciamentoCardProps) {
    const { toast } = useToast();
    const [isFormBuilderOpen, setIsFormBuilderOpen] = useState(false);
    const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
    const [isInscritosSheetOpen, setIsInscritosSheetOpen] = useState(false);
    const [isToggleLoading, setIsToggleLoading] = useState(false);
    
    const isSubscriptionOpen = formacao.subscription_form_config?.open || false;
    const inscritosCount = inscricoes.length;

    const handleSubscriptionToggle = async () => {
        setIsToggleLoading(true);
        const result = await toggleSubscription(formacao.id, formacao.subscription_form_config);
        setIsToggleLoading(false);

        if (result.error) {
            toast({
                title: 'Erro',
                description: result.error,
                variant: 'destructive',
            });
        } else {
            toast({
                title: 'Status da inscrição alterado!',
                description: `As inscrições para "${formacao.name}" foram ${!isSubscriptionOpen ? 'abertas' : 'fechadas'}.`,
            });
        }
    };

    const getSubscriptionStatus = (): 'done' | 'pending' | 'configured' => {
        if (!formacao.subscription_form_config) {
            return 'pending';
        }
        if (isSubscriptionOpen) {
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
            onUploadClick: formacao.subscription_form_config ? () => setIsUploadDialogOpen(true) : undefined,
            onToggle: handleSubscriptionToggle,
            isToggleVisible: !!formacao.subscription_form_config,
            isToggleOn: isSubscriptionOpen,
            isToggleLoading,
            onViewClick: inscritosCount > 0 ? () => setIsInscritosSheetOpen(true) : undefined,
            viewCount: inscritosCount,
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
                        onUploadClick={p.onUploadClick}
                        onToggle={p.onToggle}
                        isToggleVisible={p.isToggleVisible}
                        isToggleOn={p.isToggleOn}
                        isToggleLoading={p.isToggleLoading}
                        onViewClick={p.onViewClick}
                        viewCount={p.viewCount}
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
        {isUploadDialogOpen && (
            <UploadInscritosDialog
                isOpen={isUploadDialogOpen}
                setIsOpen={setIsUploadDialogOpen}
                formacao={formacao}
            />
        )}
        {isInscritosSheetOpen && (
            <InscritosSheet
                isOpen={isInscritosSheetOpen}
                setIsOpen={setIsInscritosSheetOpen}
                formacao={formacao}
                inscricoes={inscricoes}
            />
        )}
    </>
  );
}
