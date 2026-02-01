'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type StepCardProps = {
  step: number;
  title: string;
  icon: React.ElementType;
  href: string;
  disabled?: boolean;
};

export function StepCard({ step, title, icon: Icon, href, disabled }: StepCardProps) {
  const content = (
    <Card className="hover:border-primary/80 hover:shadow-lg transition-all h-full">
      <CardContent className="p-4 flex flex-col items-center justify-center text-center gap-3">
        <Icon className="h-8 w-8 text-primary" />
        <div className="flex flex-col gap-1">
            <p className="font-semibold">{title}</p>
            <Badge variant="outline" className="self-center">Passo {step}</Badge>
        </div>
      </CardContent>
    </Card>
  );
  
  if (disabled) {
    return <div className="opacity-50 cursor-not-allowed">{content}</div>
  }

  return (
    <Link href={href} className="focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-lg">
      {content}
    </Link>
  );
}
