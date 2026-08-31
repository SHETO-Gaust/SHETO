'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { enviarComunicadoMassaAction } from '../actions';
import type { UserListItem } from '../actions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { RichEditor } from '@/components/ui/rich-editor';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Mail, Send, Users, Loader2, ArrowLeft, Search, Eye, CheckCheck, X,
} from 'lucide-react';

type Props = {
  users: UserListItem[];
};

/** O Tiptap devolve esses valores quando o editor esta visualmente vazio. */
const CORPO_VAZIO = ['', '<p></p>', '<p><br></p>'];

export function EmailMassaClient({ users }: Props) {
  const router = useRouter();
  const { toast } = useToast();

  const [targetType, setTargetType] = useState<'all' | 'specific'>('all');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [titulo, setTitulo] = useState('');
  const [htmlContent, setHtmlContent] = useState('');
  const [busca, setBusca] = useState('');
  const [sending, setSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const usuariosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return users;
    return users.filter(u =>
      u.nome.toLowerCase().includes(termo) || u.email.toLowerCase().includes(termo)
    );
  }, [users, busca]);

  const totalDestinatarios = targetType === 'all' ? users.length : selectedUserIds.length;
  const corpoVazio = CORPO_VAZIO.includes(htmlContent.trim());
  const podeEnviar = !!titulo.trim() && !corpoVazio && totalDestinatarios > 0 && !sending;

  const toggleUser = (userId: string) => {
    setSelectedUserIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleValidarEAbrirConfirmacao = () => {
    if (!titulo.trim()) {
      return toast({ title: 'Atenção', description: 'Informe um assunto para a mensagem.', variant: 'destructive' });
    }
    if (corpoVazio) {
      return toast({ title: 'Atenção', description: 'Escreva o corpo do e-mail.', variant: 'destructive' });
    }
    if (totalDestinatarios === 0) {
      return toast({ title: 'Atenção', description: 'Selecione ao menos um destinatário.', variant: 'destructive' });
    }
    setConfirmOpen(true);
  };

  const handleSend = async () => {
    setConfirmOpen(false);
    setSending(true);

    const res = await enviarComunicadoMassaAction({
      titulo,
      html: htmlContent,
      targetIds: targetType === 'all' ? 'all' : selectedUserIds,
    });

    setSending(false);

    if (res.error) {
      toast({ title: 'Erro de Envio', description: res.error, variant: 'destructive' });
      return;
    }

    toast({
      title: 'Comunicado Enviado',
      description: `${res.count} e-mails disparados com sucesso via cópia oculta (BCC).`,
    });
    setTitulo('');
    setHtmlContent('');
    setSelectedUserIds([]);
  };

  return (
    <div className="space-y-6 pb-4">
      {/* Cabecalho */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 h-8 text-muted-foreground hover:text-foreground"
            onClick={() => router.push('/auditoria')}
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar para Auditoria
          </Button>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Mail className="h-6 w-6 text-primary shrink-0" />
            Comunicado por E-mail
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Escreva a mensagem e acompanhe, ao lado, exatamente como ela chegará na
            caixa de entrada dos usuários. O envio usa cópia oculta (BCC).
          </p>
        </div>

        <Badge variant="secondary" className="self-start shrink-0 gap-1.5 py-1.5 px-3 text-xs">
          <Users className="h-3.5 w-3.5" />
          {totalDestinatarios} {totalDestinatarios === 1 ? 'destinatário' : 'destinatários'}
        </Badge>
      </div>

      {/*
        Duas colunas no desktop (escrita | pre-visualizacao) e empilhado no
        celular. `items-start` deixa cada coluna crescer com o proprio conteudo,
        em vez de esticarem juntas.
      */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 items-start">
        {/* Coluna da esquerda: composicao */}
        <div className="space-y-6 min-w-0">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" /> Destinatários
              </CardTitle>
              <CardDescription>Quem vai receber este comunicado.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select value={targetType} onValueChange={(v: 'all' | 'specific') => setTargetType(v)}>
                <SelectTrigger className="font-medium bg-muted/30 h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    <span className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-blue-500" />
                      Todos os usuários ativos ({users.length})
                    </span>
                  </SelectItem>
                  <SelectItem value="specific">Selecionar manualmente...</SelectItem>
                </SelectContent>
              </Select>

              {targetType === 'specific' && (
                <div className="space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="relative flex-1 min-w-0">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Buscar por nome ou e-mail..."
                        className="pl-8 h-9 text-sm"
                        value={busca}
                        onChange={(e) => setBusca(e.target.value)}
                      />
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 text-xs"
                        onClick={() => setSelectedUserIds(usuariosFiltrados.map(u => u.id))}
                      >
                        <CheckCheck className="h-3.5 w-3.5 mr-1.5" /> Marcar todos
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-9 text-xs"
                        disabled={selectedUserIds.length === 0}
                        onClick={() => setSelectedUserIds([])}
                      >
                        <X className="h-3.5 w-3.5 mr-1.5" /> Limpar
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-lg border bg-muted/20 divide-y max-h-[320px] overflow-y-auto">
                    {usuariosFiltrados.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        Nenhum usuário encontrado para a busca.
                      </p>
                    ) : (
                      usuariosFiltrados.map(u => {
                        const marcado = selectedUserIds.includes(u.id);
                        return (
                          <label
                            key={u.id}
                            className={cn(
                              'flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors',
                              marcado ? 'bg-primary/5' : 'hover:bg-muted/50'
                            )}
                          >
                            <Checkbox checked={marcado} onCheckedChange={() => toggleUser(u.id)} />
                            <div className="flex flex-col min-w-0">
                              <span className="text-sm font-medium leading-tight truncate">{u.nome}</span>
                              <span className="text-xs text-muted-foreground truncate">{u.email}</span>
                            </div>
                          </label>
                        );
                      })
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground">
                    {selectedUserIds.length} de {users.length} usuários selecionados.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Mensagem</CardTitle>
              <CardDescription>
                A área de escrita cresce conforme o texto, sem rolagem apertada.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="assunto" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Assunto
                </Label>
                <Input
                  id="assunto"
                  placeholder="Título do seu e-mail..."
                  className="font-medium h-11 bg-muted/10"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  maxLength={150}
                />
                <p className="text-[11px] text-muted-foreground text-right">{titulo.length}/150</p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Corpo do e-mail
                </Label>
                <RichEditor
                  value={htmlContent}
                  onChange={setHtmlContent}
                  minHeight={340}
                  placeholder="Escreva sua mensagem aqui. O cabeçalho institucional e o rodapé da SEDUC são incluídos automaticamente."
                />
                <p className="text-[11px] text-muted-foreground">
                  Use os botões da barra para título, listas e destaques: a formatação
                  aparece na hora, aqui e na pré-visualização.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Coluna da direita: pre-visualizacao */}
        <div className="min-w-0 lg:sticky lg:top-6">
          <Card className="overflow-hidden">
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="h-4 w-4 text-primary" /> Pré-visualização
              </CardTitle>
              <CardDescription>Como o e-mail chega para quem recebe.</CardDescription>
            </CardHeader>
            <CardContent>
              {/*
                Reproduz o template de sendMassCommunicationEmail (src/lib/mail.ts).
                As cores sao fixas de proposito: o e-mail nao acompanha o tema do
                sistema, entao a previa tambem nao deve acompanhar.
              */}
              <div className="rounded-lg border bg-[#f4f4f5] p-3 sm:p-5 overflow-x-auto">
                <div className="mx-auto w-full max-w-[600px] rounded-lg border-t-4 border-t-[#1e3a8a] bg-white p-5 shadow-sm sm:p-7">
                  <div className="mb-6 border-b border-[#e2e8f0] pb-5 text-center">
                    <h2 className="m-0 text-[20px] font-bold text-[#1e3a8a]">Comunicado Institucional</h2>
                    <p className="mt-1.5 mb-0 text-[13px] text-[#64748b]">
                      Sistema de Horário Escolar (SHE) - SEDUC TO
                    </p>
                  </div>

                  {titulo.trim() && (
                    <p className="mb-4 text-[11px] uppercase tracking-wider text-[#94a3b8]">
                      Assunto: <span className="font-semibold text-[#334155]">{titulo}</span>
                    </p>
                  )}

                  {corpoVazio ? (
                    <p className="py-10 text-center text-sm italic text-[#94a3b8]">
                      O conteúdo que você escrever aparece aqui.
                    </p>
                  ) : (
                    <div
                      className="rich-content text-[#1e293b] [&_h1]:text-[#0f172a] [&_h2]:text-[#0f172a] [&_h3]:text-[#0f172a] [&_strong]:text-[#0f172a] [&_a]:text-[#1e3a8a]"
                      dangerouslySetInnerHTML={{ __html: htmlContent }}
                    />
                  )}

                  <div className="mt-6 rounded bg-[#f8fafc] p-2.5 text-center text-[11px] text-[#64748b]">
                    Você está recebendo este e-mail pois é usuário cadastrado no Sistema de Horário Escolar.
                  </div>

                  <div className="mt-6 border-t border-[#f1f5f9] pt-5 text-center text-[11px] text-[#94a3b8]">
                    <p className="m-0">
                      Secretaria da Educação do Estado do Tocantins © {new Date().getFullYear()}
                    </p>
                    <p className="mt-1 mb-0">Não responda a este e-mail.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Barra de acao, sempre visivel no rodape */}
      <div className="sticky bottom-0 z-20 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:-mx-6 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {totalDestinatarios > 0 ? (
              <>
                Será enviado para <strong className="text-foreground">{totalDestinatarios}</strong>{' '}
                {totalDestinatarios === 1 ? 'pessoa' : 'pessoas'} em cópia oculta.
              </>
            ) : (
              'Nenhum destinatário selecionado.'
            )}
          </p>

          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link href="/auditoria">Cancelar</Link>
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 min-w-[150px]"
              onClick={handleValidarEAbrirConfirmacao}
              disabled={!podeEnviar}
            >
              {sending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enviando...</>
              ) : (
                <><Send className="h-4 w-4 mr-2" /> Enviar Agora</>
              )}
            </Button>
          </div>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar envio do comunicado</AlertDialogTitle>
            <AlertDialogDescription>
              O e-mail será disparado para {totalDestinatarios}{' '}
              {totalDestinatarios === 1 ? 'destinatário' : 'destinatários'} em cópia
              oculta (BCC). Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Revisar</AlertDialogCancel>
            <AlertDialogAction className="bg-blue-600 hover:bg-blue-700" onClick={handleSend}>
              Enviar agora
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
