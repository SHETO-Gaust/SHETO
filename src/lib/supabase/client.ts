/**
 * O Postgres local (via node-postgres) so pode ser acessado no servidor.
 * Este cliente de navegador nao tem mais equivalente - qualquer Client
 * Component que precise de dados deve chamar uma Server Action em vez
 * de falar com o banco diretamente.
 */
export function createClient(): never {
  throw new Error(
    'createClient() do browser foi removido nesta migracao. ' +
    'Use uma Server Action (veja src/app/**/actions.ts) em vez de acessar o banco no cliente.'
  );
}
