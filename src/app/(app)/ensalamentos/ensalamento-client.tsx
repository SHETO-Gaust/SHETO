'use client';

import { useState } from 'react';
import type { Formacao, Inscricao } from '@/lib/types';
import { EnsalamentoSetup, type SetupData } from './ensalamento-setup';
import * as actions from './actions';
import { useToast } from '@/hooks/use-toast';
import { EnsalamentoCriteria } from './ensalamento-criteria';
import type { FormacaoWithCount } from './actions';

type EnsalamentoClientProps = {
    formations: FormacaoWithCount[];
};


export function EnsalamentoClient({ formations }: EnsalamentoClientProps) {
    const { toast } = useToast();
    const [step, setStep] = useState(1);
    const [isLoading, setIsLoading] = useState(false);
    
    const [setupData, setSetupData] = useState<SetupData | null>(null);
    const [participants, setParticipants] = useState<Inscricao[]>([]);

    const processAndContinue = async (data: SetupData, parsedParticipants?: Inscricao[]) => {
        setIsLoading(true);
        setSetupData(data);
        try {
            let participantList: Inscricao[] = [];
            if (data.source === 'system') {
                participantList = await actions.getInscritosForEnsalamento(data.formationId);
            } else if (parsedParticipants) {
                participantList = parsedParticipants;
            }

            if (participantList.length === 0) {
                toast({ title: "Nenhum participante encontrado", description: "A lista de participantes está vazia. Não é possível continuar.", variant: "warning" });
                setIsLoading(false);
                return;
            }

            setParticipants(participantList);
            setStep(2);
        } catch(error: any) {
            toast({ title: "Erro ao buscar dados", description: error.message, variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    }


    return (
        <div className="space-y-6">
            {step === 1 && (
                <EnsalamentoSetup 
                    formations={formations} 
                    onProcess={processAndContinue}
                    isLoading={isLoading}
                />
            )}
            {step === 2 && (
                <EnsalamentoCriteria participants={participants} onGenerate={() => setStep(3)} />
            )}
             {step === 3 && (
                <div>
                    <p>Passo 3: Resultados (em construção)</p>
                </div>
            )}
        </div>
    );
}
