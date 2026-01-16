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
import { Loader2, Sun, Sunset, PlusCircle, Trash2, MapPin } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { updateAttendanceConfig } from '@/app/(app)/gerenciamento/actions';
import type { Formacao, Period, Geolocation } from '@/lib/types';
import { Switch } from '../ui/switch';
import { Separator } from '../ui/separator';

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

const getDefaultConfig = () => ({
  open: false,
  periods: {
    morning: { ...defaultPeriod, startTime: '08:00', endTime: '12:00' },
    afternoon: { ...defaultPeriod, startTime: '13:00', endTime: '17:00' },
  },
  geolocation: {
    enabled: false,
    locations: [],
  }
});

export function FrequenciaConfigSheet({ isOpen, setIsOpen, formacao }: FrequenciaConfigSheetProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState(() => {
    const existingConfig = formacao.attendance_list_info;
    const defaultConfig = getDefaultConfig();
    return {
      ...defaultConfig,
      ...existingConfig,
      periods: {
        morning: { ...defaultConfig.periods.morning, ...(existingConfig?.periods?.morning || {}) },
        afternoon: { ...defaultConfig.periods.afternoon, ...(existingConfig?.periods?.afternoon || {}) },
      },
      geolocation: {
        ...defaultConfig.geolocation,
        ...(existingConfig?.geolocation || {})
      }
    };
  });
  const [newLocation, setNewLocation] = useState({ latitude: '', longitude: '', radius: '' });


  const handlePeriodChange = (period: 'morning' | 'afternoon', property: keyof Period, value: any) => {
    setConfig(prevConfig => ({
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

  const handleGeoLocationChange = (property: string, value: any) => {
    setConfig(prevConfig => ({
      ...prevConfig,
      geolocation: {
        ...prevConfig.geolocation,
        [property]: value,
      }
    }));
  };
  
  const handleAddLocation = () => {
    const lat = parseFloat(newLocation.latitude);
    const lon = parseFloat(newLocation.longitude);
    const rad = parseInt(newLocation.radius, 10);

    if (isNaN(lat) || isNaN(lon) || isNaN(rad) || rad <= 0) {
      toast({ title: 'Valores de localização inválidos.', description: 'Latitude, longitude e raio devem ser números válidos.', variant: 'destructive'});
      return;
    }

    const location: Geolocation = {
      id: `loc_${Date.now()}`,
      latitude: lat,
      longitude: lon,
      radius: rad,
    };

    handleGeoLocationChange('locations', [...(config.geolocation?.locations || []), location]);
    setNewLocation({ latitude: '', longitude: '', radius: '' });
  };

  const handleRemoveLocation = (id: string) => {
    handleGeoLocationChange('locations', config.geolocation.locations.filter(loc => loc.id !== id));
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
        description: 'As configurações de frequência foram atualizadas.',
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
      <SheetContent className="sm:max-w-xl w-full flex flex-col">
        <SheetHeader>
          <SheetTitle>Configurar Frequência</SheetTitle>
          <SheetDescription>
            Defina os períodos, horários e geolocalização para o registro de frequência da formação: <span className="font-semibold text-foreground">{formacao.name}</span>.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto pr-6 pl-1 space-y-6 py-4">
          <PeriodConfig period="morning" label="Período Matutino" icon={Sun} />
          <PeriodConfig period="afternoon" label="Período Vespertino" icon={Sunset} />
          
          <Separator />
          
          <div className="p-4 border rounded-lg space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="enable-geolocation" className="flex items-center text-lg font-semibold gap-2">
                <MapPin className="h-5 w-5" />
                Validação por Geolocalização
              </Label>
              <Switch
                id="enable-geolocation"
                checked={config.geolocation?.enabled || false}
                onCheckedChange={(checked) => handleGeoLocationChange('enabled', checked)}
              />
            </div>
            {config.geolocation?.enabled && (
              <div className='space-y-4 pt-2'>
                <p className='text-sm text-muted-foreground'>
                  A frequência só será registrada se o participante estiver dentro do raio de um dos locais cadastrados.
                </p>
                <div className='space-y-2'>
                  <Label>Locais Permitidos</Label>
                  <div className='space-y-2'>
                    {config.geolocation.locations.map(loc => (
                      <div key={loc.id} className='flex items-center gap-2 p-2 border rounded-md bg-background'>
                        <div className='flex-1 text-xs'>
                          <p>Lat: {loc.latitude}, Lon: {loc.longitude}</p>
                          <p>Raio: {loc.radius}m</p>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => handleRemoveLocation(loc.id)}>
                          <Trash2 className='h-4 w-4 text-destructive' />
                        </Button>
                      </div>
                    ))}
                    {config.geolocation.locations.length === 0 && (
                      <p className='text-xs text-muted-foreground text-center py-2'>Nenhum local adicionado.</p>
                    )}
                  </div>
                </div>
                <div className='space-y-3 p-3 border-t'>
                  <Label className='font-semibold'>Adicionar Novo Local</Label>
                  <div className='grid grid-cols-1 sm:grid-cols-3 gap-2'>
                    <Input placeholder='Latitude' value={newLocation.latitude} onChange={e => setNewLocation({...newLocation, latitude: e.target.value})} />
                    <Input placeholder='Longitude' value={newLocation.longitude} onChange={e => setNewLocation({...newLocation, longitude: e.target.value})} />
                    <Input placeholder='Raio (metros)' type='number' value={newLocation.radius} onChange={e => setNewLocation({...newLocation, radius: e.target.value})} />
                  </div>
                  <Button size='sm' onClick={handleAddLocation} className='w-full'>
                    <PlusCircle className='mr-2 h-4 w-4' /> Adicionar Local
                  </Button>
                </div>
              </div>
            )}
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
