'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { STEPS } from '@/lib/steps';

type StepNavigationProps = {
  currentStep: number;
};

export function StepNavigation({ currentStep }: StepNavigationProps) {
  const previousStep = STEPS.find(s => s.step === currentStep - 1);
  const nextStep = STEPS.find(s => s.step === currentStep + 1);

  if (!previousStep && !nextStep) {
    return null;
  }

  return (
    <div className="mt-8 flex justify-between items-center border-t pt-6">
      <div>
        {previousStep && (
          <Link href={previousStep.href} passHref>
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Etapa Anterior: {previousStep.title}
            </Button>
          </Link>
        )}
      </div>
      <div>
        {nextStep && (
          <Link href={nextStep.href} passHref>
            <Button>
              Próxima Etapa: {nextStep.title}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}
