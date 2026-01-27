'use client';

import { useState } from 'react';
import type { Inscricao } from '@/lib/types';
import { EnsalamentoSetup, type SetupData } from './ensalamento-setup';
import * as actions from './actions';
import { useToast } from '@/hooks/use-toast';
import { EnsalamentoCriteria, type CriteriaFormValues } from './ensalamento-criteria';
import type { FormacaoWithCount } from './actions';
import { EnsalamentoResults, type EnsalamentoResult } from './ensalamento-results';

type EnsalamentoClientProps = {
    formations: FormacaoWithCount[];
};


export function EnsalamentoClient({ formations }: EnsalamentoClientProps) {
    const { toast } = useToast();
    const [step, setStep] = useState(1);
    const [isLoading, setIsLoading] = useState(false);
    
    const [setupData, setSetupData] = useState<SetupData | null>(null);
    const [participants, setParticipants] = useState<Inscricao[]>([]);
    const [criteriaData, setCriteriaData] = useState<CriteriaFormValues | null>(null);
    const [ensalamentoResult, setEnsalamentoResult] = useState<EnsalamentoResult | null>(null);

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
                toast({ title: "Nenhum participante encontrado", description: "A lista de participantes está vazia. Não é possível continuar.", variant: "destructive" });
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

    const generateEnsalamento = (data: CriteriaFormValues) => {
        if (!setupData || participants.length === 0) {
            toast({ title: 'Erro', description: 'Dados de configuração ou participantes ausentes.', variant: 'destructive' });
            return;
        }

        setIsLoading(true);
        setCriteriaData(data);

        const { roomCount, participantsPerRoom } = setupData;
        const { criterion, strategy } = data;

        const getCriterionValue = (p: Inscricao) => p.dados?.[criterion] || p[criterion as keyof Inscricao] || 'Sem critério';

        const groupedByCriterion = participants.reduce((acc, p) => {
            const value = getCriterionValue(p);
            if (!acc[value]) acc[value] = [];
            acc[value].push(p);
            return acc;
        }, {} as Record<string, Inscricao[]>);
        
        const generatedRooms: { name: string, participants: Inscricao[], criterionValue: string }[] = [];
        let unassignedParticipants: Inscricao[] = [];
        let roomIndex = 1;

        const groupEntries = Object.entries(groupedByCriterion);

        // First pass: create rooms with exclusive criteria
        for (const [value, groupParticipants] of groupEntries) {
            let currentGroup = [...groupParticipants];
            while(currentGroup.length >= participantsPerRoom && generatedRooms.length < roomCount) {
                const roomParticipants = currentGroup.splice(0, participantsPerRoom);
                generatedRooms.push({
                    name: `Sala ${roomIndex++}`,
                    participants: roomParticipants,
                    criterionValue: String(value)
                });
            }
            unassignedParticipants.push(...currentGroup); // Leftovers
        }
        
        // Second pass: fill remaining rooms based on strategy
        if (strategy === 'preferencial' && generatedRooms.length < roomCount) {
            let tempUnassigned = [...unassignedParticipants];
            unassignedParticipants = [];
            
            while (tempUnassigned.length >= participantsPerRoom && generatedRooms.length < roomCount) {
                const roomParticipants = tempUnassigned.splice(0, participantsPerRoom);
                generatedRooms.push({
                    name: `Sala ${roomIndex++}`,
                    participants: roomParticipants,
                    criterionValue: 'Mista'
                });
            }
            unassignedParticipants.push(...tempUnassigned);
        }

        const totalAlocados = generatedRooms.reduce((sum, room) => sum + room.participants.length, 0);

        setEnsalamentoResult({
            salas: generatedRooms,
            naoAlocados: unassignedParticipants,
            stats: {
                totalSalas: roomCount,
                totalParticipantes: participants.length,
                totalAlocados,
                totalNaoAlocados: unassignedParticipants.length,
            },
        });
        
        setIsLoading(false);
        setStep(3);
    };

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
                <EnsalamentoCriteria 
                    participants={participants} 
                    onGenerate={generateEnsalamento} 
                    isLoading={isLoading}
                />
            )}
             {step === 3 && ensalamentoResult && (
                <EnsalamentoResults result={ensalamentoResult} />
            )}
        </div>
    );
}
