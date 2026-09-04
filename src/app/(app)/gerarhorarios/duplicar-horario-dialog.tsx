'use client';

import { useEffect, useState } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Copy, RefreshCw, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { duplicarHorario } from './actions';
import { sugerirNomeDeCopia } from '@/lib/nome-de-grade';

type Acao = 'duplicar' | 'regerar';

type DuplicarHorarioDialogProps = {
  aberto: boolean;
  setAberto: (open: boolean) => void;
  horario: { id: string; nome: string };
  /** Nomes já usados NO MESMO TURNO — é esse o escopo da unicidade no banco. */
  nomesDoTurno: string[];
  aoDuplicar: () => void;
  /**
   * Escolheu regerar: quem chama leva a grade para o diálogo de geração, já
   * marcada como base. O trabalho não acontece aqui porque regerar precisa de
   * tudo o que aquele diálogo coleta — geminação, nome, as duas opções do
   * motor. Duplicar a configuração inteira num segundo lugar seria garantir que
   * os dois saiam do ar um do outro.
   */
  aoRegerar: () => void;
};

export function DuplicarHorarioDialog({
  aberto,
  setAberto,
  horario,
  nomesDoTurno,
  aoDuplicar,
  aoRegerar,
}: DuplicarHorarioDialogProps) {
  const { toast } = useToast();
  const [salvando, setSalvando] = useState(false);
  const [nome, setNome] = useState('');
  const [acao, setAcao] = useState<Acao>('duplicar');

  // O diálogo é montado uma vez por card; o nome sugerido precisa acompanhar a
  // grade escolhida e a lista de nomes já usados.
  useEffect(() => {
    if (aberto) {
      setNome(sugerirNomeDeCopia(horario.nome, nomesDoTurno));
      setAcao('duplicar');
    }
  }, [aberto, horario.nome, nomesDoTurno]);

  const duplicar = async () => {
    if (!nome.trim()) {
      toast({ title: 'Dê um nome para a cópia.', variant: 'destructive' });
      return;
    }
    setSalvando(true);
    const res = await duplicarHorario(horario.id, nome);
    setSalvando(false);

    if (res.error) {
      toast({ title: 'Não foi possível duplicar', description: res.error, variant: 'destructive' });
      return;
    }

    const d = res.data!;
    const ressalvas = [
      d.fixacoesPerdidas > 0
        ? `${d.fixacoesPerdidas} fixação(ões) da série não existem mais e vieram sem travamento.`
        : '',
      d.aulasDescartadas > 0
        ? `${d.aulasDescartadas} aula(s) não couberam por já haver outra no mesmo slot da turma.`
        : '',
    ].filter(Boolean).join(' ');

    toast({
      title: 'Cópia criada',
      description: `"${d.nome}" nasceu como rascunho com ${d.aulasCopiadas} aula(s). ${ressalvas}`.trim(),
    });
    aoDuplicar();
    setAberto(false);
  };

  const confirmar = () => {
    if (acao === 'duplicar') return void duplicar();
    setAberto(false);
    aoRegerar();
  };

  const opcoes: { id: Acao; icone: typeof Copy; titulo: string; texto: string }[] = [
    {
      id: 'duplicar',
      icone: Copy,
      titulo: 'Duplicar',
      texto: 'Cria uma cópia idêntica, como rascunho, para você mexer à mão sem tocar nesta.',
    },
    {
      id: 'regerar',
      icone: RefreshCw,
      titulo: 'Regerar',
      texto: 'Roda o gerador de novo partindo desta grade: a nova sai o mais parecida possível, já com o que mudou no cadastro.',
    },
  ];

  return (
    <AlertDialog open={aberto} onOpenChange={setAberto}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Copy className="h-4 w-4 text-primary" />
            {horario.nome}
          </AlertDialogTitle>
          <AlertDialogDescription>
            O que você quer fazer com esta grade? A original não muda em nenhum dos dois casos.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2 py-1">
          {opcoes.map(o => {
            const Icone = o.icone;
            const ativa = acao === o.id;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => setAcao(o.id)}
                disabled={salvando}
                className={cn(
                  'w-full text-left flex gap-3 rounded-lg border p-3 transition-colors',
                  ativa ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
                )}
              >
                <Icone className={cn('h-4 w-4 mt-0.5 shrink-0', ativa ? 'text-primary' : 'text-muted-foreground')} />
                <div className="space-y-0.5 min-w-0">
                  <p className="text-sm font-semibold flex items-center gap-1.5">
                    {o.titulo}
                    {ativa && <Check className="h-3 w-3 text-primary" />}
                  </p>
                  <p className="text-xs text-muted-foreground">{o.texto}</p>
                </div>
              </button>
            );
          })}
        </div>

        {acao === 'duplicar' ? (
          <div className="py-1">
            <Label htmlFor="nome-copia">Nome da cópia</Label>
            <Input
              id="nome-copia"
              value={nome}
              onChange={e => setNome(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !salvando) void duplicar(); }}
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Dois horários do mesmo turno não podem ter o mesmo nome.
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground py-1">
            O próximo passo abre a configuração da geração — nome, geminação e as opções do motor —
            já com <strong>{horario.nome}</strong> marcada como ponto de partida.
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={salvando}>Cancelar</AlertDialogCancel>
          <Button onClick={confirmar} disabled={salvando}>
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {acao === 'duplicar' ? 'Duplicar' : 'Configurar a geração'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
