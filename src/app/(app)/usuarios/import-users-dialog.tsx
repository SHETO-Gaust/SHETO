'use client';

import { useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Download, Upload, Loader2, AlertTriangle, CheckCircle2, XCircle, FileSpreadsheet } from 'lucide-react';
import {
  COLUNAS_LOTE,
  LIMITE_LINHAS_LOTE,
  linhasDaPlanilha,
  type LinhaLoteBruta,
  type LinhaLoteResolvida,
} from '@/lib/usuarios-lote';
import { validarLoteUsuarios, importarLoteUsuarios, type ResultadoLinhaLote } from './actions';

type Etapa = 'upload' | 'previa' | 'resultado';

type ImportUsersDialogProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  regionais: string[];
  onImported?: () => void;
};

export function ImportUsersDialog({ isOpen, setIsOpen, regionais, onImported }: ImportUsersDialogProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [etapa, setEtapa] = useState<Etapa>('upload');
  const [carregando, setCarregando] = useState(false);
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [linhasBrutas, setLinhasBrutas] = useState<LinhaLoteBruta[]>([]);
  const [previa, setPrevia] = useState<LinhaLoteResolvida[]>([]);
  const [resultados, setResultados] = useState<ResultadoLinhaLote[]>([]);
  const [enviarEmail, setEnviarEmail] = useState(true);

  const validas = previa.filter(l => l.erros.length === 0);
  const comErro = previa.length - validas.length;

  const reiniciar = () => {
    setEtapa('upload');
    setNomeArquivo('');
    setLinhasBrutas([]);
    setPrevia([]);
    setResultados([]);
    setEnviarEmail(true);
    if (inputRef.current) inputRef.current.value = '';
  };

  const fechar = (open: boolean) => {
    if (carregando) return;
    setIsOpen(open);
    if (!open) reiniciar();
  };

  const baixarModelo = async () => {
    const XLSX = await import('xlsx');
    const cabecalho = Object.values(COLUNAS_LOTE);
    const planilha = XLSX.utils.aoa_to_sheet([cabecalho]);
    planilha['!cols'] = cabecalho.map(c => ({ wch: Math.max(18, c.length + 4) }));

    const instrucoes = XLSX.utils.aoa_to_sheet([
      ['Coluna', 'Obrigatória', 'Como preencher'],
      [COLUNAS_LOTE.nome, 'Não', 'Nome completo do usuário.'],
      [COLUNAS_LOTE.email, 'Sim', 'E-mail de login. Não pode já existir no sistema nem se repetir na planilha.'],
      [COLUNAS_LOTE.senha, 'Não', 'Mínimo de 6 caracteres. Se ficar em branco, o sistema gera uma senha e a envia no e-mail de boas-vindas.'],
      [COLUNAS_LOTE.funcao, 'Não', '"Usuário" (padrão): acessa tudo, menos a Gestão (usuários, auditoria, unidades e chamados). "Administrador": acessa tudo.'],
      [COLUNAS_LOTE.regional, 'Não', 'Uma das regionais listadas abaixo. Se a escola for informada, vale a regional da escola.'],
      [COLUNAS_LOTE.escola, 'Não', 'Código INEP da escola (recomendado) ou o nome exatamente como está cadastrado.'],
      [],
      ['Exemplos'],
      cabecalho,
      ['Maria da Silva', 'maria.silva@seduc.to.gov.br', '', 'Usuário', '', '17000000'],
      ['João Souza', 'joao.souza@seduc.to.gov.br', '', 'Administrador', regionais[0] ?? 'PALMAS', ''],
      [],
      ['Regionais válidas'],
      ...regionais.map(r => [r]),
    ]);
    instrucoes['!cols'] = [{ wch: 24 }, { wch: 28 }, { wch: 100 }];

    const pasta = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(pasta, planilha, 'Usuários');
    XLSX.utils.book_append_sheet(pasta, instrucoes, 'Instruções');
    XLSX.writeFile(pasta, 'modelo-cadastro-usuarios.xlsx');
  };

  const lerArquivo = async (arquivo: File) => {
    setCarregando(true);
    try {
      const XLSX = await import('xlsx');
      const pasta = XLSX.read(await arquivo.arrayBuffer(), { type: 'array' });
      // Lê a aba "Usuários" se existir; senão a primeira (planilha montada à mão).
      const nomeAba = pasta.SheetNames.find(n => n.toLowerCase().startsWith('usu')) ?? pasta.SheetNames[0];
      const matriz = XLSX.utils.sheet_to_json<unknown[]>(pasta.Sheets[nomeAba], { header: 1, raw: false, defval: '' });
      const { linhas, erro } = linhasDaPlanilha(matriz);

      if (erro || linhas.length === 0) {
        toast({ title: 'Planilha inválida', description: erro ?? 'Nenhuma linha de usuário encontrada.', variant: 'destructive' });
        return;
      }
      if (linhas.length > LIMITE_LINHAS_LOTE) {
        toast({ title: 'Planilha grande demais', description: `São ${linhas.length} linhas; o limite por envio é ${LIMITE_LINHAS_LOTE}. Divida o arquivo.`, variant: 'destructive' });
        return;
      }

      const resposta = await validarLoteUsuarios(linhas);
      if ('error' in resposta && resposta.error) {
        toast({ title: 'Erro ao validar', description: resposta.error, variant: 'destructive' });
        return;
      }
      setNomeArquivo(arquivo.name);
      setLinhasBrutas(linhas);
      setPrevia(resposta.linhas ?? []);
      setEtapa('previa');
    } catch (err) {
      console.error('Erro ao ler planilha:', err);
      toast({ title: 'Não foi possível ler o arquivo', description: 'Envie uma planilha .xlsx, .xls ou .csv.', variant: 'destructive' });
    } finally {
      setCarregando(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const importar = async () => {
    setCarregando(true);
    try {
      const resposta = await importarLoteUsuarios(linhasBrutas, enviarEmail);
      if ('error' in resposta && resposta.error) {
        toast({ title: 'Erro na importação', description: resposta.error, variant: 'destructive' });
        return;
      }
      const lista = resposta.resultados ?? [];
      setResultados(lista);
      setEtapa('resultado');
      const criados = lista.filter(r => r.status === 'criado').length;
      toast({ title: 'Importação concluída', description: `${criados} de ${lista.length} usuário(s) criado(s).` });
      if (criados > 0) onImported?.();
    } catch (err) {
      console.error('Erro ao importar lote:', err);
      toast({ title: 'Erro na importação', description: 'A conexão caiu durante o envio. Confira a lista antes de reenviar.', variant: 'destructive' });
    } finally {
      setCarregando(false);
    }
  };

  const baixarResultado = async () => {
    const XLSX = await import('xlsx');
    const planilha = XLSX.utils.json_to_sheet(resultados.map(r => ({
      Linha: r.linha,
      Nome: r.nome,
      Email: r.email,
      Situação: r.status === 'criado' ? 'Criado' : r.status === 'erro' ? 'Erro' : 'Não importado',
      'Senha gerada': r.senhaGerada ?? '',
      'E-mail de boas-vindas': r.status !== 'criado' ? '' : r.emailEnviado ? 'Enviado' : 'Não enviado',
      Observação: r.mensagem ?? '',
    })));
    const pasta = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(pasta, planilha, 'Resultado');
    XLSX.writeFile(pasta, 'resultado-cadastro-usuarios.xlsx');
  };

  const criados = resultados.filter(r => r.status === 'criado');
  const senhasSemEmail = criados.filter(r => r.senhaGerada && !r.emailEnviado).length;

  return (
    <Dialog open={isOpen} onOpenChange={fechar}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Cadastro de Usuários em Lote</DialogTitle>
          <DialogDescription>
            {etapa === 'upload' && 'Envie uma planilha com um usuário por linha. Nada é gravado antes da sua confirmação.'}
            {etapa === 'previa' && <>Prévia de <span className="font-medium text-foreground">{nomeArquivo}</span>. Confira antes de importar.</>}
            {etapa === 'resultado' && 'Resultado da importação.'}
          </DialogDescription>
        </DialogHeader>

        {etapa === 'upload' && (
          <div className="space-y-4">
            <div className="rounded-md border p-4">
              <p className="mb-2 text-sm font-medium">1. Baixe o modelo</p>
              <p className="mb-3 text-sm text-muted-foreground">
                Colunas: {Object.values(COLUNAS_LOTE).join(', ')}. Só o e-mail é obrigatório; a aba “Instruções” explica cada campo e lista as regionais.
              </p>
              <Button variant="outline" onClick={baixarModelo}>
                <Download className="mr-2 h-4 w-4" />
                Baixar modelo (.xlsx)
              </Button>
            </div>
            <div className="rounded-md border border-dashed p-6 text-center">
              <FileSpreadsheet className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
              <p className="mb-1 text-sm font-medium">2. Envie a planilha preenchida</p>
              <p className="mb-3 text-xs text-muted-foreground">.xlsx, .xls ou .csv — até {LIMITE_LINHAS_LOTE} usuários por envio.</p>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) lerArquivo(f); }}
              />
              <Button onClick={() => inputRef.current?.click()} disabled={carregando}>
                {carregando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                {carregando ? 'Validando...' : 'Selecionar arquivo'}
              </Button>
            </div>
          </div>
        )}

        {etapa === 'previa' && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400">
                {validas.length} pronto(s) para importar
              </Badge>
              {comErro > 0 && <Badge variant="destructive">{comErro} com erro (serão ignorados)</Badge>}
            </div>
            <div className="min-h-0 flex-1 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px]">Linha</TableHead>
                    <TableHead>Nome / Email</TableHead>
                    <TableHead>Função</TableHead>
                    <TableHead>Regional</TableHead>
                    <TableHead>Escola</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previa.map(l => (
                    <TableRow key={l.linha} className={l.erros.length ? 'bg-destructive/5' : ''}>
                      <TableCell className="text-xs text-muted-foreground">{l.linha}</TableCell>
                      <TableCell>
                        <div className="font-medium">{l.nome || '-'}</div>
                        <div className="text-xs text-muted-foreground">{l.email || '(sem email)'}</div>
                      </TableCell>
                      <TableCell className="text-xs">{l.role === 'admin' ? 'Administrador' : 'Usuário'}</TableCell>
                      <TableCell className="text-xs uppercase">{l.regional || '—'}</TableCell>
                      <TableCell className="max-w-[220px] truncate text-xs uppercase" title={l.escolaNome ?? ''}>{l.escolaNome || '—'}</TableCell>
                      <TableCell className="max-w-[260px] text-xs">
                        {l.erros.length > 0 ? (
                          <span className="flex gap-1 text-destructive"><XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{l.erros.join(' ')}</span>
                        ) : l.avisos.length > 0 ? (
                          <span className="flex gap-1 text-amber-600 dark:text-amber-400"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{l.avisos.join(' ')}</span>
                        ) : (
                          <span className="flex gap-1 text-green-600 dark:text-green-400"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />OK{!l.senha && ' — senha será gerada'}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="lote-enviar-email" checked={enviarEmail} onCheckedChange={(v) => setEnviarEmail(v === true)} />
              <Label htmlFor="lote-enviar-email" className="text-sm font-normal">Enviar e-mail de boas-vindas com login e senha para cada usuário criado</Label>
            </div>
          </>
        )}

        {etapa === 'resultado' && (
          <>
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400">
                {criados.length} criado(s)
              </Badge>
              {resultados.length - criados.length > 0 && (
                <Badge variant="destructive">{resultados.length - criados.length} não importado(s)</Badge>
              )}
            </div>
            {senhasSemEmail > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {senhasSemEmail} usuário(s) receberam senha gerada pelo sistema, mas o e-mail não foi enviado.
                  Baixe o resultado para repassar as senhas — elas não ficam guardadas em lugar nenhum depois que esta janela fechar.
                </AlertDescription>
              </Alert>
            )}
            <div className="min-h-0 flex-1 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px]">Linha</TableHead>
                    <TableHead>Nome / Email</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Observação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resultados.map(r => (
                    <TableRow key={r.linha}>
                      <TableCell className="text-xs text-muted-foreground">{r.linha}</TableCell>
                      <TableCell>
                        <div className="font-medium">{r.nome || '-'}</div>
                        <div className="text-xs text-muted-foreground">{r.email}</div>
                      </TableCell>
                      <TableCell>
                        {r.status === 'criado'
                          ? <Badge variant="outline" className="text-green-600">Criado</Badge>
                          : <Badge variant="destructive">{r.status === 'erro' ? 'Erro' : 'Não importado'}</Badge>}
                      </TableCell>
                      <TableCell className="text-xs">{r.status !== 'criado' ? '—' : r.emailEnviado ? 'Enviado' : 'Não enviado'}</TableCell>
                      <TableCell className="max-w-[320px] text-xs text-muted-foreground">{r.mensagem}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {etapa === 'previa' && (
            <>
              <Button variant="outline" onClick={reiniciar} disabled={carregando}>Trocar arquivo</Button>
              <Button onClick={importar} disabled={carregando || validas.length === 0}>
                {carregando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {carregando ? 'Importando...' : `Importar ${validas.length} usuário(s)`}
              </Button>
            </>
          )}
          {etapa === 'resultado' && (
            <>
              <Button variant="outline" onClick={baixarResultado}>
                <Download className="mr-2 h-4 w-4" />
                Baixar resultado
              </Button>
              <Button onClick={() => fechar(false)}>Concluir</Button>
            </>
          )}
          {etapa === 'upload' && <Button variant="outline" onClick={() => fechar(false)}>Cancelar</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
