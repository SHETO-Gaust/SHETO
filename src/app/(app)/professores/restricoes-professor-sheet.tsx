'use client';

import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CalendarX, Ban, PenSquare, Star, CalendarDays, Users2, Tag, X } from 'lucide-react';
import { updateProfessorRestricoes } from './actions';
import type { ProfessorComDados, Turno, LivreDocenciaItem, LivreDocenciaPeriodo } from '@/lib/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

type CustomType = { id: string; label: string };

// Index-based color palette for custom types
const CUSTOM_COLORS = [
  { activeBg: 'bg-orange-100 dark:bg-orange-900/40', activeText: 'text-orange-700 dark:text-orange-300', activeBorder: 'border-orange-500', idleBorder: 'hover:border-orange-300', cellBg: 'bg-orange-50 dark:bg-orange-950/40', cellText: 'text-orange-600 dark:text-orange-400' },
  { activeBg: 'bg-rose-100 dark:bg-rose-900/40',     activeText: 'text-rose-700 dark:text-rose-300',     activeBorder: 'border-rose-500',   idleBorder: 'hover:border-rose-300',   cellBg: 'bg-rose-50 dark:bg-rose-950/40',   cellText: 'text-rose-600 dark:text-rose-400' },
  { activeBg: 'bg-teal-100 dark:bg-teal-900/40',     activeText: 'text-teal-700 dark:text-teal-300',     activeBorder: 'border-teal-500',   idleBorder: 'hover:border-teal-300',   cellBg: 'bg-teal-50 dark:bg-teal-950/40',   cellText: 'text-teal-600 dark:text-teal-400' },
  { activeBg: 'bg-indigo-100 dark:bg-indigo-900/40', activeText: 'text-indigo-700 dark:text-indigo-300', activeBorder: 'border-indigo-500', idleBorder: 'hover:border-indigo-300', cellBg: 'bg-indigo-50 dark:bg-indigo-950/40', cellText: 'text-indigo-600 dark:text-indigo-400' },
];

type Props = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  professor: ProfessorComDados;
  onRestricoesUpdated: () => void;
};

const DIAS_SEMANA_MAP = [
  { id: 'segunda', label: 'Seg' }, { id: 'terca', label: 'Ter' },
  { id: 'quarta', label: 'Qua' }, { id: 'quinta', label: 'Qui' },
  { id: 'sexta', label: 'Sex' }, { id: 'sabado', label: 'Sáb' },
];

function getPeriodoDaAula(turno: Turno, aulaIdx: number): LivreDocenciaPeriodo {
  const nome = turno.nome.toLowerCase();
  if (nome.includes('matutino')) return 'matutino';
  if (nome.includes('vespertino')) return 'vespertino';
  if (nome.includes('noturno')) return 'noturno';
  const h = turno.horarios?.[aulaIdx];
  if (h?.inicio) {
    const hora = parseInt(h.inicio.split(':')[0]);
    if (hora < 13) return 'matutino';
    if (hora < 18) return 'vespertino';
    return 'noturno';
  }
  return aulaIdx < 5 ? 'matutino' : 'vespertino';
}

function countLivreDocenciaCells(restricoes: any): number {
  let count = 0;
  for (const t of Object.values(restricoes || {})) {
    for (const d of Object.values(t as any || {})) {
      for (const s of Object.values(d as any || {})) {
        if (s === 'livre_docencia') count++;
      }
    }
  }
  return count;
}

export function RestricoesProfessorSheet({ isOpen, setIsOpen, professor, onRestricoesUpdated }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [restricoes, setRestricoes] = useState<any>({});
  const [livreDocencia, setLivreDocencia] = useState<LivreDocenciaItem[]>([]);
  const [semPreferencia, setSemPreferencia] = useState(false);
  const [diasPreferidos, setDiasPreferidos] = useState<string[]>([]);
  const [livreDocenciaPersonalizada, setLivreDocenciaPersonalizada] = useState(false);
  const [customTypes, setCustomTypes] = useState<CustomType[]>([{ id: 'personalizado', label: 'Personalizado' }]);
  const [editingCustomIdx, setEditingCustomIdx] = useState<number | null>(null);
  const [selectedTool, setSelectedTool] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const r = professor.restricoes || {};
      const { _custom_types, _personalizado_label, _livre_docencia_personalizada, ...cleanR } = r as any;
      setRestricoes(cleanR);
      setLivreDocencia(professor.livre_docencia || []);
      setSemPreferencia(!!professor.sem_preferencia_livre_docencia);
      setDiasPreferidos(professor.dias_preferidos || []);
      setLivreDocenciaPersonalizada(!!_livre_docencia_personalizada);
      setSelectedTool(null);
      setEditingCustomIdx(null);
      // Backward compat: _custom_types takes priority over old _personalizado_label
      if (_custom_types && Array.isArray(_custom_types) && _custom_types.length > 0) {
        setCustomTypes(_custom_types);
      } else {
        const label = (typeof _personalizado_label === 'string' && _personalizado_label) ? _personalizado_label : 'Personalizado';
        setCustomTypes([{ id: 'personalizado', label }]);
      }
    }
  }, [isOpen, professor]);

  const handleCellClick = (turno: Turno, diaId: string, aulaIndex: number) => {
    if (!selectedTool) {
      toast({ title: 'Selecione um tipo acima', description: 'Escolha o tipo de restrição na barra antes de clicar nas células.', variant: 'destructive' });
      return;
    }

    const currentPeriodo = getPeriodoDaAula(turno, aulaIndex);
    const isStar = !livreDocenciaPersonalizada && livreDocencia.some(ld => ld.dia === diaId && ld.periodo === currentPeriodo);
    const currentStatus = restricoes[turno.id]?.[diaId]?.[aulaIndex];

    if (selectedTool === 'limpar') {
      if (isStar) setLivreDocencia(prev => prev.filter(ld => !(ld.dia === diaId && ld.periodo === currentPeriodo)));
      setRestricoes((prev: any) => {
        const next = JSON.parse(JSON.stringify(prev));
        if (next[turno.id]?.[diaId]) delete next[turno.id][diaId][aulaIndex];
        return next;
      });
      return;
    }

    if (selectedTool === 'livre_docencia') {
      if (livreDocenciaPersonalizada) {
        if (currentStatus === 'livre_docencia') {
          setRestricoes((prev: any) => {
            const next = JSON.parse(JSON.stringify(prev));
            if (next[turno.id]?.[diaId]) delete next[turno.id][diaId][aulaIndex];
            return next;
          });
        } else {
          setRestricoes((prev: any) => {
            const next = JSON.parse(JSON.stringify(prev));
            if (!next[turno.id]) next[turno.id] = {};
            if (!next[turno.id][diaId]) next[turno.id][diaId] = {};
            next[turno.id][diaId][aulaIndex] = 'livre_docencia';
            return next;
          });
        }
      } else {
        if (isStar) {
          setLivreDocencia(prev => prev.filter(ld => !(ld.dia === diaId && ld.periodo === currentPeriodo)));
        } else {
          if (livreDocencia.length >= 2) {
            toast({ title: 'Limite atingido', description: 'O professor já possui os 2 períodos de Livre Docência.', variant: 'destructive' });
            return;
          }
          if (!livreDocencia.some(ld => ld.dia === diaId && ld.periodo === currentPeriodo)) {
            setLivreDocencia(prev => [...prev, { dia: diaId, periodo: currentPeriodo }]);
            setRestricoes((prev: any) => {
              const next = JSON.parse(JSON.stringify(prev));
              if (next[turno.id]?.[diaId]) delete next[turno.id][diaId][aulaIndex];
              return next;
            });
          }
        }
      }
      return;
    }

    // All other tools: fixed (indisponivel, planejamento, reuniao_fluxo) + all custom types
    const isCurrentTool = currentStatus === selectedTool;
    if (isCurrentTool && !isStar) {
      setRestricoes((prev: any) => {
        const next = JSON.parse(JSON.stringify(prev));
        if (next[turno.id]?.[diaId]) delete next[turno.id][diaId][aulaIndex];
        return next;
      });
    } else {
      if (isStar) setLivreDocencia(prev => prev.filter(ld => !(ld.dia === diaId && ld.periodo === currentPeriodo)));
      setRestricoes((prev: any) => {
        const next = JSON.parse(JSON.stringify(prev));
        if (!next[turno.id]) next[turno.id] = {};
        if (!next[turno.id][diaId]) next[turno.id][diaId] = {};
        next[turno.id][diaId][aulaIndex] = selectedTool;
        return next;
      });
    }
  };

  const handleToggleSemPreferencia = (checked: boolean) => {
    setSemPreferencia(checked);
    if (checked) setLivreDocencia([]);
  };

  const handleToggleLivreDocenciaPersonalizada = (checked: boolean) => {
    setLivreDocenciaPersonalizada(checked);
    if (checked) {
      setLivreDocencia([]);
    } else {
      setRestricoes((prev: any) => {
        const next = JSON.parse(JSON.stringify(prev));
        for (const turnoId in next) {
          for (const dia in next[turnoId]) {
            for (const idx in next[turnoId][dia]) {
              if (next[turnoId][dia][idx] === 'livre_docencia') delete next[turnoId][dia][idx];
            }
          }
        }
        return next;
      });
    }
  };

  const handleAddCustomType = () => {
    const newId = `personalizado_${Date.now()}`;
    const newIdx = customTypes.length;
    setCustomTypes(prev => [...prev, { id: newId, label: 'Personalizado' }]);
    setEditingCustomIdx(newIdx);
    setSelectedTool(newId);
  };

  const handleRemoveCustomType = (idx: number) => {
    const typeId = customTypes[idx].id;
    setRestricoes((prev: any) => {
      const next = JSON.parse(JSON.stringify(prev));
      for (const turnoId in next) {
        for (const dia in next[turnoId]) {
          for (const aulaIdx in next[turnoId][dia]) {
            if (next[turnoId][dia][aulaIdx] === typeId) delete next[turnoId][dia][aulaIdx];
          }
        }
      }
      return next;
    });
    setCustomTypes(prev => prev.filter((_, i) => i !== idx));
    if (selectedTool === typeId) setSelectedTool(null);
    if (editingCustomIdx === idx) setEditingCustomIdx(null);
  };

  const handleSave = async () => {
    setLoading(true);
    const restricoesParaSalvar = {
      ...restricoes,
      _custom_types: customTypes,
      _livre_docencia_personalizada: livreDocenciaPersonalizada,
    };
    const result = await updateProfessorRestricoes(professor.id, restricoesParaSalvar, livreDocencia, semPreferencia, diasPreferidos);
    setLoading(false);
    if (result.error) {
      toast({ title: 'Erro', description: result.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Restrições Atualizadas', description: `As restrições para "${professor.nome_completo}" foram salvas.` });
    onRestricoesUpdated();
    setIsOpen(false);
  };

  const professorTurnos = professor.turnos.filter(t => t.id);
  const ldPersonalizadaCount = livreDocenciaPersonalizada ? countLivreDocenciaCells(restricoes) : 0;
  const customTypeIds = new Set(customTypes.map(ct => ct.id));

  const getActiveToolLabel = () => {
    if (!selectedTool || selectedTool === 'limpar') return null;
    const fixed: Record<string, string> = { indisponivel: 'Indisponível', planejamento: 'Planejamento', livre_docencia: 'Livre Docência', reuniao_fluxo: 'Reunião de Fluxo' };
    return fixed[selectedTool] ?? customTypes.find(ct => ct.id === selectedTool)?.label ?? selectedTool;
  };

  const fixedTools = [
    { id: 'indisponivel',  label: 'Indisponível',      icon: <Ban className="h-4 w-4" />,      activeBg: 'bg-red-100 dark:bg-red-900/40',       activeText: 'text-red-700 dark:text-red-300',       activeBorder: 'border-red-500',    idleBorder: 'hover:border-red-300' },
    { id: 'planejamento',  label: 'Planejamento',       icon: <PenSquare className="h-4 w-4" />, activeBg: 'bg-blue-100 dark:bg-blue-900/40',     activeText: 'text-blue-700 dark:text-blue-300',     activeBorder: 'border-blue-500',   idleBorder: 'hover:border-blue-300' },
    { id: 'livre_docencia',label: 'Livre Docência',     icon: <Star className="h-4 w-4" />,      activeBg: 'bg-amber-100 dark:bg-amber-900/40',   activeText: 'text-amber-700 dark:text-amber-300',   activeBorder: 'border-amber-500',  idleBorder: 'hover:border-amber-300' },
    { id: 'reuniao_fluxo', label: 'Reunião de Fluxo',   icon: <Users2 className="h-4 w-4" />,    activeBg: 'bg-purple-100 dark:bg-purple-900/40', activeText: 'text-purple-700 dark:text-purple-300', activeBorder: 'border-purple-500', idleBorder: 'hover:border-purple-300' },
  ];

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent onPointerDownOutside={(e) => e.preventDefault()} className="sm:max-w-4xl w-full flex flex-col h-full overflow-hidden">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-xl">
            <CalendarX className="h-6 w-6 text-primary" />
            Restrições de Horário: {professor.nome_horario}
          </SheetTitle>
          <SheetDescription>
            Selecione um tipo de restrição abaixo e clique nas células para aplicar. Clique novamente para remover.
          </SheetDescription>

          {/* Barra de ferramentas */}
          <div className="pt-2 space-y-2">
            <div className="flex flex-wrap gap-2">
              {/* Fixed tools */}
              {fixedTools.map(tool => {
                const isActive = selectedTool === tool.id;
                return (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => setSelectedTool(prev => prev === tool.id ? null : tool.id)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 text-xs font-bold transition-all select-none',
                      isActive
                        ? `${tool.activeBg} ${tool.activeText} ${tool.activeBorder} shadow-sm scale-[1.03]`
                        : `bg-background border-border text-muted-foreground ${tool.idleBorder}`
                    )}
                  >
                    {tool.icon}
                    {tool.label}
                  </button>
                );
              })}

              {/* Custom types */}
              {customTypes.map((ct, idx) => {
                const colors = CUSTOM_COLORS[idx % CUSTOM_COLORS.length];
                const isActive = selectedTool === ct.id;
                const isEditing = editingCustomIdx === idx;
                const isLast = idx === customTypes.length - 1;

                return (
                  <div key={ct.id} className="flex items-center gap-0">
                    {/* Main select button */}
                    <button
                      type="button"
                      onClick={() => setSelectedTool(prev => prev === ct.id ? null : ct.id)}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-l-lg border-2 text-xs font-bold transition-all select-none',
                        isActive
                          ? `${colors.activeBg} ${colors.activeText} ${colors.activeBorder} shadow-sm scale-[1.03]`
                          : `bg-background border-border text-muted-foreground ${colors.idleBorder}`
                      )}
                    >
                      <Tag className="h-4 w-4" />
                      {isEditing ? (
                        <input
                          autoFocus
                          value={ct.label}
                          onClick={e => e.stopPropagation()}
                          onChange={e => setCustomTypes(prev => prev.map((t, i) => i === idx ? { ...t, label: e.target.value } : t))}
                          onBlur={() => setEditingCustomIdx(null)}
                          onKeyDown={e => {
                            e.stopPropagation();
                            if (e.key === 'Enter' || e.key === 'Escape') setEditingCustomIdx(null);
                          }}
                          className="bg-transparent outline-none w-24 font-bold border-b border-current"
                        />
                      ) : (
                        <span onDoubleClick={e => { e.stopPropagation(); setEditingCustomIdx(idx); }} title="Duplo clique para editar">
                          {ct.label}
                        </span>
                      )}
                    </button>

                    {/* Pencil icon */}
                    <span
                      onClick={() => setEditingCustomIdx(idx)}
                      title="Editar nome"
                      className={cn(
                        'px-1.5 py-1.5 border-2 border-l-0 text-[10px] text-muted-foreground cursor-pointer transition-colors',
                        isActive ? `${colors.activeBorder} ${colors.activeBg}` : `border-border ${colors.idleBorder}`,
                      )}
                    >
                      ✎
                    </span>

                    {/* + add button: always shown, next to the pencil */}
                    <span
                      onClick={handleAddCustomType}
                      title="Adicionar novo tipo personalizado"
                      className={cn(
                        'px-1.5 py-1.5 border-2 border-l-0 text-xs font-black cursor-pointer transition-colors',
                        // rounded-r only if no × button follows
                        customTypes.length <= 1 ? 'rounded-r-lg' : '',
                        isActive ? `${colors.activeBorder} ${colors.activeBg} text-current` : 'border-border text-muted-foreground hover:border-green-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-950/30',
                      )}
                    >
                      +
                    </span>

                    {/* × remove button: only when there are 2+ custom types */}
                    {customTypes.length > 1 && (
                      <span
                        onClick={() => handleRemoveCustomType(idx)}
                        title="Remover este tipo"
                        className={cn(
                          'px-1.5 py-1.5 rounded-r-lg border-2 border-l-0 text-[10px] cursor-pointer transition-colors hover:border-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30',
                          isActive ? `${colors.activeBorder} ${colors.activeBg} text-current` : 'border-border text-muted-foreground',
                        )}
                      >
                        ×
                      </span>
                    )}
                  </div>
                );
              })}

              {/* Limpar tool */}
              {(() => {
                const isActive = selectedTool === 'limpar';
                return (
                  <button
                    type="button"
                    onClick={() => setSelectedTool(prev => prev === 'limpar' ? null : 'limpar')}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 text-xs font-bold transition-all select-none',
                      isActive
                        ? 'bg-slate-100 text-slate-700 border-slate-400 shadow-sm scale-[1.03] dark:bg-slate-700 dark:text-slate-200 dark:border-slate-500'
                        : 'bg-background border-border text-muted-foreground hover:border-slate-300'
                    )}
                  >
                    <X className="h-4 w-4" />
                    Limpar
                  </button>
                );
              })()}
            </div>

            {/* Status indicator */}
            <p className="text-[11px] text-muted-foreground h-4">
              {selectedTool ? (
                <span className="font-semibold">
                  {selectedTool === 'limpar'
                    ? '🗑 Clique nas células para limpar.'
                    : `Aplicando: ${getActiveToolLabel()} — clique para marcar, clique novamente para remover.`
                  }
                </span>
              ) : 'Nenhuma ferramenta selecionada — escolha uma acima.'}
            </p>
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-4 py-4 overflow-y-auto min-h-0">

          {/* Dias Preferidos */}
          <div className="rounded-xl border border-violet-200/60 bg-violet-50/40 dark:border-violet-800/60 dark:bg-violet-950/20 p-4">
            <div className="flex items-center gap-2 mb-3">
              <CalendarDays className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              <p className="text-sm font-bold text-violet-900 dark:text-violet-300">Dias Preferidos para Concentração de Aulas</p>
            </div>
            <p className="text-[11px] text-violet-700/70 dark:text-violet-400/80 mb-3">O motor priorizará estes dias ao alocar aulas. Soft constraint — relaxada se necessário.</p>
            <div className="flex flex-wrap gap-2">
              {DIAS_SEMANA_MAP.map(dia => {
                const isSelected = diasPreferidos.includes(dia.id);
                return (
                  <button
                    key={dia.id}
                    type="button"
                    onClick={() => setDiasPreferidos(prev =>
                      isSelected ? prev.filter(d => d !== dia.id) : [...prev, dia.id]
                    )}
                    className={cn(
                      'px-4 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest border-2 transition-all select-none',
                      isSelected
                        ? 'bg-violet-600 border-violet-600 text-white shadow-md scale-[1.04]'
                        : 'bg-background border-border text-muted-foreground hover:border-violet-300'
                    )}
                  >
                    {dia.label}
                  </button>
                );
              })}
            </div>
            {diasPreferidos.length === 0 && (
              <p className="text-[10px] text-muted-foreground mt-2 italic">Nenhum dia selecionado — o motor usará qualquer dia disponível.</p>
            )}
          </div>

          {/* Grade de horários */}
          {professorTurnos.length > 0 ? (
            <Tabs defaultValue={professorTurnos[0].id} className="w-full">
              <TabsList className="bg-muted w-full justify-start overflow-x-auto h-auto p-1">
                {professorTurnos.map(turno => (
                  <TabsTrigger key={turno.id} value={turno.id} className="px-6 py-2.5 uppercase font-bold text-xs">{turno.nome}</TabsTrigger>
                ))}
              </TabsList>
              {professorTurnos.map(turno => (
                <TabsContent key={turno.id} value={turno.id} className="mt-4 animate-in fade-in slide-in-from-left-2 duration-300">
                  <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-center border-collapse">
                        <thead>
                          <tr className="bg-muted/50 border-b">
                            <th className="p-3 font-bold border-r w-24">Aula</th>
                            {DIAS_SEMANA_MAP.map(dia => (
                              <th key={dia.id} className="p-3 font-bold min-w-[80px]">{dia.label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from({ length: turno.aulas_por_dia }).map((_, aulaIndex) => (
                            <tr key={aulaIndex} className="border-b last:border-0 h-16 hover:bg-muted/5 transition-colors">
                              <td className="p-2 font-bold bg-muted/20 border-r">
                                <div className="text-primary text-base">{aulaIndex + 1}ª</div>
                                <div className="text-[10px] text-muted-foreground font-medium">
                                  {turno.horarios?.[aulaIndex]?.inicio || '--:--'}
                                </div>
                              </td>
                              {DIAS_SEMANA_MAP.map(dia => {
                                const currentPeriodo = getPeriodoDaAula(turno, aulaIndex);
                                const isStar = !livreDocenciaPersonalizada && livreDocencia.some(ld => ld.dia === dia.id && ld.periodo === currentPeriodo);
                                const status = restricoes[turno.id]?.[dia.id]?.[aulaIndex];
                                const isAmber = isStar || status === 'livre_docencia';
                                const isCustom = customTypeIds.has(status);
                                const customIdx = isCustom ? customTypes.findIndex(ct => ct.id === status) : -1;
                                const customColors = customIdx >= 0 ? CUSTOM_COLORS[customIdx % CUSTOM_COLORS.length] : null;
                                const customLabel = customIdx >= 0 ? customTypes[customIdx].label : '';

                                return (
                                  <td key={dia.id} className="p-0 border-r last:border-r-0">
                                    <div
                                      onClick={() => handleCellClick(turno, dia.id, aulaIndex)}
                                      className={cn(
                                        "h-16 w-full flex flex-col items-center justify-center transition-all",
                                        selectedTool ? 'cursor-cell' : 'cursor-default',
                                        isAmber                        ? 'bg-amber-50 text-amber-600 shadow-inner dark:bg-amber-950/40 dark:text-amber-400' :
                                        status === 'indisponivel'       ? 'bg-red-50 text-red-600 shadow-inner dark:bg-red-950/40 dark:text-red-400' :
                                        status === 'planejamento'       ? 'bg-blue-50 text-blue-600 shadow-inner dark:bg-blue-950/40 dark:text-blue-400' :
                                        status === 'reuniao_fluxo'      ? 'bg-purple-50 text-purple-600 shadow-inner dark:bg-purple-950/40 dark:text-purple-400' :
                                        isCustom && customColors        ? `${customColors.cellBg} ${customColors.cellText} shadow-inner` :
                                        selectedTool                    ? 'hover:bg-accent/50' : 'opacity-60'
                                      )}
                                    >
                                      {isAmber ? (
                                        <>
                                          <Star className="h-6 w-6 fill-amber-500 animate-in zoom-in-50 duration-300" />
                                          <span className="text-[8px] font-black uppercase mt-0.5">Folga</span>
                                        </>
                                      ) : status === 'indisponivel' ? (
                                        <>
                                          <Ban className="h-6 w-6" />
                                          <span className="text-[8px] font-black uppercase mt-0.5">Ban</span>
                                        </>
                                      ) : status === 'planejamento' ? (
                                        <>
                                          <PenSquare className="h-6 w-6" />
                                          <span className="text-[8px] font-black uppercase mt-0.5">Plan.</span>
                                        </>
                                      ) : status === 'reuniao_fluxo' ? (
                                        <>
                                          <Users2 className="h-6 w-6 animate-in zoom-in-50 duration-300" />
                                          <span className="text-[8px] font-black uppercase mt-0.5">Fluxo</span>
                                        </>
                                      ) : isCustom ? (
                                        <>
                                          <Tag className="h-6 w-6 animate-in zoom-in-50 duration-300" />
                                          <span className="text-[8px] font-black uppercase mt-0.5 max-w-[56px] truncate px-1">
                                            {customLabel.length > 8 ? customLabel.slice(0, 7) + '…' : customLabel}
                                          </span>
                                        </>
                                      ) : (
                                        <div className="h-1.5 w-1.5 rounded-full bg-slate-200 dark:bg-slate-600" />
                                      )}
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          ) : (
            <div className="text-center text-muted-foreground p-16 border-2 border-dashed rounded-3xl bg-muted/5 flex flex-col items-center gap-4">
              <CalendarX className="h-12 w-12 opacity-20" />
              <p className="font-medium">Este professor não está associado a nenhum turno ativo nesta escola.</p>
            </div>
          )}
        </div>

        {livreDocenciaPersonalizada && (
          <div className="shrink-0 border-t bg-amber-50/60 dark:bg-amber-950/30 px-6 py-2 flex items-center gap-2">
            <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500 shrink-0" />
            <p className="text-[11px] text-amber-800 dark:text-amber-300 font-medium">
              Livre Doc. Personalizada ativa — cada célula é marcada individualmente.
              {ldPersonalizadaCount > 0 && <span className="ml-1 font-black">{ldPersonalizadaCount} {ldPersonalizadaCount === 1 ? 'horário marcado' : 'horários marcados'}.</span>}
            </p>
          </div>
        )}

        <SheetFooter className="mt-auto border-t pt-4 pb-4 bg-background flex flex-col sm:flex-row items-center justify-between gap-4 px-6">
          <div className="flex items-center gap-4 p-2.5 px-4 rounded-full border bg-muted/50 shadow-sm w-full sm:w-auto flex-wrap">
            <div className="flex items-center gap-2.5">
              <Switch
                id="sem-preferencia"
                checked={semPreferencia}
                onCheckedChange={handleToggleSemPreferencia}
                className="data-[state=checked]:bg-primary"
              />
              <Label htmlFor="sem-preferencia" className="text-xs font-black uppercase text-primary cursor-pointer tracking-tighter whitespace-nowrap">Sem Preferência de Folga</Label>
            </div>

            <div className="h-4 w-px bg-border hidden sm:block" />

            <div className={cn("flex items-center gap-2 transition-opacity", semPreferencia && "opacity-30 pointer-events-none")}>
              <Checkbox
                id="livre-docencia-personalizada"
                checked={livreDocenciaPersonalizada}
                onCheckedChange={(v) => handleToggleLivreDocenciaPersonalizada(!!v)}
                className="h-3.5 w-3.5 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
              />
              <Label htmlFor="livre-docencia-personalizada" className="text-[11px] font-bold cursor-pointer whitespace-nowrap text-amber-700 dark:text-amber-400">
                Livre Doc. Personalizada
              </Label>
            </div>

            <div className="h-4 w-px bg-border hidden sm:block" />

            <div className={cn("flex items-center gap-1.5 text-[10px] uppercase font-black transition-opacity", semPreferencia ? "opacity-20 pointer-events-none" : "opacity-100")}>
              <Star className={cn(
                "h-3.5 w-3.5",
                (livreDocenciaPersonalizada ? ldPersonalizadaCount > 0 : livreDocencia.length >= 2)
                  ? "text-green-500 fill-green-500"
                  : "text-amber-500 fill-amber-500"
              )} />
              {livreDocenciaPersonalizada
                ? <span>Livre Docência: {ldPersonalizadaCount}</span>
                : <span>Livre Docência: {livreDocencia.length}/2</span>
              }
            </div>
          </div>

          <div className="flex gap-2 w-full sm:w-auto">
            <Button type="button" variant="ghost" onClick={() => setIsOpen(false)} className="flex-1 sm:flex-none">Cancelar</Button>
            <Button
              onClick={handleSave}
              disabled={loading || (!semPreferencia && !livreDocenciaPersonalizada && livreDocencia.length < 2 && !professor.id.startsWith('new'))}
              className="min-w-[140px] font-black shadow-lg flex-1 sm:flex-none"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar Alterações
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
