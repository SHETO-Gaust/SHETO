'use client';

import * as React from 'react';
import type { EnsalamentoResult, Inscricao, Sala, SetupData, CriteriaFormValues } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Users, Users2, UserCheck, UserX, Move, Trash2, ArrowLeft, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SaveEnsalamentoDialog } from './save-ensalamento-dialog';
import type { SavedEnsalamento } from './actions';

const StatCard = ({ title, value, icon: Icon }: { title: string; value: number | string; icon: React.ElementType }) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">{title}</CardTitle>
      <Icon className="h-4 w-4 text-muted-foreground" />
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">{value}</div>
    </CardContent>
  </Card>
);

const ParticipantsTable = ({
  participants,
  criterion,
  criterionLabel,
  selectedIds,
  onSelectAll,
  onSelectRow,
}: {
  participants: Inscricao[],
  criterion: string,
  criterionLabel: string,
  selectedIds: string[],
  onSelectAll: (checked: boolean | 'indeterminate') => void,
  onSelectRow: (id: string, checked: boolean) => void,
}) => {
    const getCriterionValue = (p: Inscricao) => p.dados?.[criterion] || p[criterion as keyof Inscricao] || 'N/A';

    return (
        <div className="rounded-md border max-h-96 overflow-y-auto">
            <Table>
            <TableHeader className="sticky top-0 bg-muted/50">
                <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={participants.length > 0 && selectedIds.length === participants.length ? true : selectedIds.length > 0 ? 'indeterminate' : false}
                    onCheckedChange={onSelectAll}
                  />
                </TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>CPF</TableHead>
                <TableHead>Regional</TableHead>
                <TableHead>{criterionLabel}</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {participants.map(p => (
                <TableRow key={p.id} data-state={selectedIds.includes(p.id) ? 'selected' : ''}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.includes(p.id)}
                        onCheckedChange={(checked) => onSelectRow(p.id, !!checked)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{p.nome_completo}</TableCell>
                    <TableCell>{p.cpf}</TableCell>
                    <TableCell>{p.dados?.regional || 'N/A'}</TableCell>
                    <TableCell>{getCriterionValue(p)}</TableCell>
                </TableRow>
                ))}
            </TableBody>
            </Table>
        </div>
    );
};

const BulkMoveBar = ({ salas, onMove, selectedCount }: { salas: Sala[], onMove: (targetRoom: string) => void, selectedCount: number }) => {
    const [targetRoom, setTargetRoom] = React.useState('');

    return (
        <Card className="mb-4 bg-muted/50">
            <CardContent className="p-3 flex items-center justify-between">
                <p className="text-sm font-semibold">{selectedCount} participante(s) selecionado(s)</p>
                <div className="flex items-center gap-2">
                    <Select value={targetRoom} onValueChange={setTargetRoom}>
                        <SelectTrigger className="w-[250px]">
                            <SelectValue placeholder="Selecione uma sala de destino..." />
                        </SelectTrigger>
                        <SelectContent>
                            {salas.map(sala => (
                                <SelectItem key={sala.name} value={sala.name}>
                                    {sala.name} ({sala.participants.length} pessoas)
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button onClick={() => onMove(targetRoom)} disabled={!targetRoom}>
                        <Move className="mr-2 h-4 w-4" />
                        Mover
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

const formatLabel = (key: string) => {
    return key
        .replace(/_/g, ' ')
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (str) => str.toUpperCase())
        .trim();
}

type EnsalamentoResultsProps = {
  result: EnsalamentoResult;
  criterion: string;
  selectedIds: string[];
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  onMoveToRoom: (targetRoomName: string) => void;
  onOpenForceDistribute: () => void;
  onBack: () => void;
  setupData: SetupData;
  criteriaData: CriteriaFormValues;
  initialEnsalamento?: SavedEnsalamento;
};


export function EnsalamentoResults({ result, criterion, selectedIds, setSelectedIds, onMoveToRoom, onOpenForceDistribute, onBack, setupData, criteriaData, initialEnsalamento }: EnsalamentoResultsProps) {
  const { salas, naoAlocados, stats } = result;
  const criterionLabel = formatLabel(criterion);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = React.useState(false);
  
  const unassignedParticipants = naoAlocados;

  const handleSelectAllUnassigned = (checked: boolean | 'indeterminate') => {
    if (checked === true) {
      setSelectedIds(unassignedParticipants.map(p => p.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    setSelectedIds(prev =>
      checked ? [...prev, id] : prev.filter(rowId => rowId !== id)
    );
  };


  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
            <div className="flex justify-between items-start">
                <div>
                  <CardTitle>Passo 3: Resultados do Ensalamento</CardTitle>
                  <CardDescription>
                    Abaixo estão os resultados da distribuição dos participantes nas salas.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={onBack}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Voltar
                    </Button>
                    <Button onClick={() => setIsSaveDialogOpen(true)}>
                        <Save className="mr-2 h-4 w-4" />
                        Salvar
                    </Button>
                </div>
            </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Total de Salas" value={stats.totalSalas} icon={Users} />
            <StatCard title="Total de Participantes" value={stats.totalParticipantes} icon={Users2} />
            <StatCard title="Participantes Alocados" value={stats.totalAlocados} icon={UserCheck} />
            <StatCard title="Não Alocados" value={stats.totalNaoAlocados} icon={UserX} />
          </div>
        </CardContent>
      </Card>
      
      <Tabs defaultValue="salas">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="salas">
            <Users className="mr-2 h-4 w-4" />
            Salas Geradas ({salas.length})
          </TabsTrigger>
          <TabsTrigger value="nao-alocados" disabled={naoAlocados.length === 0}>
             <UserX className="mr-2 h-4 w-4" />
            Não Alocados ({naoAlocados.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="salas" className="pt-4">
           {salas.length > 0 ? (
                <Accordion type="single" collapsible className="w-full space-y-2">
                    {salas.map((sala, index) => (
                         <Card key={index}>
                            <AccordionItem value={`item-${index}`} className="border-b-0">
                                <AccordionTrigger className="p-4 hover:no-underline">
                                    <div className="flex flex-col items-start text-left">
                                        <h3 className="font-semibold text-lg">{sala.name}</h3>
                                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                            <span>{sala.participants.length} participante(s)</span>
                                            <Badge variant="secondary">{sala.criterionValue}</Badge>
                                        </div>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent className="p-4 pt-0">
                                    <ParticipantsTable 
                                        participants={sala.participants} 
                                        criterion={criterion} 
                                        criterionLabel={criterionLabel}
                                        selectedIds={[]} // Selection is not implemented within rooms yet
                                        onSelectAll={() => {}}
                                        onSelectRow={() => {}}
                                    />
                                </AccordionContent>
                            </AccordionItem>
                         </Card>
                    ))}
                </Accordion>
           ) : (
                <Card>
                    <CardContent className="text-center h-48 flex items-center justify-center">
                        <p className="text-muted-foreground">Nenhuma sala pôde ser gerada com os critérios definidos.</p>
                    </CardContent>
                </Card>
           )}
        </TabsContent>
        <TabsContent value="nao-alocados" className="pt-4">
           <Card>
                <CardHeader className="flex items-center justify-between">
                    <div>
                        <CardTitle>Participantes não Alocados</CardTitle>
                        <CardDescription>
                            Esta é a lista de participantes que não se encaixaram em nenhuma sala.
                        </CardDescription>
                    </div>
                     <Button onClick={onOpenForceDistribute}>
                        <Users2 className="mr-2 h-4 w-4" />
                        Distribuir Restantes
                    </Button>
                </CardHeader>
                <CardContent>
                    {selectedIds.length > 0 && (
                        <BulkMoveBar salas={salas} onMove={onMoveToRoom} selectedCount={selectedIds.length} />
                    )}
                    <ParticipantsTable 
                        participants={unassignedParticipants} 
                        criterion={criterion} 
                        criterionLabel={criterionLabel}
                        selectedIds={selectedIds}
                        onSelectAll={handleSelectAllUnassigned}
                        onSelectRow={handleSelectRow}
                    />
                </CardContent>
           </Card>
        </TabsContent>
      </Tabs>

      <SaveEnsalamentoDialog
          isOpen={isSaveDialogOpen}
          setIsOpen={setIsSaveDialogOpen}
          result={result}
          formacaoId={setupData.formationId}
          setupData={setupData}
          criteriaData={criteriaData}
          initialEnsalamento={initialEnsalamento}
      />
    </div>
  );
}
