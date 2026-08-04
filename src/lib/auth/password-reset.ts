import { createHash, randomBytes, randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { getPool } from '@/lib/db/pool';
import { SENHA_MINIMA } from './password-rules';

/**
 * Fluxo de "esqueci minha senha".
 *
 * Decisoes de seguranca aplicadas aqui:
 *
 * - O token vai em claro apenas no e-mail; no banco fica o SHA-256. Vazamento
 *   de dump nao permite redefinir senha de ninguem.
 * - Uso unico e com validade curta (VALIDADE_MINUTOS).
 * - Ao redefinir, TODOS os tokens pendentes do usuario sao invalidados - se
 *   alguem pediu varios links, o resto morre junto.
 * - A solicitacao nunca revela se o e-mail existe (evita enumerar usuarios).
 * - Limite de solicitacoes por usuario dentro de uma janela curta, para o
 *   endpoint nao virar ferramenta de flood na caixa de entrada de terceiros.
 */

export const VALIDADE_MINUTOS = 60;
const MAX_SOLICITACOES = 3;
const JANELA_MINUTOS = 15;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export type UsuarioDoToken = { userId: string; email: string; nome: string | null };

/**
 * Gera um token para o e-mail informado.
 *
 * Retorna `null` quando nao ha nada a fazer (e-mail inexistente, usuario
 * desativado ou limite de solicitacoes atingido). O chamador deve responder a
 * mesma mensagem generica nos dois casos.
 */
export async function gerarTokenDeRedefinicao(
  email: string
): Promise<{ token: string; usuario: UsuarioDoToken } | null> {
  const pool = getPool();

  const { rows } = await pool.query(
    `select u.id, u.email, p.name, p.active
       from auth.users u
       left join public.profiles p on p.id = u.id
      where lower(u.email) = lower($1)
      limit 1`,
    [email.trim()]
  );

  const usuario = rows[0];
  if (!usuario) return null;
  if (usuario.active === false) return null;

  const { rows: recentes } = await pool.query(
    `select count(*)::int as total
       from public.password_reset_tokens
      where user_id = $1
        and created_at > now() - make_interval(mins => $2::int)`,
    [usuario.id, JANELA_MINUTOS]
  );
  if ((recentes[0]?.total ?? 0) >= MAX_SOLICITACOES) return null;

  const token = randomBytes(32).toString('hex');
  const expiraEm = new Date(Date.now() + VALIDADE_MINUTOS * 60_000);

  await pool.query(
    `insert into public.password_reset_tokens (id, user_id, token_hash, expires_at)
     values ($1, $2, $3, $4)`,
    [randomUUID(), usuario.id, hashToken(token), expiraEm]
  );

  return {
    token,
    usuario: { userId: usuario.id, email: usuario.email, nome: usuario.name ?? null },
  };
}

export type ValidacaoToken =
  | { valido: true; usuario: UsuarioDoToken }
  | { valido: false; motivo: 'invalido' | 'expirado' | 'usado' };

/** Confere o token sem consumi-lo - usado para renderizar (ou nao) o formulario. */
export async function validarToken(token: string): Promise<ValidacaoToken> {
  const pool = getPool();

  const { rows } = await pool.query(
    `select t.used_at, t.expires_at, u.id as user_id, u.email, p.name
       from public.password_reset_tokens t
       join auth.users u on u.id = t.user_id
       left join public.profiles p on p.id = u.id
      where t.token_hash = $1
      limit 1`,
    [hashToken(token)]
  );

  const registro = rows[0];
  if (!registro) return { valido: false, motivo: 'invalido' };
  if (registro.used_at) return { valido: false, motivo: 'usado' };
  if (new Date(registro.expires_at) < new Date()) return { valido: false, motivo: 'expirado' };

  return {
    valido: true,
    usuario: { userId: registro.user_id, email: registro.email, nome: registro.name ?? null },
  };
}

/**
 * Consome o token e troca a senha, tudo numa transacao.
 *
 * A marcacao de uso e' condicional (`used_at is null` no WHERE) e acontece
 * antes da troca: dois cliques simultaneos no mesmo link nao redefinem a senha
 * duas vezes.
 */
export async function redefinirSenhaComToken(
  token: string,
  novaSenha: string
): Promise<{ success: true; email: string } | { error: string }> {
  if (novaSenha.length < SENHA_MINIMA) {
    return { error: `A senha deve ter no mínimo ${SENHA_MINIMA} caracteres.` };
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('begin');

    const { rows } = await client.query(
      `update public.password_reset_tokens
          set used_at = now()
        where token_hash = $1
          and used_at is null
          and expires_at > now()
        returning user_id`,
      [hashToken(token)]
    );

    const registro = rows[0];
    if (!registro) {
      await client.query('rollback');
      return { error: 'Este link é inválido, já foi utilizado ou expirou. Solicite um novo.' };
    }

    const hash = await bcrypt.hash(novaSenha, 10);
    const { rows: atualizados } = await client.query(
      `update auth.users
          set encrypted_password = $1, updated_at = now()
        where id = $2
        returning email`,
      [hash, registro.user_id]
    );

    // Invalida os demais links pendentes do mesmo usuario.
    await client.query(
      `update public.password_reset_tokens
          set used_at = now()
        where user_id = $1 and used_at is null`,
      [registro.user_id]
    );

    await client.query('commit');
    return { success: true, email: atualizados[0]?.email ?? '' };
  } catch (err) {
    await client.query('rollback');
    console.error('Erro ao redefinir senha:', err);
    return { error: 'Não foi possível redefinir a senha. Tente novamente.' };
  } finally {
    client.release();
  }
}
