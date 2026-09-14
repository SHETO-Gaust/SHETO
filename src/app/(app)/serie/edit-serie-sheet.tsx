
'use client';

import { useEffect, useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Ban, Eraser, MonitorSmartphone } from 'lucide-react';
import { upsertSerie } from './actions';
import type { SerieComDados, NivelEnsino, Turno } from '@/lib/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from '@/lib/utils';

// CORREÇÃO 1: Schema flexível para escola_id
const formSchema = z.object({
  id: z.string().optional(),
  escola_id: z.union([z.string(), z.number()]).transform(val => String(val)),
  nome: z.string().min(1, 'O nome é obrigatório.'),
  nivel_ensino_id: z.string({ required_error: 'Selecione um nível de ensino.' }),
  turno_id: z.string({ required_error: 'Selecione um turno.' }),
  restricoes: z.any().optional(),
});

type FormValues = z.infer<typeof formSchema>;

type Props = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  serie: SerieComDados | null;
  escolaId: string | number;
  dependencies: { niveisEnsino: NivelEnsino[], turnos: Turno[] };
  onSerieUpdated: () => void;
};

const DIAS_SEMANA_MAP = [
  { id: 'segunda', label: 'Seg' }, { id: 'terca', label: 'Ter' },
  { id: 'quarta', label: 'Qua' }, { id: 'quinta', label: 'Qui' },
  { id: 'sexta', label: 'Sex' }, { id: 'sabado', label: 'Sáb' },
];

/**
 * Etiquetas que a grade da série sabe pintar.
 *
 * Mesmo modelo da tela de restrições de professor: escolhe a etiqueta na barra,
 * depois pinta as células. Antes daqui o clique era um toggle binário de
 * `proibido` — com dois status pintáveis, toggle cego não serve mais.
 *
 * `nao_presencial` é o status que reserva o slot para aula NP dentro do próprio
 * turno. A regra de contagem dele vive em `@/lib/capacidade-serie`.
 */
const ETIQUETAS = [
  {
    id: 'proibido',
    label: 'Bloqueio',
    icone: Ban,
    celula: 'bg-red-100 dark:bg-red-900/30',
    marca: 'text-red-600',
    botao: 'border-red-500 bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    ajuda: 'Nenhuma aula cai neste horário.',
  },
  {
    id: 'nao_presencial',
    label: 'Aula Não Presencial',
    icone: MonitorSmartphone,
    celula: 'bg-orange-100 dark:bg-orange-900/30',
    marca: 'text-orange-600',
    botao: 'border-orange-500 bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
    ajuda: 'Aula não presencial no próprio horário da turma.',
  },
] as const;

type EtiquetaId = (typeof ETIQUETAS)[number]['id'];
type Ferramenta = EtiquetaId | 'limpar';

const etiquetaPor = (id: string | undefined) => ETIQUETAS.find(e => e.id === id);

export function EditSerieSheet({ isOpen, setIsOpen, serie, escolaId, dependencies, onSerieUpdated }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [ferramenta, setFerramenta] = useState<Ferramenta | null>(null);
  const isEdit = !!serie;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { 
        escola_id: String(escolaId),
        nome: '',
        restricoes: {}
    },
  });

  const selectedTurnoId = form.watch('turno_id');
  const turnoInfo = useMemo(() => dependencies.turnos.find(t => t.id === selectedTurnoId), [selectedTurnoId, dependencies.turnos]);
  
  useEffect(() => {
    if (isOpen) {
      // CORREÇÃO 2: Destrava clique no corpo da página
      document.body.style.pointerEvents = 'auto';

      setFerramenta(null);

      form.reset({
        id: serie?.id,
        escola_id: String(escolaId),
        nome: serie?.nome ?? '',
        nivel_ensino_id: serie?.nivel_ensino_id ?? undefined,
        turno_id: serie?.turno_id ?? undefined,
        restricoes: serie?.restricoes ?? {},
      });
    }
  }, [isOpen, serie, escolaId, form]);

  const handleCellClick = (dia: string, aulaIndex: number) => {
    if (!ferramenta) {
      toast({ title: 'Selecione um tipo acima', description: 'Escolha Bloqueio, Aula Não Presencial ou Limpar antes de clicar na grade.' });
      return;
    }

    const currentRestricoes = form.getValues('restricoes') || {};
    const newRestricoes = JSON.parse(JSON.stringify(currentRestricoes));

    if (!newRestricoes[dia]) newRestricoes[dia] = {};
    const currentStatus = newRestricoes[dia][aulaIndex];

    // Clicar de novo com a mesma etiqueta limpa — é o toggle que a tela sempre
    // teve, agora por etiqueta em vez de global.
    if (ferramenta === 'limpar' || currentStatus === ferramenta) {
      delete newRestricoes[dia][aulaIndex];
    } else {
      newRestricoes[dia][aulaIndex] = ferramenta;
    }

    form.setValue('restricoes', newRestricoes, { shouldDirty: true });
  };

  const onSubmit = async (data: FormValues) => {
    console.log("🚀 Enviando Série:", data);
    setLoading(true);
    try {
        const result = await upsertSerie(data);
        if (result.error) {
            toast({ title: 'Erro', description: result.error, variant: 'destructive' });
            return;
        }
        toast({ title: 'Sucesso', description: `Série "${data.nome}" salva.` });
        onSerieUpdated();
        setIsOpen(false);
    } catch (e) {
        toast({ title: 'Erro', description: 'Falha na comunicação com o servidor.', variant: 'destructive' });
    } finally {
        setLoading(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent onPointerDownOutside={(e) => e.preventDefault()} className="sm:max-w-2xl flex flex-col h-full pointer-events-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Editar Série' : 'Nova Série'}</SheetTitle>
          <SheetDescription>{isEdit ? 'Edite as informações da série e suas restrições.' : 'Preencha os dados da nova série.'}</SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form 
            id="serie-form" 
            onSubmit={form.handleSubmit(onSubmit, (err) => console.log("⚠️ Erros de Validação:", err))} 
            className="flex-1 overflow-y-auto pr-2 py-4"
          >
            <Tabs defaultValue="dados" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="dados">Dados da Série</TabsTrigger>
                    <TabsTrigger value="restricoes" disabled={!turnoInfo}>Restrições</TabsTrigger>
                </TabsList>
                
                <TabsContent value="dados" className="pt-4 space-y-4">
                    <FormField control={form.control} name="nome" render={({ field }) => (
                        <FormItem data-tutorial="serie-sheet-nome"><FormLabel>Nome da Série</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )}/>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField control={form.control} name="nivel_ensino_id" render={({ field }) => (
                            <FormItem data-tutorial="serie-sheet-nivel"><FormLabel>Nível de Ensino</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger></FormControl>
                                    <SelectContent>{dependencies.niveisEnsino.map(n => <SelectItem key={n.id} value={n.id}>{n.nome}</SelectItem>)}</SelectContent>
                                </Select><FormMessage />
                            </FormItem>
                        )}/>
                        <FormField control={form.control} name="turno_id" render={({ field }) => (
                            <FormItem data-tutorial="serie-sheet-turno"><FormLabel>Turno</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger></FormControl>
                                    <SelectContent>{dependencies.turnos.map(t => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}</SelectContent>
                                </Select><FormMessage />
                            </FormItem>
                        )}/>
                    </div>
                </TabsContent>

                <TabsContent value="restricoes" className="pt-4 space-y-3">
                    {turnoInfo ? (
                      <>
                        <div className="flex flex-wrap items-center gap-2">
                            {ETIQUETAS.map(et => {
                                const Icone = et.icone;
                                const ativa = ferramenta === et.id;
                                return (
                                    <button key={et.id} type="button" title={et.ajuda}
                                        onClick={() => setFerramenta(ativa ? null : et.id)}
                                        className={cn(
                                            "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                                            ativa ? et.botao : "bg-background hover:bg-accent"
                                        )}>
                                        <Icone className="h-3.5 w-3.5" />
                                        {et.label}
                                    </button>
                                );
                            })}
                            <button type="button" title="Apaga a marca da célula."
                                onClick={() => setFerramenta(ferramenta === 'limpar' ? null : 'limpar')}
                                className={cn(
                                    "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                                    ferramenta === 'limpar' ? "border-foreground/40 bg-muted" : "bg-background hover:bg-accent"
                                )}>
                                <Eraser className="h-3.5 w-3.5" />
                                Limpar
                            </button>
                        </div>

                        <p className="text-xs text-muted-foreground">
                            {ferramenta
                                ? (ferramenta === 'limpar' ? 'Clique nas células para apagar a marca.' : etiquetaPor(ferramenta)?.ajuda)
                                : 'Escolha um tipo acima e clique nas células da grade.'}
                        </p>

                        <div className="rounded-xl border bg-card overflow-hidden">
                            <table className="w-full text-sm text-center">
                                <thead>
                                    <tr className="bg-muted/50 border-b">
                                        <th className="p-2 font-medium border-r w-24">Aula</th>
                                        {DIAS_SEMANA_MAP.filter(d => turnoInfo.dias_semana.includes(d.id)).map(dia => (
                                            <th key={dia.id} className="p-2 font-medium min-w-[60px]">{dia.label}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {Array.from({ length: turnoInfo.aulas_por_dia }).map((_, aulaIndex) => (
                                        <tr key={aulaIndex} className="border-b last:border-0">
                                            <td className="p-2 font-medium bg-muted/20 border-r">
                                                <div className="font-semibold">{aulaIndex + 1}ª</div>
                                                <div className="text-xs text-muted-foreground">
                                                    {turnoInfo.horarios?.[aulaIndex]?.inicio || '--:--'} - {turnoInfo.horarios?.[aulaIndex]?.fim || '--:--'}
                                                </div>
                                            </td>
                                            {DIAS_SEMANA_MAP.filter(d => turnoInfo.dias_semana.includes(d.id)).map(dia => {
                                                const restricoes = form.watch('restricoes') || {};
                                                const etiqueta = etiquetaPor(restricoes[dia.id]?.[aulaIndex]);
                                                const Marca = etiqueta?.icone;
                                                return (
                                                    <td key={dia.id} className="p-0">
                                                        <div onClick={() => handleCellClick(dia.id, aulaIndex)}
                                                            title={etiqueta?.label}
                                                            className={cn("h-14 w-full flex items-center justify-center cursor-pointer transition-colors",
                                                                etiqueta ? etiqueta.celula : 'hover:bg-accent'
                                                            )}>
                                                            {Marca && <Marca className={cn("h-5 w-5", etiqueta!.marca)} />}
                                                        </div>
                                                    </td>
                                                )
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                      </>
                    ) : (
                        <p className="text-muted-foreground text-center py-10">Selecione um turno na aba "Dados" para liberar as restrições.</p>
                    )}
                </TabsContent>
            </Tabs>
          </form>
        </Form>
        <SheetFooter data-tutorial="serie-sheet-rodape" className="mt-auto border-t pt-4 bg-background">
          <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>Cancelar</Button>
          <Button 
            type="submit" 
            form="serie-form" 
            disabled={loading} 
            className="min-w-[100px]"
            onClick={() => console.log("🖱️ Clique no Salvar Série")}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Salvar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
