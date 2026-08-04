/**
 * Regras de senha compartilhadas entre servidor e cliente.
 *
 * Fica separado de password-reset.ts de proposito: aquele modulo importa `pg`
 * e `bcryptjs`, que nao podem entrar no bundle do navegador. Aqui so ha
 * constantes, entao os formularios podem importar sem arrastar o driver do
 * banco junto.
 */

export const SENHA_MINIMA = 8;
