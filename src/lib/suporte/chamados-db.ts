import { randomUUID } from 'crypto';
import { getPool } from '@/lib/db/pool';
import type { MensagemChat } from './gemini';

/**
 * Acesso as tabelas de chamados.
 *
 * SQL direto no pool, e nao pelo shim PostgREST: os anexos sao `bytea`, a
 * abertura grava chamado e fotos numa transacao so, e o protocolo vem de um
 * `bigserial` que precisa voltar no RETURNING. Nada disso e terreno firme no
 * tradutor de src/lib/db.
 */

export type TipoChamado = 'duvida' | 'erro';
export type PrioridadeChamado = 'alta' | 'media' | 'baixa';
export type StatusChamado = 'aberto' | 'respondido';

export type Chamado = {
  id: string;
  protocolo: number;
  user_id: string;
  user_nome: string | null;
  user_email: string;
  escola_id: string | null;
  escola_nome: string | null;
  tipo: TipoChamado;
  prioridade: PrioridadeChamado;
  mensagem: string;
  conversa: MensagemChat[];
  rota: string | null;
  status: StatusChamado;
  resposta: string | null;
  correcao: string | null;
  respondido_por_nome: string | null;
  respondido_em: string | null;
  resposta_vista_em: string | null;
  created_at: string;
};

export type AnexoResumo = { id: string; nome: string; mime: string; tamanho: number };

/** Linha da lista do admin: sem conversa nem mensagem inteira. */
export type ChamadoResumo = Pick<
  Chamado,
  'id' | 'protocolo' | 'user_nome' | 'user_email' | 'escola_nome' | 'tipo' | 'prioridade' | 'status' | 'created_at' | 'respondido_em'
> & { mensagem_inicio: string; total_anexos: number };

/** O que aparece no modal de quem abriu o chamado. */
export type RespostaPendente = Pick<Chamado, 'id' | 'protocolo' | 'mensagem' | 'resposta' | 'correcao' | 'respondido_por_nome' | 'respondido_em'>;

const COLUNAS = `
  id, protocolo, user_id, user_nome, user_email, escola_id, escola_nome, tipo, prioridade,
  mensagem, conversa, rota, status, resposta, correcao, respondido_por_nome, respondido_em,
  resposta_vista_em, created_at
`;

/** bigserial chega como string no node-postgres; o protocolo e sempre pequeno. */
function normalizar<T extends { protocolo: number | string }>(linha: T): T {
  return { ...linha, protocolo: Number(linha.protocolo) };
}

export async function inserirChamado(dados: {
  userId: string;
  userNome: string | null;
  userEmail: string;
  escolaId: string | null;
  escolaNome: string | null;
  tipo: TipoChamado;
  prioridade: PrioridadeChamado;
  mensagem: string;
  conversa: MensagemChat[];
  rota: string | null;
  anexos: { nome: string; mime: string; dados: Buffer }[];
}): Promise<{ id: string; protocolo: number }> {
  const cliente = await getPool().connect();
  const id = randomUUID();
  try {
    await cliente.query('BEGIN');
    const { rows } = await cliente.query(
      `INSERT INTO public.chamados
         (id, user_id, user_nome, user_email, escola_id, escola_nome, tipo, prioridade, mensagem, conversa, rota)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
       RETURNING protocolo`,
      [
        id, dados.userId, dados.userNome, dados.userEmail, dados.escolaId, dados.escolaNome,
        dados.tipo, dados.prioridade, dados.mensagem, JSON.stringify(dados.conversa), dados.rota,
      ]
    );
    for (const anexo of dados.anexos) {
      await cliente.query(
        `INSERT INTO public.chamados_anexos (id, chamado_id, nome, mime, tamanho, dados)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [randomUUID(), id, anexo.nome, anexo.mime, anexo.dados.length, anexo.dados]
      );
    }
    await cliente.query('COMMIT');
    return { id, protocolo: Number(rows[0].protocolo) };
  } catch (erro) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw erro;
  } finally {
    cliente.release();
  }
}

export async function listarChamados(): Promise<ChamadoResumo[]> {
  const { rows } = await getPool().query(
    `SELECT c.id, c.protocolo, c.user_nome, c.user_email, c.escola_nome, c.tipo, c.prioridade,
            c.status, c.created_at, c.respondido_em,
            left(c.mensagem, 140) AS mensagem_inicio,
            (SELECT count(*)::int FROM public.chamados_anexos a WHERE a.chamado_id = c.id) AS total_anexos
       FROM public.chamados c
      ORDER BY (c.status = 'aberto') DESC,
               CASE c.prioridade WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END,
               c.created_at DESC
      LIMIT 500`
  );
  return rows.map(normalizar);
}

export async function buscarChamado(id: string): Promise<{ chamado: Chamado; anexos: AnexoResumo[] } | null> {
  const pool = getPool();
  const { rows } = await pool.query(`SELECT ${COLUNAS} FROM public.chamados WHERE id = $1`, [id]);
  if (!rows[0]) return null;
  const { rows: anexos } = await pool.query(
    `SELECT id, nome, mime, tamanho FROM public.chamados_anexos WHERE chamado_id = $1 ORDER BY created_at`,
    [id]
  );
  return { chamado: normalizar(rows[0]), anexos };
}

export async function buscarAnexo(id: string): Promise<{ chamado_user_id: string; nome: string; mime: string; dados: Buffer } | null> {
  const { rows } = await getPool().query(
    `SELECT c.user_id AS chamado_user_id, a.nome, a.mime, a.dados
       FROM public.chamados_anexos a
       JOIN public.chamados c ON c.id = a.chamado_id
      WHERE a.id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

/**
 * Grava a resposta. Zerar `resposta_vista_em` e o que faz o modal aparecer de
 * novo quando o admin corrige uma resposta ja dada.
 */
export async function gravarResposta(dados: {
  id: string;
  resposta: string;
  correcao: string | null;
  adminId: string;
  adminNome: string | null;
}): Promise<Chamado | null> {
  const { rows } = await getPool().query(
    `UPDATE public.chamados
        SET status = 'respondido', resposta = $2, correcao = $3,
            respondido_por = $4, respondido_por_nome = $5, respondido_em = now(),
            resposta_vista_em = NULL, updated_at = now()
      WHERE id = $1
      RETURNING ${COLUNAS}`,
    [dados.id, dados.resposta, dados.correcao, dados.adminId, dados.adminNome]
  );
  return rows[0] ? normalizar(rows[0]) : null;
}

export async function listarRespostasPendentes(userId: string): Promise<RespostaPendente[]> {
  const { rows } = await getPool().query(
    `SELECT id, protocolo, mensagem, resposta, correcao, respondido_por_nome, respondido_em
       FROM public.chamados
      WHERE user_id = $1 AND status = 'respondido' AND resposta_vista_em IS NULL
      ORDER BY respondido_em`,
    [userId]
  );
  return rows.map(normalizar);
}

export async function marcarVista(id: string, userId: string): Promise<void> {
  await getPool().query(
    `UPDATE public.chamados SET resposta_vista_em = now()
      WHERE id = $1 AND user_id = $2 AND status = 'respondido'`,
    [id, userId]
  );
}

export async function nomeDaEscola(escolaId: string): Promise<string | null> {
  const { rows } = await getPool().query(`SELECT escolar FROM public.escolas WHERE id = $1`, [escolaId]);
  return rows[0]?.escolar ?? null;
}
