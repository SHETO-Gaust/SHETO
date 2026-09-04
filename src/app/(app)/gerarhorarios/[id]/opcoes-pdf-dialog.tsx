'use client';

/**
 * O que perguntar antes de abrir a impressão de um horário.
 *
 * Duas perguntas moram aqui, e nenhuma tem resposta certa que o sistema possa
 * escolher sozinho:
 *
 *   - COR POR DISCIPLINA, em todo PDF de horário. Colorir ajuda quem lê a grade
 *     na parede e atrapalha quem imprime em preto e branco, então o padrão é
 *     não colorir e a decisão é de quem gera.
 *   - HORÁRIOS LIVRES, só nos relatórios de professor. A pergunta é antiga e
 *     está explicada em `export-grade-professor.ts`; ela passou a conviver com a
 *     das cores em vez de virar um segundo diálogo em sequência.
 */

import { useEffect, useMemo, useState } from 'react';
import { Dices, Palette, RotateCcw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  coresDaPaleta,
  gerarCoresAleatorias,
  type ComponenteColorivel,
  type CoresPorComponente,
} from '@/lib/cores-componentes';
import type { MarcaSlotLivre } from '@/lib/export-grade-professor';

/** Como as cores são decididas. `nenhuma` é o padrão e o comportamento antigo. */
type ModoCor = 'nenhuma' | 'aleatoria' | 'manual';

export type OpcoesPDF = {
  /** `null` quando o usuário escolheu não colorir. */
  cores: CoresPorComponente | null;
  slotLivre: MarcaSlotLivre;
};

type Props = {
  aberto: boolean;
  onOpenChange: (aberto: boolean) => void;
  /** Disciplinas que podem receber cor — as que aparecem no horário em tela. */
  componentes: ComponenteColorivel[];
  /**
   * Relatório de professor: acrescenta a pergunta dos horários livres. Nos PDFs
   * de turma ela não faz sentido — não há tempo livre de turma a rotular.
   */
  perguntarSlotLivre: boolean;
  /** Muda entre "o professor" e "os professores" conforme o escopo pedido. */
  descricaoSlotLivre?: string;
  onGerar: (opcoes: OpcoesPDF) => void;
};

const OPCOES_COR: { valor: ModoCor; titulo: string; descricao: string }[] = [
  {
    valor: 'nenhuma',
    titulo: 'Sem cores',
    descricao: 'O horário sai em preto e branco, como sempre saiu.',
  },
  {
    valor: 'aleatoria',
    titulo: 'Cores automáticas',
    descricao: 'O sistema sorteia um tom claro e distinto para cada disciplina.',
  },
  {
    valor: 'manual',
    titulo: 'Escolher as cores',
    descricao: 'Você define o tom de cada disciplina, uma a uma.',
  },
];

export function OpcoesPdfDialog({
  aberto,
  onOpenChange,
  componentes,
  perguntarSlotLivre,
  descricaoSlotLivre,
  onGerar,
}: Props) {
  const [modo, setModo] = useState<ModoCor>('nenhuma');
  const [cores, setCores] = useState<CoresPorComponente>({});
  const [slotLivre, setSlotLivre] = useState<MarcaSlotLivre>('planejamento');

  const ids = useMemo(() => componentes.map(c => c.id), [componentes]);

  /**
   * A escolha atravessa o fechamento do diálogo de propósito: gerar o PDF de uma
   * turma, conferir e gerar o da seguinte é o uso normal da tela, e repintar
   * vinte disciplinas a cada vez tornaria o modo manual inútil.
   *
   * O que precisa acompanhar são as disciplinas: no portal de consulta o mesmo
   * componente serve horários de turnos diferentes, e uma cor guardada para uma
   * disciplina que saiu da lista não deve continuar na legenda.
   */
  useEffect(() => {
    setCores(atuais => {
      const validas: CoresPorComponente = {};
      for (const id of ids) if (atuais[id]) validas[id] = atuais[id];
      return validas;
    });
  }, [ids]);

  const escolherModo = (novo: ModoCor) => {
    setModo(novo);
    if (novo === 'aleatoria') setCores(gerarCoresAleatorias(ids));
    // O manual começa do que já estiver na mão — o sorteio anterior, se houve —
    // para o usuário ajustar duas disciplinas em vez de escolher todas.
    else if (novo === 'manual') {
      setCores(atuais => (Object.keys(atuais).length > 0 ? atuais : coresDaPaleta(ids)));
    }
  };

  const confirmar = () => {
    onGerar({ cores: modo === 'nenhuma' ? null : cores, slotLivre });
    onOpenChange(false);
  };

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] flex flex-col p-0 print:hidden">
        <DialogHeader className="p-6 pb-3">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <Palette className="h-5 w-5 text-primary" />
            Opções do PDF
          </DialogTitle>
          <DialogDescription>
            Como o horário deve sair na impressão. Nada aqui altera a grade — só o documento.
          </DialogDescription>
        </DialogHeader>

        {/*
          Quem rola é este contêiner, e é ele que precisa da altura definida:
          `flex-1` sobre um pai com `max-h` dá base zero, e o `overflow-y-auto`
          faz o `min-height: auto` do item flex resolver para 0 — sem isso a
          lista empurraria o diálogo para fora da tela em vez de rolar.
        */}
        <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-6">
          <section className="space-y-3">
            <Label className="text-sm font-bold">Cor por disciplina</Label>

            <div className="grid gap-2">
              {OPCOES_COR.map(opcao => (
                <button
                  key={opcao.valor}
                  type="button"
                  onClick={() => escolherModo(opcao.valor)}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border-2 p-3 text-left transition-colors',
                    modo === opcao.valor ? 'border-primary bg-primary/5' : 'hover:border-primary/40',
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 h-4 w-4 shrink-0 rounded-full border-2',
                      modo === opcao.valor ? 'border-primary bg-primary' : 'border-muted-foreground/40',
                    )}
                  />
                  <span className="space-y-0.5">
                    <span className="block text-sm font-semibold">{opcao.titulo}</span>
                    <span className="block text-xs text-muted-foreground">{opcao.descricao}</span>
                  </span>
                </button>
              ))}
            </div>

            {componentes.length === 0 && modo !== 'nenhuma' && (
              <p className="text-xs text-amber-700 dark:text-amber-500">
                Este horário não tem disciplinas para colorir — o PDF sairá em preto e branco.
              </p>
            )}

            {modo === 'aleatoria' && componentes.length > 0 && (
              <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                <div className="flex flex-wrap gap-1.5">
                  {componentes.map(c => (
                    <span
                      key={c.id}
                      className="rounded-md border border-black/10 px-2 py-1 text-[11px] font-semibold text-gray-900"
                      style={{ backgroundColor: cores[c.id] }}
                      title={c.nome}
                    >
                      {c.sigla || c.nome}
                    </span>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2 h-8 text-xs"
                  onClick={() => setCores(gerarCoresAleatorias(ids))}
                >
                  <Dices className="h-3.5 w-3.5" /> Sortear de novo
                </Button>
              </div>
            )}

            {modo === 'manual' && componentes.length > 0 && (
              <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                {/*
                  A lista corre inteira, sem rolagem própria: quem rola é o corpo
                  do diálogo, logo acima.

                  Houve aqui um `<ScrollArea className="max-h-[240px]">` e ele não
                  rolava. O viewport do Radix é `h-full`, e `h-full` dentro de um
                  pai que só tem `max-height` resolve contra altura indefinida —
                  ou seja, `auto`: o viewport crescia até o tamanho da lista, o
                  `overflow-hidden` do Root cortava o excesso e o Radix concluía
                  que não havia transbordo. Sem barra, sem roda do mouse, e as
                  disciplinas do fim inalcançáveis. Uma rolagem só, no lugar que
                  já funciona, resolve sem depender desse detalhe.
                */}
                <div className="space-y-1.5">
                  {componentes.map(c => (
                    <div key={c.id} className="flex items-center gap-3">
                      {/*
                        `input type="color"` em vez de uma paleta própria: ele é
                        nativo, funciona sem rede — a VM do estado não tem
                        acesso à internet — e abre o seletor do sistema, que o
                        usuário já sabe usar.
                      */}
                      <input
                        type="color"
                        id={`cor-${c.id}`}
                        value={cores[c.id] ?? '#ffffff'}
                        onChange={e => setCores(atuais => ({ ...atuais, [c.id]: e.target.value }))}
                        className="h-8 w-12 shrink-0 cursor-pointer rounded border bg-transparent p-0.5"
                      />
                      <Label htmlFor={`cor-${c.id}`} className="flex-1 cursor-pointer text-xs font-medium">
                        <span className="font-bold">{c.sigla || c.nome}</span>
                        {c.sigla && c.nome && c.sigla !== c.nome && (
                          <span className="ml-2 text-muted-foreground">{c.nome}</span>
                        )}
                      </Label>
                    </div>
                  ))}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2 h-8 text-xs"
                  onClick={() => setCores(coresDaPaleta(ids))}
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Voltar às cores padrão
                </Button>
              </div>
            )}
          </section>

          {perguntarSlotLivre && (
            <section className="space-y-3">
              <Label className="text-sm font-bold">Horários livres</Label>
              <p className="text-xs text-muted-foreground">
                {descricaoSlotLivre ??
                  'Nos horários em que o professor não tem aula nem restrição cadastrada, o relatório pode sair de duas formas:'}
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setSlotLivre('traco')}
                  className={cn(
                    'rounded-lg border-2 p-4 text-left transition-colors',
                    slotLivre === 'traco' ? 'border-primary bg-primary/5' : 'hover:border-primary/40',
                  )}
                >
                  <span className="block text-sm font-bold">Deixar em branco</span>
                  <span className="mt-2 block text-2xl leading-none tracking-widest text-muted-foreground">———</span>
                  <span className="mt-2 block text-xs text-muted-foreground">
                    A célula sai tracejada, como um horário sem compromisso definido.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setSlotLivre('planejamento')}
                  className={cn(
                    'rounded-lg border-2 p-4 text-left transition-colors',
                    slotLivre === 'planejamento' ? 'border-primary bg-primary/5' : 'hover:border-primary/40',
                  )}
                >
                  <span className="block text-sm font-bold">Escrever o destino</span>
                  <span className="mt-2 block text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Plan. Individual
                  </span>
                  <span className="mt-2 block text-xs text-muted-foreground">
                    A célula afirma que o tempo é de planejamento individual do docente.
                  </span>
                </button>
              </div>
            </section>
          )}
        </div>

        <DialogFooter className="border-t p-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={confirmar}>Gerar PDF</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
