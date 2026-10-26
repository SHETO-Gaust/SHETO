'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  ImagePlus,
  LifeBuoy,
  Loader2,
  RotateCcw,
  Send,
  TicketPlus,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { abrirChamado, conversarComSuporte } from '@/app/(app)/chamados/actions';
import type { MensagemChat, TipoAtendimento } from '@/lib/suporte/gemini';
import type { PrioridadeChamado, TipoChamado } from '@/lib/suporte/chamados-db';
import { PRIORIDADES } from './rotulos';
import { TIPOS_ACEITOS, comprimirImagem } from './comprimir-imagem';

const MAX_FOTOS = 3;

type Mensagem = MensagemChat & { tipo?: TipoAtendimento };
type Foto = { id: string; nome: string; dataUrl: string };
type Tela = 'chat' | 'formulario' | 'enviado';

/** **negrito** e quebras de linha; o resto sai como texto puro (React escapa). */
function TextoIA({ texto }: { texto: string }) {
  return (
    <>
      {texto.split(/(\*\*[^*]+\*\*)/g).map((parte, i) =>
        parte.startsWith('**') && parte.endsWith('**') ? <strong key={i}>{parte.slice(2, -2)}</strong> : <React.Fragment key={i}>{parte}</React.Fragment>
      )}
    </>
  );
}

export function SuporteButton() {
  const pathname = usePathname();
  const [aberto, setAberto] = React.useState(false);
  const [tela, setTela] = React.useState<Tela>('chat');

  // ── chat ──
  const [mensagens, setMensagens] = React.useState<Mensagem[]>([]);
  const [rascunho, setRascunho] = React.useState('');
  const [pensando, setPensando] = React.useState(false);
  const [oferecerChamado, setOferecerChamado] = React.useState(false);
  const [aviso, setAviso] = React.useState<string | null>(null);
  const [resumo, setResumo] = React.useState('');
  const fimRef = React.useRef<HTMLDivElement>(null);

  // ── formulario ──
  const [tipo, setTipo] = React.useState<TipoChamado>('duvida');
  const [mensagemChamado, setMensagemChamado] = React.useState('');
  const [prioridade, setPrioridade] = React.useState<PrioridadeChamado | null>(null);
  const [fotos, setFotos] = React.useState<Foto[]>([]);
  const [processandoFoto, setProcessandoFoto] = React.useState(false);
  const [enviando, setEnviando] = React.useState(false);
  const [erroFormulario, setErroFormulario] = React.useState<string | null>(null);
  const [protocolo, setProtocolo] = React.useState<number | null>(null);
  const inputFotoRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [mensagens, pensando, oferecerChamado, aviso]);

  const recomecar = () => {
    setTela('chat');
    setMensagens([]);
    setRascunho('');
    setOferecerChamado(false);
    setAviso(null);
    setResumo('');
    setTipo('duvida');
    setMensagemChamado('');
    setPrioridade(null);
    setFotos([]);
    setErroFormulario(null);
    setProtocolo(null);
  };

  const aoMudarAberto = (valor: boolean) => {
    setAberto(valor);
    // Depois de enviado, fechar zera tudo: a proxima abertura e um atendimento novo.
    if (!valor && tela === 'enviado') recomecar();
  };

  const enviarMensagem = async () => {
    const texto = rascunho.trim();
    if (!texto || pensando) return;

    const conversa: Mensagem[] = [...mensagens, { papel: 'usuario', texto }];
    setMensagens(conversa);
    setRascunho('');
    setAviso(null);
    setPensando(true);

    try {
      const r = await conversarComSuporte({
        conversa: conversa.map(({ papel, texto }) => ({ papel, texto })),
        rota: pathname,
      });
      if (r.ok) {
        setMensagens(m => [...m, { papel: 'ia', texto: r.resposta, tipo: r.tipo }]);
        setOferecerChamado(r.oferecerChamado);
        if (r.resumo) setResumo(r.resumo);
      } else {
        setAviso(r.mensagem);
        // Sem IA (ou no limite), o chamado vira o caminho - nao pode ficar sem saida.
        if (r.motivo !== 'invalido') setOferecerChamado(true);
      }
    } catch {
      setAviso('Não foi possível falar com o assistente agora. Você pode abrir um chamado para a equipe do SHE.');
      setOferecerChamado(true);
    } finally {
      setPensando(false);
    }
  };

  const irParaFormulario = () => {
    const relatouErro = mensagens.some(m => m.tipo === 'erro');
    setTipo(relatouErro ? 'erro' : 'duvida');
    if (!mensagemChamado) {
      const doUsuario = mensagens.filter(m => m.papel === 'usuario').map(m => m.texto);
      setMensagemChamado(resumo || doUsuario.join('\n\n'));
    }
    setErroFormulario(null);
    setTela('formulario');
  };

  const adicionarArquivos = async (arquivos: File[]) => {
    const imagens = arquivos.filter(a => TIPOS_ACEITOS.includes(a.type));
    if (imagens.length < arquivos.length) {
      setErroFormulario('Só dá para anexar imagens JPG, PNG ou WEBP.');
    }
    const vagas = MAX_FOTOS - fotos.length;
    if (vagas <= 0) {
      setErroFormulario(`No máximo ${MAX_FOTOS} fotos.`);
      return;
    }
    if (imagens.length > vagas) {
      setErroFormulario(`No máximo ${MAX_FOTOS} fotos. Só as primeiras ${vagas} foram anexadas.`);
    }
    setProcessandoFoto(true);
    try {
      const novas: Foto[] = [];
      for (const arquivo of imagens.slice(0, vagas)) {
        novas.push({
          id: crypto.randomUUID(),
          nome: arquivo.name || 'print-da-tela.png',
          dataUrl: await comprimirImagem(arquivo),
        });
      }
      setFotos(f => [...f, ...novas].slice(0, MAX_FOTOS));
    } catch {
      setErroFormulario('Não foi possível ler uma das imagens. Tente outra.');
    } finally {
      setProcessandoFoto(false);
    }
  };

  // Ctrl+V de um print (tecla Print Screen) anexa direto - quem relata erro quase sempre tem um.
  const aoColar = (e: React.ClipboardEvent) => {
    const arquivos = Array.from(e.clipboardData.files);
    if (arquivos.length > 0) {
      e.preventDefault();
      void adicionarArquivos(arquivos);
    }
  };

  const enviarChamado = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prioridade) {
      setErroFormulario('Escolha a prioridade.');
      return;
    }
    if (mensagemChamado.trim().length < 10) {
      setErroFormulario('Descreva o problema com pelo menos 10 caracteres.');
      return;
    }
    setEnviando(true);
    setErroFormulario(null);
    try {
      const r = await abrirChamado({
        tipo,
        prioridade,
        mensagem: mensagemChamado.trim(),
        conversa: mensagens.map(({ papel, texto }) => ({ papel, texto })),
        rota: pathname,
        anexos: fotos.map(f => ({ nome: f.nome, dataUrl: f.dataUrl })),
      });
      if (!r.ok) {
        setErroFormulario(r.error);
        return;
      }
      setProtocolo(r.protocolo);
      setTela('enviado');
    } catch {
      setErroFormulario('Não foi possível enviar agora. Confira sua conexão e tente de novo.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setAberto(true)}
        aria-label="Abrir suporte"
        title="Suporte: tire dúvidas ou relate um erro"
        className="shrink-0 gap-1.5 rounded-full text-muted-foreground hover:text-primary"
      >
        <LifeBuoy className="h-5 w-5" />
        <span className="hidden sm:inline">Suporte</span>
      </Button>

      <Sheet open={aberto} onOpenChange={aoMudarAberto}>
        <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b px-5 py-4 text-left">
            <SheetTitle className="flex items-center gap-2">
              <LifeBuoy className="h-5 w-5 text-primary" /> Suporte SHE
            </SheetTitle>
            <SheetDescription>
              {tela === 'formulario'
                ? 'O chamado vai para a equipe do SHE. A resposta aparece aqui no sistema.'
                : 'Tire uma dúvida sobre o sistema ou relate um erro.'}
            </SheetDescription>
          </SheetHeader>

          {tela === 'chat' && (
            <>
              <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
                {mensagens.length > 0 && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={recomecar}
                      disabled={pensando}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Nova conversa
                    </button>
                  </div>
                )}
                <div className="mr-8 flex gap-2">
                  <Bot className="mt-1 h-5 w-5 shrink-0 text-primary" />
                  <div className="rounded-lg rounded-tl-none bg-muted px-3 py-2 text-sm">
                    Olá! Sou o assistente do SHE. Conte o que você está tentando fazer, ou o erro que apareceu, e eu
                    explico o caminho.
                  </div>
                </div>

                {mensagens.map((m, i) =>
                  m.papel === 'usuario' ? (
                    <div key={i} className="ml-8 flex justify-end">
                      <div className="whitespace-pre-wrap rounded-lg rounded-tr-none bg-primary px-3 py-2 text-sm text-primary-foreground">
                        {m.texto}
                      </div>
                    </div>
                  ) : (
                    <div key={i} className="mr-8 flex gap-2">
                      <Bot className="mt-1 h-5 w-5 shrink-0 text-primary" />
                      <div className="whitespace-pre-wrap rounded-lg rounded-tl-none bg-muted px-3 py-2 text-sm">
                        <TextoIA texto={m.texto} />
                      </div>
                    </div>
                  )
                )}

                {pensando && (
                  <div className="mr-8 flex items-center gap-2 text-sm text-muted-foreground">
                    <Bot className="h-5 w-5 shrink-0 text-primary" />
                    <Loader2 className="h-4 w-4 animate-spin" /> Pensando...
                  </div>
                )}

                {aviso && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                    {aviso}
                  </div>
                )}

                {oferecerChamado && !pensando && (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                    <p className="mb-2 text-sm">Não resolveu? A equipe do SHE pode olhar o seu caso.</p>
                    <Button size="sm" className="w-full" onClick={irParaFormulario}>
                      <TicketPlus className="mr-1.5 h-4 w-4" /> Abrir chamado
                    </Button>
                  </div>
                )}
                <div ref={fimRef} />
              </div>

              <form
                className="flex items-end gap-2 border-t p-3"
                onSubmit={e => {
                  e.preventDefault();
                  void enviarMensagem();
                }}
              >
                <Textarea
                  value={rascunho}
                  onChange={e => setRascunho(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void enviarMensagem();
                    }
                  }}
                  placeholder="Escreva sua dúvida..."
                  rows={2}
                  maxLength={2000}
                  className="min-h-[44px] resize-none"
                  disabled={pensando}
                  aria-label="Mensagem para o suporte"
                />
                <Button type="submit" size="icon" disabled={pensando || !rascunho.trim()} aria-label="Enviar mensagem">
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </>
          )}

          {tela === 'formulario' && (
            <form onSubmit={enviarChamado} onPaste={aoColar} className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
                <button
                  type="button"
                  onClick={() => setTela('chat')}
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-4 w-4" /> Voltar para a conversa
                </button>

                <div className="space-y-1.5">
                  <Label>É sobre</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['duvida', 'erro'] as const).map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTipo(t)}
                        className={cn(
                          'rounded-md border px-3 py-2 text-sm transition-colors',
                          tipo === t ? 'border-primary bg-primary/10 font-medium text-primary' : 'hover:bg-muted'
                        )}
                        aria-pressed={tipo === t}
                      >
                        {t === 'duvida' ? 'Uma dúvida' : 'Um erro no sistema'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="suporte-mensagem">Descreva o que aconteceu</Label>
                  <Textarea
                    id="suporte-mensagem"
                    value={mensagemChamado}
                    onChange={e => setMensagemChamado(e.target.value)}
                    rows={6}
                    maxLength={4000}
                    placeholder="O que você tentou fazer, em qual tela, e o que apareceu."
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Prioridade</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {PRIORIDADES.map(p => (
                      <button
                        key={p.valor}
                        type="button"
                        onClick={() => {
                          setPrioridade(p.valor);
                          setErroFormulario(null);
                        }}
                        aria-pressed={prioridade === p.valor}
                        className={cn(
                          'rounded-md border px-2 py-2 text-left transition-colors',
                          prioridade === p.valor ? cn(p.classe, 'ring-2 ring-current/30') : 'hover:bg-muted'
                        )}
                      >
                        <span className="block text-sm font-semibold">{p.rotulo}</span>
                        <span className="block text-[11px] leading-tight opacity-80">{p.descricao}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>
                    Fotos da tela <span className="font-normal text-muted-foreground">(até {MAX_FOTOS}, opcional)</span>
                  </Label>
                  <div className="grid grid-cols-3 gap-2">
                    {fotos.map(f => (
                      <div key={f.id} className="group relative aspect-square overflow-hidden rounded-md border">
                        {/* eslint-disable-next-line @next/next/no-img-element -- previa local (data URL) */}
                        <img src={f.dataUrl} alt={f.nome} className="h-full w-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setFotos(lista => lista.filter(x => x.id !== f.id))}
                          className="absolute right-1 top-1 rounded-full bg-background/90 p-1 shadow"
                          aria-label={`Remover ${f.nome}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    {fotos.length < MAX_FOTOS && (
                      <button
                        type="button"
                        onClick={() => inputFotoRef.current?.click()}
                        disabled={processandoFoto}
                        className="flex aspect-square flex-col items-center justify-center gap-1 rounded-md border border-dashed text-xs text-muted-foreground hover:bg-muted"
                      >
                        {processandoFoto ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
                        Adicionar
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">Dica: tire um print (tecla Print Screen) e cole aqui com Ctrl+V.</p>
                  <input
                    ref={inputFotoRef}
                    type="file"
                    accept={TIPOS_ACEITOS.join(',')}
                    multiple
                    className="hidden"
                    onChange={e => {
                      void adicionarArquivos(Array.from(e.target.files ?? []));
                      e.target.value = '';
                    }}
                  />
                </div>

                {erroFormulario && (
                  <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                    {erroFormulario}
                  </p>
                )}
              </div>

              <div className="border-t p-3">
                <Button type="submit" className="w-full" disabled={enviando || processandoFoto}>
                  {enviando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
                  Enviar chamado
                </Button>
              </div>
            </form>
          )}

          {tela === 'enviado' && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-600" />
              <p className="text-lg font-semibold">Chamado #{protocolo} aberto</p>
              <p className="text-sm text-muted-foreground">
                A equipe do SHE já recebeu. Quando responderem, a resposta vai aparecer numa janela aqui no sistema e
                também no seu e-mail.
              </p>
              <Button
                className="mt-2"
                onClick={() => {
                  setAberto(false);
                  recomecar();
                }}
              >
                Fechar
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
