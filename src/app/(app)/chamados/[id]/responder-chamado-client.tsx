'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Bot, CheckCircle2, Loader2, Mail, MonitorSmartphone, School, Send, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import type { AnexoResumo, Chamado } from '@/lib/suporte/chamados-db';
import { STATUS_ROTULO, TIPO_ROTULO, formatarDataHora, prioridade } from '@/components/suporte/rotulos';
import { responderChamado } from '../actions';

export function ResponderChamadoClient({
  chamado,
  anexos,
  tela,
}: {
  chamado: Chamado;
  anexos: AnexoResumo[];
  tela: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [resposta, setResposta] = React.useState(chamado.resposta ?? '');
  const [correcao, setCorrecao] = React.useState(chamado.correcao ?? '');
  const [editando, setEditando] = React.useState(chamado.status === 'aberto');
  const [enviando, setEnviando] = React.useState(false);

  const p = prioridade(chamado.prioridade);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    try {
      const r = await responderChamado({ id: chamado.id, resposta, correcao });
      if (!r.ok) {
        toast({ variant: 'destructive', title: 'Não foi possível responder', description: r.error });
        return;
      }
      toast({
        title: 'Resposta enviada',
        description: r.emailEnviado
          ? 'O usuário verá a resposta ao entrar no sistema e também recebeu por e-mail.'
          : 'O usuário verá a resposta ao entrar no sistema. O e-mail não pôde ser enviado.',
      });
      setEditando(false);
      router.refresh();
    } catch {
      toast({ variant: 'destructive', title: 'Erro inesperado', description: 'Tente novamente em instantes.' });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="mr-2">Chamado #{chamado.protocolo}</CardTitle>
            <Badge variant="outline" className={p.classe}>
              Prioridade {p.rotulo.toLowerCase()}
            </Badge>
            <Badge variant="outline">{TIPO_ROTULO[chamado.tipo]}</Badge>
            <Badge variant="outline" className={STATUS_ROTULO[chamado.status].classe}>
              {STATUS_ROTULO[chamado.status].rotulo}
            </Badge>
          </div>
          <CardDescription>Aberto em {formatarDataHora(chamado.created_at)}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <p className="flex items-center gap-2">
              <User className="h-4 w-4 shrink-0 text-muted-foreground" />
              {chamado.user_nome || 'Nome não informado'}
            </p>
            <p className="flex min-w-0 items-center gap-2">
              <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
              <a href={`mailto:${chamado.user_email}`} className="truncate hover:underline">
                {chamado.user_email}
              </a>
            </p>
            <p className="flex items-center gap-2">
              <School className="h-4 w-4 shrink-0 text-muted-foreground" />
              {chamado.escola_nome || 'Sem escola selecionada'}
            </p>
            <p className="flex items-center gap-2">
              <MonitorSmartphone className="h-4 w-4 shrink-0 text-muted-foreground" />
              Tela: {tela}
            </p>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-semibold">Mensagem</p>
            <p className="whitespace-pre-wrap rounded-md border bg-muted/40 p-4 text-sm">{chamado.mensagem}</p>
          </div>

          {anexos.length > 0 && (
            <div>
              <p className="mb-1.5 text-sm font-semibold">Fotos ({anexos.length})</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {anexos.map(a => (
                  <a
                    key={a.id}
                    href={`/api/chamados/anexo/${a.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group overflow-hidden rounded-md border"
                    title="Abrir em tamanho real"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- imagem autenticada servida pela API, fora do otimizador */}
                    <img
                      src={`/api/chamados/anexo/${a.id}`}
                      alt={a.nome}
                      className="aspect-video w-full object-cover transition-transform group-hover:scale-105"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}

          {chamado.conversa.length > 0 && (
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm">
                  <Bot className="mr-1.5 h-4 w-4" />
                  Ver conversa com a IA ({chamado.conversa.length} mensagens)
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 space-y-2">
                {chamado.conversa.map((m, i) => (
                  <div
                    key={i}
                    className={
                      m.papel === 'ia'
                        ? 'mr-8 rounded-md bg-primary/5 p-3 text-sm'
                        : 'ml-8 rounded-md border bg-background p-3 text-sm'
                    }
                  >
                    <p className="mb-1 text-xs font-semibold text-muted-foreground">
                      {m.papel === 'ia' ? 'Assistente (IA)' : 'Usuário'}
                    </p>
                    <p className="whitespace-pre-wrap">{m.texto}</p>
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Resposta</CardTitle>
          <CardDescription>
            {chamado.status === 'respondido' && !editando
              ? `Respondido por ${chamado.respondido_por_nome || 'administrador'} em ${formatarDataHora(chamado.respondido_em)}.`
              : 'O usuário verá esta resposta numa janela, uma única vez, na próxima vez que usar o sistema. Também vai por e-mail.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!editando ? (
            <div className="space-y-4">
              <div>
                <p className="mb-1.5 text-sm font-semibold">Resposta ao usuário</p>
                <p className="whitespace-pre-wrap rounded-md border-l-4 border-primary bg-muted/40 p-4 text-sm">
                  {chamado.resposta}
                </p>
              </div>
              {chamado.correcao && (
                <div>
                  <p className="mb-1.5 text-sm font-semibold">Correção aplicada</p>
                  <p className="whitespace-pre-wrap rounded-md border-l-4 border-green-600 bg-muted/40 p-4 text-sm">
                    {chamado.correcao}
                  </p>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  {chamado.resposta_vista_em
                    ? `Usuário viu a resposta em ${formatarDataHora(chamado.resposta_vista_em)}.`
                    : 'O usuário ainda não viu a resposta.'}
                </p>
                <Button variant="outline" size="sm" className="ml-auto" onClick={() => setEditando(true)}>
                  Editar resposta
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={enviar} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="resposta">Resposta ao usuário</Label>
                <Textarea
                  id="resposta"
                  value={resposta}
                  onChange={e => setResposta(e.target.value)}
                  rows={6}
                  placeholder="Explique o que aconteceu e o que a pessoa deve fazer agora."
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="correcao">
                  Correção aplicada <span className="font-normal text-muted-foreground">(opcional)</span>
                </Label>
                <Textarea
                  id="correcao"
                  value={correcao}
                  onChange={e => setCorrecao(e.target.value)}
                  rows={4}
                  placeholder="Se era um erro do sistema: o que foi corrigido."
                />
              </div>
              {chamado.status === 'respondido' && (
                <p className="text-xs text-muted-foreground">
                  Ao salvar, a janela com a resposta aparece de novo para o usuário e um novo e-mail é enviado.
                </p>
              )}
              <div className="flex justify-end gap-2">
                {chamado.status === 'respondido' && (
                  <Button type="button" variant="ghost" onClick={() => setEditando(false)} disabled={enviando}>
                    Cancelar
                  </Button>
                )}
                <Button type="submit" disabled={enviando || resposta.trim().length < 5}>
                  {enviando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
                  Enviar resposta
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </>
  );
}
