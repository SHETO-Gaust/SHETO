'use client';

import { useState } from 'react';
import type { Formacao } from '@/lib/types';
import { EnsalamentoSetup } from './ensalamento-setup';

type EnsalamentoClientProps = {
    formations: Pick<Formacao, 'id' | 'name'>[];
};

export function EnsalamentoClient({ formations }: EnsalamentoClientProps) {
    const [step, setStep] = useState(1);
    // More state will be added later for inscritos, criteria, results etc.

    return (
        <div>
            {step === 1 && (
                <EnsalamentoSetup 
                    formations={formations} 
                    onProcess={(data) => {
                        console.log(data); // Placeholder for next step
                        setStep(2)
                    }}
                />
            )}
            {step === 2 && (
                <div>
                    <p>Passo 2: Definição de Critérios (em construção)</p>
                </div>
            )}
        </div>
    );
}
