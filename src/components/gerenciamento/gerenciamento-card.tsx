'use client';

import { useState } from 'react';
import type { Formacao, Inscricao, Formador } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Settings, AlertCircle, Users, FileUp, Clock, UserPlus } from 'lucide-react';
import { FormBuilderSheet } from './form-builder-sheet';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toggleSubscription, toggleAttendance } from '@/app/(app)/gerenciamento/actions';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { InscritosSheet } from './inscritos-sheet';
import { UploadInscritosDialog } from './upload-inscritos-dialog';
import { FrequenciaConfigSheet } from './frequencia-config-sheet';
import { FormadoresSheet } from './formadores-sheet';

type GerenciamentoCardProps = {
  formacao: Formacao;
  inscricoes: Inscricao[];
  formadores: Formador[];
  onUpdate: () => void;
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
  viewCount,
  manageLabel = 'Gerenciar'
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
  manageLabel?: string;
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
                        {name === 'Frequência' && <Clock className="mr-2 h-4 w-4" />}
                        {name === 'Inscrição' && <Settings className="mr-2 h-4 w-4" />}
                        {name === 'Formadores' && <UserPlus className="mr-2 h-4 w-4" />}
                        {manageLabel}
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


export function GerenciamentoCard({ formacao, inscricoes, formadores, onUpdate }: GerenciamentoCardProps) {
    const { toast } = useToast();
    const [isFormBuilderOpen, setIsFormBuilderOpen] = useState(false);
    const [isFrequenciaConfigOpen, setIsFrequenciaConfigOpen] = useState(false);
    const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
    const [isInscritosSheetOpen, setIsInscritosSheetOpen] = useState(false);
    const [isFormadoresSheetOpen, setIsFormadoresSheetOpen] = useState(false);
    const [isSubToggleLoading, setIsSubToggleLoading] = useState(false);
    const [isAttToggleLoading, setIsAttToggleLoading] = useState(false);

    const isSubscriptionOpen = formacao.subscription_form_config?.open || false;
    const isAttendanceOpen = formacao.attendance_list_info?.open || false;
    const inscritosCount = inscricoes.length;

    const handleSubscriptionToggle = async () => {
        setIsSubToggleLoading(true);
        const result = await toggleSubscription(formacao.id, formacao.subscription_form_config);
        setIsSubToggleLoading(false);

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
            onUpdate();
        }
    };
    
    const handleAttendanceToggle = async () => {
        setIsAttToggleLoading(true);
        const result = await toggleAttendance(formacao.id, formacao.attendance_list_info);
        setIsAttToggleLoading(false);

        if (result.error) {
            toast({
                title: 'Erro',
                description: result.error,
                variant: 'destructive',
            });
        } else {
            toast({
                title: 'Status da frequência alterado!',
                description: `A coleta de frequência para "${formacao.name}" foi ${!isAttendanceOpen ? 'ligada' : 'desligada'}.`,
            });
            onUpdate();
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

    const getAttendanceStatus = (): 'done' | 'pending' | 'configured' => {
        if (!formacao.attendance_list_info?.periods) {
            return 'pending';
        }
        if (isAttendanceOpen) {
            return 'done';
        }
        return 'configured';
    }


    const pendencias = [
        { 
            name: 'Formadores', 
            status: formadores.length > 0 ? 'done' : 'pending',
            onManageClick: () => setIsFormadoresSheetOpen(true)
        },
        { name: 'Ensalamento', status: formacao.gfcpe_info?.ensalamento ? 'done' : 'pending' },
        { 
            name: 'Inscrição', 
            status: getSubscriptionStatus(), 
            onManageClick: () => setIsFormBuilderOpen(true),
            onUploadClick: formacao.subscription_form_config ? () => setIsUploadDialogOpen(true) : undefined,
            onToggle: handleSubscriptionToggle,
            isToggleVisible: !!formacao.subscription_form_config,
            isToggleOn: isSubscriptionOpen,
            isToggleLoading: isSubToggleLoading,
            onViewClick: inscritosCount > 0 ? () => setIsInscritosSheetOpen(true) : undefined,
            viewCount: inscritosCount,
        },
        { 
            name: 'Frequência', 
            status: getAttendanceStatus(),
            onManageClick: () => setIsFrequenciaConfigOpen(true),
            onToggle: formacao.attendance_list_info?.periods ? handleAttendanceToggle : undefined,
            isToggleVisible: !!formacao.attendance_list_info?.periods,
            isToggleOn: isAttendanceOpen,
            isToggleLoading: isAttToggleLoading,
            manageLabel: 'Configurar Horários',
        },
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
                        manageLabel={p.manageLabel}
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
                onUpdate={onUpdate}
            />
        )}
        {isFrequenciaConfigOpen && (
            <FrequenciaConfigSheet
                isOpen={isFrequenciaConfigOpen}
                setIsOpen={setIsFrequenciaConfigOpen}
                formacao={formacao}
                onUpdate={onUpdate}
            />
        )}
        {isUploadDialogOpen && (
            <UploadInscritosDialog
                isOpen={isUploadDialogOpen}
                setIsOpen={setIsUploadDialogOpen}
                formacao={formacao}
                onUpdate={onUpdate}
            />
        )}
        {isInscritosSheetOpen && (
            <InscritosSheet
                isOpen={isInscritosSheetOpen}
                setIsOpen={setIsInscritosSheetOpen}
                formacao={formacao}
                inscricoes={inscricoes}
                onUpdate={onUpdate}
            />
        )}
        {isFormadoresSheetOpen && (
            <FormadoresSheet
                isOpen={isFormadoresSheetOpen}
                setIsOpen={setIsFormadoresSheetOpen}
                formacao={formacao}
                formadores={formadores}
                onUpdate={onUpdate}
            />
        )}
    </>
  );
}
