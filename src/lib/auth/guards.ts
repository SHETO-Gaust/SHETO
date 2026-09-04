import { createClient } from '@/lib/db/server';
import type { Profile } from '@/lib/types';

/**
 * Guardas de autorizacao para Server Actions.
 *
 * Contexto: com RLS no banco, ficava garantido (no minimo) que so usuario logado
 * tocasse nas tabelas. No Postgres local nao ha RLS equivalente, e Server
 * Actions sao endpoints HTTP - podem ser chamadas diretamente, sem passar
 * pela navegacao. Estas guardas recolocam essa barreira na aplicacao.
 *
 * Todas lancam excecao em caso de negativa (fail-closed): o Next.js
 * converte em erro generico no cliente, sem vazar detalhe interno.
 */

/** Modulos-grupo, espelhando a logica de permissao de src/app/(app)/layout.tsx */
const GRUPO_DADOS_HORARIO = ['turno', 'ensino', 'disciplinas', 'componentes', 'professores', 'serie', 'turmas'];
const GRUPO_USUARIOS = ['usuarios', 'auditoria', 'unidades'];

function grupoDoModulo(modulo: string): string {
  if (GRUPO_DADOS_HORARIO.includes(modulo)) return 'dados-horario';
  if (GRUPO_USUARIOS.includes(modulo)) return 'usuarios';
  return modulo;
}

/** Exige sessao valida e perfil ativo. Retorna o perfil do usuario. */
export async function requireAuth(): Promise<Profile> {
  const db = await createClient();

  const { data: { user } } = await db.auth.getUser();
  if (!user) {
    throw new Error('Nao autenticado.');
  }

  const { data: profile } = await db
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) {
    throw new Error('Perfil nao encontrado.');
  }
  if (profile.active === false) {
    throw new Error('Usuario desativado.');
  }

  return profile as Profile;
}

/** Exige que o usuario seja administrador. */
export async function requireAdmin(): Promise<Profile> {
  const profile = await requireAuth();
  if (profile.role !== 'admin') {
    throw new Error('Acesso restrito a administradores.');
  }
  return profile;
}

/**
 * Exige acesso a uma escola especifica.
 * Admin acessa qualquer escola; usuario comum, apenas a sua (profile.ue).
 */
export async function requireEscola(escolaId: string | number): Promise<Profile> {
  const profile = await requireAuth();
  if (profile.role === 'admin') return profile;

  if (String(profile.ue ?? '') !== String(escolaId)) {
    throw new Error('Acesso negado a esta unidade escolar.');
  }
  return profile;
}

/**
 * Exige que o usuario tenha o modulo liberado (mesma regra do layout).
 * Admin tem acesso total; 'dashboard' e liberado para todos.
 */
export async function requireModulo(modulo: string): Promise<Profile> {
  const profile = await requireAuth();
  if (profile.role === 'admin') return profile;
  if (modulo === 'dashboard') return profile;

  const modulos = Array.isArray(profile.modules) ? profile.modules : [];
  if (!modulos.includes(grupoDoModulo(modulo))) {
    throw new Error(`Acesso negado ao modulo "${modulo}".`);
  }
  return profile;
}

/** Combina checagem de modulo e de escola - o caso mais comum nas actions. */
export async function requireEscolaEModulo(escolaId: string | number, modulo: string): Promise<Profile> {
  const profile = await requireModulo(modulo);
  if (profile.role === 'admin') return profile;

  if (String(profile.ue ?? '') !== String(escolaId)) {
    throw new Error('Acesso negado a esta unidade escolar.');
  }
  return profile;
}

/** Tabelas que possuem escola_id direto e podem ser validadas por este caminho. */
type TabelaComEscola =
  | 'turnos'
  | 'horarios'
  | 'series'
  | 'turmas'
  | 'professores'
  | 'componentes_curriculares'
  | 'niveis_ensino';

/**
 * Valida acesso a um recurso identificado apenas pelo seu id, resolvendo a
 * escola dona do registro no banco.
 *
 * Sem isto, uma action como deleteTurno(id) aceitaria o id de um turno de
 * QUALQUER escola - o usuario poderia apagar dados de outra unidade so
 * chamando o endpoint com outro id.
 */
export async function requireEscolaDoRecurso(
  tabela: TabelaComEscola,
  id: string | number,
  modulo: string
): Promise<Profile> {
  const profile = await requireModulo(modulo);
  if (profile.role === 'admin') return profile;

  const db = await createClient();
  const { data: registro } = await db
    .from(tabela)
    .select('escola_id')
    .eq('id', id)
    .maybeSingle();

  if (!registro) {
    throw new Error('Registro nao encontrado.');
  }
  if (String(profile.ue ?? '') !== String(registro.escola_id)) {
    throw new Error('Acesso negado a esta unidade escolar.');
  }
  return profile;
}

/**
 * Versao para lote: valida que TODOS os ids pertencem a escola do usuario.
 * Usada em actions que recebem arrays (ex.: converter varios horarios de uma vez).
 */
export async function requireEscolaDosRecursos(
  tabela: TabelaComEscola,
  ids: (string | number)[],
  modulo: string
): Promise<Profile> {
  const profile = await requireModulo(modulo);
  if (profile.role === 'admin') return profile;
  if (!ids || ids.length === 0) return profile;

  const db = await createClient();
  const { data: registros } = await db
    .from(tabela)
    .select('id, escola_id')
    .in('id', ids);

  const encontrados = registros ?? [];
  if (encontrados.length !== new Set(ids.map(String)).size) {
    throw new Error('Um ou mais registros nao foram encontrados.');
  }
  const alheio = encontrados.find(
    (r: { escola_id: string | number }) => String(profile.ue ?? '') !== String(r.escola_id)
  );
  if (alheio) {
    throw new Error('Acesso negado a esta unidade escolar.');
  }
  return profile;
}

/**
 * Caso especial: solicitacao de restricao nao tem escola_id proprio - a escola
 * e alcancada em dois saltos (solicitacao -> professor -> escola).
 */
export async function requireEscolaDaSolicitacao(solicitacaoId: string, modulo: string): Promise<Profile> {
  const profile = await requireModulo(modulo);
  if (profile.role === 'admin') return profile;

  const db = await createClient();
  const { data: solicitacao } = await db
    .from('solicitacoes_restricoes')
    .select('professor:professores(escola_id)')
    .eq('id', solicitacaoId)
    .maybeSingle();

  const escolaId = (solicitacao as { professor?: { escola_id?: string | number } } | null)?.professor?.escola_id;
  if (escolaId === undefined || escolaId === null) {
    throw new Error('Solicitacao nao encontrada.');
  }
  if (String(profile.ue ?? '') !== String(escolaId)) {
    throw new Error('Acesso negado a esta unidade escolar.');
  }
  return profile;
}
