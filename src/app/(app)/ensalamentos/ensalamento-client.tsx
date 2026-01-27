'use client';

import { useState } from 'react';
import type { Inscricao } from '@/lib/types';
import { EnsalamentoSetup, type SetupData } from './ensalamento-setup';
import * as actions from './actions';
import { useToast } from '@/hooks/use-toast';
import { EnsalamentoCriteria, type CriteriaFormValues } from './ensalamento-criteria';
import type { FormacaoWithCount } from './actions';
import { EnsalamentoResults, type EnsalamentoResult } from './ensalamento-results';
import { ForceDistributionDialog } from './force-distribution-dialog';


export function EnsalamentoClient({ formations }: { formations: FormacaoWithCount[] }) {
    const { toast } = useToast();
    const [step, setStep] = useState(1);
    const [isLoading, setIsLoading] = useState(false);
    
    const [setupData, setSetupData] = useState<SetupData | null>(null);
    const [participants, setParticipants] = useState<Inscricao[]>([]);
    const [criteriaData, setCriteriaData] = useState<CriteriaFormValues | null>(null);
    const [ensalamentoResult, setEnsalamentoResult] = useState<EnsalamentoResult | null>(null);

    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isForceDistributeModalOpen, setIsForceDistributeModalOpen] = useState(false);

    const handleBack = () => {
        setStep(prev => Math.max(1, prev - 1));
    };

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

    const handleMoveSelectedToRoom = (targetRoomName: string) => {
        if (!ensalamentoResult) return;
        
        setEnsalamentoResult(prevResult => {
            if (!prevResult) return null;

            const movingParticipants = prevResult.naoAlocados.filter(p => selectedIds.includes(p.id));
            const remainingUnassigned = prevResult.naoAlocados.filter(p => !selectedIds.includes(p.id));
            
            const newSalas = prevResult.salas.map(sala => {
                if (sala.name === targetRoomName) {
                    return { ...sala, participants: [...sala.participants, ...movingParticipants] };
                }
                return sala;
            });
            
            const totalAlocados = newSalas.reduce((sum, room) => sum + room.participants.length, 0);

            return {
                salas: newSalas,
                naoAlocados: remainingUnassigned,
                stats: {
                    ...prevResult.stats,
                    totalAlocados,
                    totalNaoAlocados: remainingUnassigned.length,
                }
            };
        });

        setSelectedIds([]);
        toast({ title: 'Participantes Movidos', description: `${selectedIds.length} participante(s) foram movidos para a sala ${targetRoomName}.`})
    };
    
    const handleForceDistribute = (strategy: 'new_rooms' | 'fill_existing') => {
        if (!ensalamentoResult || !setupData) return;
        const { roomCount, participantsPerRoom } = setupData;

        setEnsalamentoResult(prevResult => {
            if (!prevResult) return null;

            let currentSalas = [...prevResult.salas];
            let currentNaoAlocados = [...prevResult.naoAlocados];

            if (strategy === 'fill_existing') {
                if(currentSalas.length === 0) {
                    toast({ title: 'Nenhuma sala existente', description: 'Não é possível distribuir em salas que não existem.', variant: 'destructive' });
                    return prevResult;
                }
                currentNaoAlocados.forEach((participant, index) => {
                    const targetSalaIndex = index % currentSalas.length;
                    currentSalas[targetSalaIndex].participants.push(participant);
                });
                currentNaoAlocados = [];
            } else if (strategy === 'new_rooms') {
                let roomIndex = currentSalas.length + 1;
                while(currentNaoAlocados.length > 0 && currentSalas.length < roomCount) {
                    const roomParticipants = currentNaoAlocados.splice(0, participantsPerRoom);
                    currentSalas.push({
                        name: `Sala ${roomIndex++}`,
                        participants: roomParticipants,
                        criterionValue: 'Mista (Forçada)',
                    });
                }
            }
            
            const totalAlocados = currentSalas.reduce((sum, room) => sum + room.participants.length, 0);

            return {
                salas: currentSalas,
                naoAlocados: currentNaoAlocados,
                stats: {
                    ...prevResult.stats,
                    totalSalas: roomCount,
                    totalAlocados,
                    totalNaoAlocados: currentNaoAlocados.length,
                }
            }
        });
        
        setIsForceDistributeModalOpen(false);
        toast({ title: 'Distribuição Forçada Concluída!' });
    };

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
                    onBack={handleBack}
                />
            )}
             {step === 3 && ensalamentoResult && criteriaData && setupData && (
                <>
                    <EnsalamentoResults 
                        result={ensalamentoResult} 
                        criterion={criteriaData.criterion} 
                        selectedIds={selectedIds}
                        setSelectedIds={setSelectedIds}
                        onMoveToRoom={handleMoveSelectedToRoom}
                        onOpenForceDistribute={() => setIsForceDistributeModalOpen(true)}
                        onBack={handleBack}
                    />
                     <ForceDistributionDialog
                        isOpen={isForceDistributeModalOpen}
                        setIsOpen={setIsForceDistributeModalOpen}
                        onConfirm={handleForceDistribute}
                        existingRoomCount={ensalamentoResult.salas.length}
                        totalRoomCount={setupData.roomCount}
                    />
                </>
            )}
        </div>
    );
}
