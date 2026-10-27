/**
 * Regra unica de acesso aos modulos, usada pelo layout, pelo menu e pelas
 * guardas das Server Actions.
 *
 * - Administrador: acessa tudo.
 * - Usuario: acessa tudo, menos a Gestao (usuarios, auditoria, unidades e
 *   chamados).
 *
 * E uma lista do que o usuario PODE acessar, nao do que ele nao pode: um modulo
 * novo esquecido aqui fica restrito ao admin (falha fechada) em vez de abrir
 * para todo mundo.
 */
const MODULOS_DO_USUARIO: readonly string[] = [
  'dashboard',
  'turno',
  'ensino',
  'disciplinas',
  'componentes',
  'professores',
  'serie',
  'turmas',
  'horarios',
];

export function podeAcessarModulo(role: string | null | undefined, modulo: string): boolean {
  if (role === 'admin') return true;
  return MODULOS_DO_USUARIO.includes(modulo);
}
