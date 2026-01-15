'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function RealTimeClock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timerId = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timerId);
  }, []);

  return (
    <div className="text-center">
      <p className="text-4xl font-bold tracking-tighter">
        {format(time, 'HH:mm:ss')}
      </p>
      <p className="text-sm text-muted-foreground">
        {format(time, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
      </p>
    </div>
  );
}
