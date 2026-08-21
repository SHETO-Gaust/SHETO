import type { Tutorial } from './types';

/**
 * Tutorial de boas-vindas. Como o Painel nao tem elementos proprios para
 * destacar, os passos apontam para o menu lateral, que existe em toda a area
 * logada — e e justamente a ordem do menu que a pessoa precisa aprender.
 */
export const tutorialDashboard: Tutorial = {
  id: 'dashboard',
  titulo: 'Bem-vindo ao SHE',
  passos: [
    {
      titulo: 'Bem-vindo ao SHE!',
      texto: 'Em 7 etapas você sai do zero até o horário da escola pronto. Vou mostrar a ordem.',
    },
    {
      alvo: 'seletor-escola',
      titulo: 'Confira a escola',
      texto: 'Tudo que você cadastrar vale para a escola que estiver aqui em cima.',
      lado: 'bottom',
    },
    {
      alvo: 'nav-turno',
      titulo: 'Comece pelos Turnos',
      texto: 'Os números ao lado de cada item do menu são a ordem certa. Não pule etapas.',
      lado: 'right',
    },
    {
      alvo: 'nav-professores',
      titulo: 'Professores é a etapa mais pesada',
      texto: 'É onde você informa as restrições de horário. A qualidade do resultado depende disso.',
      lado: 'right',
    },
    {
      alvo: 'nav-gerarhorarios',
      titulo: 'Só então gere o horário',
      texto: 'Com as etapas 1 a 6 prontas, o sistema monta o quadro sozinho.',
      lado: 'right',
    },
    {
      titulo: 'Uma dica final',
      texto: 'Toda tela tem o botão de interrogação lá em cima. Clique nele sempre que ficar em dúvida.',
    },
  ],
};
