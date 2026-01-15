'use client';

import { useState, useEffect } from 'react';
import { formatInTimeZone } from 'date-fns-tz';
import { ptBR } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';

export function RealTimeClock() {
  const [time, setTime] = useState<Date | null>(null);
  const saoPauloTimeZone = 'America/Sao_Paulo';

  useEffect(() => {
    // Set the initial time on the client to avoid hydration mismatch
    setTime(new Date());

    const timerId = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timerId);
  }, []);

  if (!time) {
    return (
       <div className="text-center space-y-2">
            <Skeleton className="h-10 w-48 mx-auto" />
            <Skeleton className="h-5 w-64 mx-auto" />
       </div>
    );
  }

  return (
    <div className="text-center">
      <p className="text-4xl font-bold tracking-tighter">
        {formatInTimeZone(time, saoPauloTimeZone, 'HH:mm:ss')}
      </p>
      <p className="text-sm text-muted-foreground">
        {formatInTimeZone(time, saoPauloTimeZone, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
      </p>
    </div>
  );
}
