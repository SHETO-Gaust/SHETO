'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdmin, requireAuth } from '@/lib/auth/guards';
import { sendChamadoEmail, sendRespostaChamadoEmail } from '@/lib/mail';
import { iaConfigurada, perguntarAoGemini, type MensagemChat, type TipoAtendimento } from '@/lib/suporte/gemini';
import { LIMITE_TENTATIVAS, PROMPT_SISTEMA, nomeDaTela } from '@/lib/suporte/conhecimento';
import {
  gravarResposta,
  inserirChamado,
  listarRespostasPendentes,
  marcarVista,
  nomeDaEscola,
  type RespostaPendente,
} from '@/lib/suporte/chamados-db';

const MAX_TEXTO = 2000;
const MAX_ANEXOS = 3;
const MAX_BYTES_ANEXO = 3 * 1024 * 1024;

/**
 * Limite por usuario, em memoria do processo. Nao e seguranca forte - e o
 * freio para um clique repetido ou um script nao queimar a cota gratuita do
 * Gemini nem lotar a caixa do suporte.
 */
const janelas = new Map<string, number[]>();
function dentroDoLimite(chave: string, maximo: number, janelaMs: number): boolean {
  const agora = Date.now();
  const recentes = (janelas.get(chave) ?? []).filter(t => agora - t < janelaMs);
  if (recentes.length >= maximo) {
    janelas.set(chave, recentes);
    return false;
  }
  recentes.push(agora);
  janelas.set(chave, recentes);
  return true;
}

const mensagemSchema = z.object({
  papel: z.enum(['usuario', 'ia']),
  texto: z.string().trim().min(1).max(MAX_TEXTO * 2),
});

// ─── Chat com a IA ───────────────────────────────────────────────────────────

const conversaSchema = z.object({
  conversa: z.array(mensagemSchema).min(1).max(40),
  rota: z.string().max(200).nullable(),
});

export type ResultadoConversa =
  | {
      ok: true;
      resposta: string;
      tipo: TipoAtendimento;
      tentativa: number;
      /** Mostrar o botao "Abrir chamado" depois desta resposta. */
      oferecerChamado: boolean;
      resumo: string;
    }
  | { ok: false; motivo: 'indisponivel' | 'limite' | 'invalido'; mensagem: string };

export async function conversarComSuporte(entrada: z.infer<typeof conversaSchema>): Promise<ResultadoConversa> {
  const perfil = await requireAuth();

  const validado = conversaSchema.safeParse(entrada);
  if (!validado.success) {
    return { ok: false, motivo: 'invalido', mensagem: 'Mensagem inválida.' };
  }
  const { conversa, rota } = validado.data;
  const ultima = conversa[conversa.length - 1];
  if (ultima.papel !== 'usuario' || ultima.texto.length > MAX_TEXTO) {
    return { ok: false, motivo: 'invalido', mensagem: `Escreva até ${MAX_TEXTO} caracteres.` };
  }

  if (!iaConfigurada()) {
    return {
      ok: false,
      motivo: 'indisponivel',
      mensagem: 'O assistente automático não está disponível agora. Você pode abrir um chamado direto para a equipe do SHE.',
    };
  }

  if (!dentroDoLimite(`chat:${perfil.id}`, 20, 10 * 60_000)) {
    return {
      ok: false,
      motivo: 'limite',
      mensagem: 'Muitas mensagens em pouco tempo. Aguarde alguns minutos ou abra um chamado para a equipe do SHE.',
    };
  }

  // A tentativa e contada pelas respostas que a IA ja deu nesta conversa.
  const tentativa = conversa.filter(m => m.papel === 'ia').length + 1;

  // Contexto vai so na ultima mensagem, que e a unica que o modelo ainda nao
  // viu. Nome e e-mail ficam de fora: o Gemini nao precisa saber quem e.
  const contexto = [
    `Tela em que a pessoa está: ${nomeDaTela(rota)}`,
    `Perfil: ${perfil.role === 'admin' ? 'administrador do SHE' : 'usuário de escola'}`,
    `Tentativa atual: ${Math.min(tentativa, LIMITE_TENTATIVAS)} de ${LIMITE_TENTATIVAS}`,
  ].join('\n');
  const paraIA: MensagemChat[] = [
    ...conversa.slice(0, -1),
    { papel: 'usuario', texto: `[${contexto}]\n\n${ultima.texto}` },
  ];

  try {
    const r = await perguntarAoGemini(PROMPT_SISTEMA, paraIA);
    const encerrado = r.tipo === 'resolvido' || r.tipo === 'fora_de_escopo';
    return {
      ok: true,
      resposta: r.resposta,
      tipo: r.tipo,
      tentativa,
      oferecerChamado: !encerrado && (r.sugerir_chamado || r.tipo === 'erro' || tentativa >= LIMITE_TENTATIVAS),
      resumo: r.resumo,
    };
  } catch {
    return {
      ok: false,
      motivo: 'indisponivel',
      mensagem: 'O assistente automático não conseguiu responder agora. Você pode abrir um chamado direto para a equipe do SHE.',
    };
  }
}

// ─── Abertura do chamado ─────────────────────────────────────────────────────

const chamadoSchema = z.object({
  tipo: z.enum(['duvida', 'erro']),
  prioridade: z.enum(['alta', 'media', 'baixa']),
  mensagem: z.string().trim().min(10, 'Descreva o problema com pelo menos 10 caracteres.').max(MAX_TEXTO * 2),
  conversa: z.array(mensagemSchema).max(40),
  rota: z.string().max(200).nullable(),
  anexos: z
    .array(z.object({ nome: z.string().max(120), dataUrl: z.string() }))
    .max(MAX_ANEXOS, `No máximo ${MAX_ANEXOS} fotos.`),
});

/** Tipo pela assinatura do arquivo, nao pelo que o navegador declarou. */
function tipoDaImagem(dados: Buffer): string | null {
  if (dados.length >= 3 && dados[0] === 0xff && dados[1] === 0xd8 && dados[2] === 0xff) return 'image/jpeg';
  if (dados.length >= 8 && dados.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (dados.length >= 12 && dados.toString('ascii', 0, 4) === 'RIFF' && dados.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

const EXTENSAO: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export async function abrirChamado(
  entrada: z.infer<typeof chamadoSchema>
): Promise<{ ok: true; protocolo: number; emailEnviado: boolean } | { ok: false; error: string }> {
  const perfil = await requireAuth();

  const validado = chamadoSchema.safeParse(entrada);
  if (!validado.success) {
    return { ok: false, error: validado.error.errors[0]?.message ?? 'Dados inválidos.' };
  }
  const dados = validado.data;

  if (!dentroDoLimite(`chamado:${perfil.id}`, 5, 60 * 60_000)) {
    return { ok: false, error: 'Você abriu muitos chamados na última hora. Aguarde a resposta da equipe.' };
  }

  const anexos: { nome: string; mime: string; dados: Buffer }[] = [];
  for (const [i, anexo] of dados.anexos.entries()) {
    const base64 = anexo.dataUrl.replace(/^data:[^;]+;base64,/, '');
    const bytes = Buffer.from(base64, 'base64');
    if (bytes.length === 0 || bytes.length > MAX_BYTES_ANEXO) {
      return { ok: false, error: `A foto ${i + 1} passa do limite de 3 MB.` };
    }
    const mime = tipoDaImagem(bytes);
    if (!mime) {
      return { ok: false, error: `A foto ${i + 1} não é uma imagem JPG, PNG ou WEBP.` };
    }
    const base = anexo.nome.replace(/\.[^.]*$/, '').replace(/[^\w\-]+/g, '_').slice(0, 60) || `foto-${i + 1}`;
    anexos.push({ nome: `${base}.${EXTENSAO[mime]}`, mime, dados: bytes });
  }

  const escolaId = perfil.ue ? String(perfil.ue) : null;
  const escolaNome = escolaId ? await nomeDaEscola(escolaId) : null;

  const { id, protocolo } = await inserirChamado({
    userId: perfil.id,
    userNome: perfil.name ?? null,
    userEmail: perfil.email,
    escolaId,
    escolaNome,
    tipo: dados.tipo,
    prioridade: dados.prioridade,
    mensagem: dados.mensagem,
    conversa: dados.conversa,
    rota: dados.rota,
    anexos,
  });

  // O chamado ja esta gravado: se o e-mail falhar, ele continua na lista de
  // /chamados. Por isso a falha so vira aviso, nao erro.
  const envio = await sendChamadoEmail({
    id,
    protocolo,
    tipo: dados.tipo,
    prioridade: dados.prioridade,
    mensagem: dados.mensagem,
    userNome: perfil.name ?? null,
    userEmail: perfil.email,
    escolaNome,
    tela: nomeDaTela(dados.rota),
    conversa: dados.conversa,
    anexos,
  });

  revalidatePath('/chamados');
  return { ok: true, protocolo, emailEnviado: !('error' in envio) };
}

// ─── Resposta do admin ───────────────────────────────────────────────────────

const respostaSchema = z.object({
  id: z.string().uuid(),
  resposta: z.string().trim().min(5, 'Escreva a resposta para o usuário.').max(MAX_TEXTO * 2),
  correcao: z.string().trim().max(MAX_TEXTO * 2).optional(),
});

export async function responderChamado(
  entrada: z.infer<typeof respostaSchema>
): Promise<{ ok: true; emailEnviado: boolean } | { ok: false; error: string }> {
  const admin = await requireAdmin();

  const validado = respostaSchema.safeParse(entrada);
  if (!validado.success) {
    return { ok: false, error: validado.error.errors[0]?.message ?? 'Dados inválidos.' };
  }
  const { id, resposta } = validado.data;
  const correcao = validado.data.correcao || null;

  const chamado = await gravarResposta({ id, resposta, correcao, adminId: admin.id, adminNome: admin.name ?? null });
  if (!chamado) {
    return { ok: false, error: 'Chamado não encontrado.' };
  }

  const envio = await sendRespostaChamadoEmail({
    to: chamado.user_email,
    nome: chamado.user_nome,
    protocolo: chamado.protocolo,
    mensagem: chamado.mensagem,
    resposta,
    correcao,
  });

  revalidatePath('/chamados');
  revalidatePath(`/chamados/${id}`);
  return { ok: true, emailEnviado: !('error' in envio) };
}

// ─── Modal de resposta para quem abriu ───────────────────────────────────────

export async function buscarRespostasPendentes(): Promise<RespostaPendente[]> {
  const perfil = await requireAuth();
  return listarRespostasPendentes(perfil.id);
}

export async function marcarRespostaVista(id: string): Promise<void> {
  const perfil = await requireAuth();
  if (!z.string().uuid().safeParse(id).success) return;
  await marcarVista(id, perfil.id);
}
