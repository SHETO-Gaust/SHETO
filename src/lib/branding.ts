/**
 * Identidade visual compartilhada pelas telas e pelos PDFs gerados.
 *
 * Cada exportação escrevia o próprio rodapé — os PDFs saíam assinados como
 * "SHE — Sistema de Horário Escolar" ou "Sistema de Gestão de Horários", duas
 * marcas que não existem em tela nenhuma. Com o texto num só lugar, mudar o
 * rodapé do sistema muda o dos relatórios junto.
 */

/** Mesmo texto do rodapé de `(app)/layout.tsx`. */
export const RODAPE_SISTEMA =
  'Desenvolvido pela Secretaria da Educação do Tocantins - Todos os direitos reservados © 2026';

export const LINK_PRIVACIDADE = '/politica-de-privacidade';

/** Logo do sistema (SHE / Seduc Digital), em versão colorida para fundo branco. */
export const LOGO_SISTEMA = '/img/elements/02.png';

/** Brasão do Estado do Tocantins, o mesmo das telas públicas de autenticação. */
export const LOGO_BRASAO = '/img/brasao_pb.svg';
