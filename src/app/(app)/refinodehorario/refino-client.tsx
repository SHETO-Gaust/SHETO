'use client';

import { useState, useEffect } from 'react';
import { getDadosRefinoHorario, aplicarMudancasRefino } from './actions';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, CheckCircle2, ArrowRightLeft, Check } from 'lucide-react';
import { analisarMovimento, type ImpactoAnalise, type AulaRefino } from '@/lib/refino-horario';
import { useToast } from '@/hooks/use-toast';
import type { Turno } from '@/lib/types';
import { Badge } from '@/components/ui/badge';

type RefinoClientProps = {
  escolaId: string;
  horariosParaRefino: { id: string; nome: string; status: string; turno: { nome: string } }[];
};

export function RefinoClient({ escolaId, horariosParaRefino }: RefinoClientProps) {
    const { toast } = useToast();
    const [horarioId, setHorarioId] = useState<string>('');
    const [professorId, setProfessorId] = useState<string>('');

    const [loadingData, setLoadingData] = useState(false);
    const [todasAulas, setTodasAulas] = useState<AulaRefino[]>([]);
    const [professores, setProfessores] = useState<{id: string, nome: string}[]>([]);
    const [turnos, setTurnos] = useState<Turno[]>([]);
    const [turnosById, setTurnosById] = useState<Map<string, Turno>>(new Map());

    const [aulaSelecionadaId, setAulaSelecionadaId] = useState<string | null>(null);
    const [slotDestino, setSlotDestino] = useState<{ dia: string, slot: number, turnoId: string } | null>(null);
    const [impacto, setImpacto] = useState<ImpactoAnalise | null>(null);
    const [applying, setApplying] = useState(false);
    const [calculating, setCalculating] = useState(false);
    const [possibilidadeSelecionadaIndex, setPossibilidadeSelecionadaIndex] = useState(0);

    useEffect(() => {
        if (!horarioId) {
            setProfessores([]); setTodasAulas([]); setProfessorId(''); setTurnos([]); return;
        }
        let active = true;
        setLoadingData(true);
        setProfessorId(''); setAulaSelecionadaId(null); setSlotDestino(null); setImpacto(null);

        getDadosRefinoHorario(escolaId, horarioId).then((res) => {
            if (!active) return;
            setLoadingData(false);
            if (res.error || !res.data) {
                toast({ variant: 'destructive', title: 'Erro', description: res.error || 'Erro ao carregar dados' });
                return;
            }
            setTodasAulas(res.data.todasAulas);
            setProfessores(res.data.professores);
            setTurnos(res.data.turnos);
            const map = new Map<string, Turno>();
            res.data.turnos.forEach(t => map.set(t.id, t));
            setTurnosById(map);
        });
        return () => { active = false; };
    }, [horarioId, escolaId]);

    useEffect(() => {
        if (!aulaSelecionadaId || !slotDestino) {
            setImpacto(null);
            setPossibilidadeSelecionadaIndex(0);
            return;
        }
        
        const res = analisarMovimento(todasAulas, turnosById, aulaSelecionadaId, slotDestino.dia, slotDestino.slot, slotDestino.turnoId, false);
        setImpacto(res);
    }, [aulaSelecionadaId, slotDestino, todasAulas, turnosById]);

    const handleCalculate = () => {
        if (!aulaSelecionadaId || !slotDestino) return;
        setCalculating(true);
        setTimeout(() => {
            const res = analisarMovimento(todasAulas, turnosById, aulaSelecionadaId, slotDestino.dia, slotDestino.slot, slotDestino.turnoId, true);
            setImpacto(res);
            setPossibilidadeSelecionadaIndex(0);
            setCalculating(false);
        }, 50);
    };

    const handleApply = async () => {
        if (!impacto || !aulaSelecionadaId || impacto.status === 'bloqueado' || applying) return;
        
        let moves = impacto.mudancasNecessarias;
        if (impacto.status === 'possibilidades' && impacto.possibilidades && impacto.possibilidades.length > 0) {
            moves = impacto.possibilidades[possibilidadeSelecionadaIndex].moves;
        }

        if (moves.length === 0) return;

        setApplying(true);
        const res = await aplicarMudancasRefino(moves);
        setApplying(false);

        if (res.error) {
            toast({ variant: 'destructive', title: 'Erro', description: res.error });
        } else {
            toast({ title: 'Sucesso', description: 'Mudança aplicada com sucesso!' });
            const mapMudancas = new Map(moves.map(m => [m.aulaId, m]));
            setTodasAulas(prev => prev.map(a => {
                const m = mapMudancas.get(a.id);
                if (m) {
                    return { ...a, dia_semana: m.novoDia, aula_index: m.novoSlot };
                }
                return a;
            }));
            
            setAulaSelecionadaId(null);
            setSlotDestino(null);
            setImpacto(null);
        }
    }

    const DIAS = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
    const DIA_LABELS: any = { segunda: 'Segunda', terca: 'Terça', quarta: 'Quarta', quinta: 'Quinta', sexta: 'Sexta', sabado: 'Sábado' };

    const selectedProfAulas = todasAulas.filter(a => a.professor_id === professorId);
    const turnosDoProf = Array.from(new Set(selectedProfAulas.map(a => a.turno_id)));

    return (
        <div className="flex flex-col h-full space-y-4">
            <div className="flex flex-wrap gap-4 p-4 border rounded-lg bg-gray-50/50 items-center">
                <div className="w-[300px]">
                    <Select value={horarioId} onValueChange={setHorarioId}>
                        <SelectTrigger><SelectValue placeholder="Selecione um horário publicado..." /></SelectTrigger>
                        <SelectContent>
                            {horariosParaRefino.map(h => (
                                <SelectItem key={h.id} value={h.id}>{h.nome} ({h.turno?.nome})</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="w-[300px]">
                    <Select value={professorId} onValueChange={setProfessorId} disabled={!horarioId || loadingData}>
                        <SelectTrigger>
                           {loadingData ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <SelectValue placeholder="Selecione o professor..." />}
                        </SelectTrigger>
                        <SelectContent>
                            {professores.map(p => (
                                <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {professorId && !loadingData && (
                <div className="flex flex-1 gap-6 min-h-0 flex-col md:flex-row">
                    {/* Left: Grade */}
                    <div className="flex-1 overflow-y-auto space-y-6 pr-2 custom-scrollbar">
                        {turnosDoProf.map(tid => {
                            const turnoObj = turnosById.get(tid);
                            if (!turnoObj) return null;
                            const aulasTurno = selectedProfAulas.filter(a => a.turno_id === tid);
                            const diasTurno = [...(turnoObj.dias_semana || [])].sort((a,b) => DIAS.indexOf(a) - DIAS.indexOf(b));

                            return (
                                <div key={tid} className="border rounded-xl shadow-sm bg-white overflow-hidden">
                                   <div className="bg-[#1e1e2f] text-white px-4 py-2 font-bold uppercase tracking-wider text-xs flex justify-between items-center">
                                       <span>TURNO: {turnoObj.nome}</span>
                                       <span className="opacity-70 font-normal">{aulasTurno.length} aulas</span>
                                   </div>
                                   <div className="overflow-x-auto">
                                     <table className="w-full text-sm text-center border-collapse">
                                        <thead>
                                            <tr>
                                                <th className="border-b border-r bg-gray-50 p-2 text-gray-500 font-semibold w-[90px]">Horário</th>
                                                {diasTurno.map(d => (
                                                    <th key={d} className="border-b border-r bg-gray-50 p-2 text-gray-500 font-semibold">
                                                        {DIA_LABELS[d]}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {turnoObj.horarios.map((hor, slotIdx) => (
                                                <tr key={slotIdx} className="hover:bg-slate-50 transition-colors">
                                                    <td className="border-b border-r p-2 bg-gray-50/50">
                                                        <div className="font-bold text-[#1e1e2f]">{slotIdx + 1}ª Aula</div>
                                                        <div className="text-[10px] text-gray-500">{hor.inicio} - {hor.fim}</div>
                                                    </td>
                                                    {diasTurno.map(dia => {
                                                        const slotAulas = aulasTurno.filter(a => a.dia_semana === dia && a.aula_index === slotIdx);
                                                        
                                                        const isSelected = aulaSelecionadaId && slotAulas.some(a => a.id === aulaSelecionadaId);
                                                        const isDestino = slotDestino?.dia === dia && slotDestino?.slot === slotIdx && slotDestino?.turnoId === tid;

                                                        return (
                                                            <td 
                                                                key={`${dia}-${slotIdx}`} 
                                                                className={`border-b border-r p-1 cursor-pointer transition-all min-w-[120px] h-[60px]
                                                                    ${isSelected ? 'ring-2 ring-indigo-500 ring-inset bg-indigo-50/50' : ''}
                                                                    ${isDestino ? 'ring-2 ring-amber-500 ring-inset border-dashed bg-amber-50/30' : ''}
                                                                    ${!isSelected && !isDestino ? 'hover:bg-indigo-50/30' : ''}
                                                                `}
                                                                onClick={() => {
                                                                    if (slotAulas.length > 0) {
                                                                        // Pick 1st class to move
                                                                        setAulaSelecionadaId(slotAulas[0].id);
                                                                        setSlotDestino(null);
                                                                    } else if (aulaSelecionadaId) {
                                                                        const origAula = todasAulas.find(a => a.id === aulaSelecionadaId);
                                                                        if (origAula && origAula.turno_id === tid) {
                                                                            setSlotDestino({ dia, slot: slotIdx, turnoId: tid });
                                                                        } else {
                                                                            toast({ variant: 'destructive', title: 'Ação não permitida', description: 'Você só pode mover a aula para outro horário dentro do mesmo lado físico (turno).' });
                                                                        }
                                                                    }
                                                                }}
                                                            >
                                                                {slotAulas.length === 0 && aulaSelecionadaId && !isDestino && (
                                                                     <div className="w-full h-full flex items-center justify-center opacity-0 hover:opacity-100">
                                                                       <div className="text-[10px] bg-slate-800 text-white px-2 py-1 flex items-center gap-1 rounded-full"><ArrowRightLeft className="w-3 h-3"/> Mover</div>
                                                                     </div>
                                                                )}

                                                                {slotAulas.map(a => (
                                                                    <div key={a.id} className="bg-[#1e1e2f]/5 hover:bg-[#1e1e2f]/10 border border-[#1e1e2f]/10 rounded flex flex-col items-center justify-center p-1 w-full h-full relative">
                                                                        <span className="text-[11px] font-bold text-[#1e1e2f] leading-tight">{a.componente_sigla || a.componente_nome}</span>
                                                                        <span className="text-[9px] text-gray-600 line-clamp-1">{a.turma_nome} • {a.tipo === 'nao_presencial' ? 'NP' : 'P'}</span>
                                                                    </div>
                                                                ))}
                                                            </td>
                                                        )
                                                    })}
                                                </tr>
                                            ))}
                                        </tbody>
                                     </table>
                                   </div>
                                </div>
                            )
                        })}

                        {!turnosDoProf.length && (
                             <div className="flex items-center justify-center h-40 text-gray-500 border-2 border-dashed rounded-xl">
                                Nenhuma aula vinculada a este professor neste horário.
                            </div>
                        )}
                    </div>

                    {/* Right: Painel Impacto */}
                    <div className="w-full md:w-[350px] shrink-0 border rounded-xl shadow-sm bg-white flex flex-col overflow-hidden max-h-[800px]">
                        <div className="bg-[#f8fafc] text-slate-800 px-4 py-3 font-semibold text-sm border-b uppercase tracking-wide">
                            Painel de Impacto
                        </div>
                        <div className="p-4 flex-1 overflow-y-auto">
                            {!aulaSelecionadaId ? (
                                <div className="text-sm text-slate-500 text-center mt-10">
                                    <div className="bg-slate-50 w-12 h-12 mx-auto rounded-full flex items-center justify-center mb-3">
                                        <ArrowRightLeft className="w-5 h-5 text-slate-400" />
                                    </div>
                                    <p>Clique sobre uma aula na grade para selecioná-la. Em seguida, clique sobre um slot vazio para testar o efeito de movê-la.</p>
                                </div>
                            ) : !slotDestino ? (
                                <div className="text-sm text-amber-700 bg-amber-50 p-4 rounded-lg border border-amber-100 flex flex-col gap-2">
                                    <span className="font-bold flex items-center gap-2"><CheckCircle2 className="w-4 h-4"/> Aula selecionada</span>
                                    <span>Agora clique em um slot vazio na grade para testar a realocação.</span>
                                </div>
                            ) : impacto ? (
                                <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                                   <div className={`p-4 rounded-xl border-l-4 ${
                                        impacto.status === 'livre' ? 'bg-emerald-50 border-emerald-500 text-emerald-800' :
                                        impacto.status === 'sugestao' ? 'bg-blue-50 border-blue-500 text-blue-800' :
                                        impacto.status === 'atencao' ? 'bg-amber-50 border-amber-500 text-amber-800' :
                                        impacto.status === 'possibilidades' ? 'bg-indigo-50 border-indigo-500 text-indigo-800' :
                                        'bg-red-50 border-red-500 text-red-800'
                                   }`}>
                                      <div className="flex gap-2 font-bold items-center mb-1">
                                         {impacto.status === 'livre' && <CheckCircle2 className="w-5 h-5" />}
                                         {impacto.status === 'sugestao' && <AlertCircle className="w-5 h-5" />}
                                         {impacto.status === 'atencao' && <AlertCircle className="w-5 h-5" />}
                                         {impacto.status === 'possibilidades' && <CheckCircle2 className="w-5 h-5" />}
                                         {impacto.status === 'bloqueado' && <AlertCircle className="w-5 h-5" />}
                                         <span className="uppercase text-[11px] tracking-wide">
                                             {impacto.status === 'sugestao' ? 'Alternativa Automática' : impacto.status}
                                         </span>
                                      </div>
                                      <p className="text-sm opacity-90">{impacto.mensagem}</p>

                                      {impacto.status === 'atencao' && (
                                          <Button 
                                              onClick={handleCalculate} 
                                              disabled={calculating}
                                              className="mt-4 w-full bg-amber-600 hover:bg-amber-700 text-white"
                                          >
                                              {calculating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowRightLeft className="w-4 h-4 mr-2" />}
                                              Calcular Possibilidades
                                          </Button>
                                      )}
                                   </div>

                                   {impacto.status === 'possibilidades' && impacto.possibilidades && (
                                       <div className="space-y-3">
                                           <h3 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Rotas Validadas</h3>
                                           {impacto.possibilidades.map((p, idx) => (
                                               <div 
                                                  key={p.id} 
                                                  onClick={() => setPossibilidadeSelecionadaIndex(idx)}
                                                  className={`border rounded-lg p-3 text-sm cursor-pointer transition-all ${possibilidadeSelecionadaIndex === idx ? 'bg-indigo-50 border-indigo-500 ring-1 ring-indigo-500 shadow-sm' : 'bg-white border-slate-200 hover:bg-slate-50'}`}
                                               >
                                                   <div className="flex justify-between items-center mb-2">
                                                       <strong className="text-indigo-900 flex items-center gap-2">
                                                           {possibilidadeSelecionadaIndex === idx ? <CheckCircle2 className="w-4 h-4" /> : <div className="w-4 h-4 rounded-full border border-slate-300" />}
                                                           Opção {idx + 1}
                                                       </strong>
                                                       <Badge variant="outline" className="text-[10px]">{p.qtdMovimentos} moves</Badge>
                                                   </div>
                                                   <div className="flex flex-col gap-1 mt-3">
                                                       {p.passos.map((passo, i) => (
                                                           <div key={i} className="text-[11px] text-slate-700 flex gap-2">
                                                               <span className="opacity-50">{i + 1}.</span>
                                                               <span>{passo}</span>
                                                           </div>
                                                       ))}
                                                   </div>
                                                   <div className="mt-3 text-[10px] text-slate-500 flex gap-3 border-t pt-2">
                                                        <span>Turmas: {p.impactoTurmas}</span>
                                                        <span>Professores: {p.impactoProfessores}</span>
                                                   </div>
                                               </div>
                                           ))}
                                       </div>
                                   )}
                                </div>
                            ) : (
                                <div className="flex justify-center mt-10"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
                            )}
                        </div>
                        
                        <div className="p-4 border-t bg-slate-50 shadow-[0_-4px_10px_rgba(0,0,0,0.02)]">
                             <Button 
                                className="w-full text-white bg-[#1e1e2f] hover:bg-[#2b2b40]" 
                                size="lg"
                                 disabled={!impacto || impacto.status === 'bloqueado' || (impacto.status === 'atencao' && impacto.mudancasNecessarias.length === 0) || applying || calculating}
                                onClick={handleApply}
                            >
                                {applying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                                Aplicar Mudança
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
