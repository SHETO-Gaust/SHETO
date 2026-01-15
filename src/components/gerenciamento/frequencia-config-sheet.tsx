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
import { Loader2, Sun, Sunset } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { updateAttendanceConfig } from '@/app/(app)/gerenciamento/actions';
import type { Formacao, Period } from '@/lib/types';
import { Switch } from '../ui/switch';

type FrequenciaConfigSheetProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  formacao: Formacao;
};

const defaultPeriod: Period = {
  enabled: false,
  startTime: '08:00',
  endTime: '12:00',
};

export function FrequenciaConfigSheet({ isOpen, setIsOpen, formacao }: FrequenciaConfigSheetProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState(
    formacao.attendance_list_info || {
      periods: {
        morning: { ...defaultPeriod, startTime: '08:00', endTime: '12:00' },
        afternoon: { ...defaultPeriod, startTime: '13:00', endTime: '17:00' },
      },
    }
  );

  const handlePeriodChange = (period: 'morning' | 'afternoon', property: keyof Period, value: any) => {
    setConfig((prevConfig: any) => ({
      ...prevConfig,
      periods: {
        ...prevConfig.periods,
        [period]: {
          ...prevConfig.periods[period],
          [property]: value,
        },
      },
    }));
  };

  const handleSave = async () => {
    setLoading(true);
    const result = await updateAttendanceConfig(formacao.id, config);
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
        description: 'Os horários de frequência foram atualizados.',
      });
      setIsOpen(false);
    }
  };

  const PeriodConfig = ({
    period,
    label,
    icon: Icon,
  }: {
    period: 'morning' | 'afternoon';
    label: string;
    icon: React.ElementType;
  }) => (
    <div className="p-4 border rounded-lg space-y-4">
      <div className="flex items-center justify-between">
        <Label htmlFor={`enable-${period}`} className="flex items-center text-lg font-semibold gap-2">
          <Icon className="h-5 w-5" />
          {label}
        </Label>
        <Switch
          id={`enable-${period}`}
          checked={config.periods[period]?.enabled || false}
          onCheckedChange={(checked) => handlePeriodChange(period, 'enabled', checked)}
        />
      </div>
      {config.periods[period]?.enabled && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor={`start-${period}`}>Horário de Início</Label>
            <Input
              id={`start-${period}`}
              type="time"
              value={config.periods[period]?.startTime || '00:00'}
              onChange={(e) => handlePeriodChange(period, 'startTime', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`end-${period}`}>Horário de Fim</Label>
            <Input
              id={`end-${period}`}
              type="time"
              value={config.periods[period]?.endTime || '00:00'}
              onChange={(e) => handlePeriodChange(period, 'endTime', e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  );

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent className="sm:max-w-lg w-full flex flex-col">
        <SheetHeader>
          <SheetTitle>Configurar Horários de Frequência</SheetTitle>
          <SheetDescription>
            Defina os períodos e horários para o registro de frequência da formação: <span className="font-semibold text-foreground">{formacao.name}</span>.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto pr-6 pl-1 space-y-6 py-4">
          <PeriodConfig period="morning" label="Período Matutino" icon={Sun} />
          <PeriodConfig period="afternoon" label="Período Vespertino" icon={Sunset} />
        </div>

        <SheetFooter className="mt-auto pt-4 border-t">
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar Horários
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
