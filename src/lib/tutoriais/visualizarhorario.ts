import type { Tutorial } from './types';

export const tutorialVisualizarHorario: Tutorial = {
  id: 'visualizarhorario',
  titulo: 'Como consultar o Horário',
  passos: [
    {
      titulo: 'Passo 8 do sistema: Visualizar Horário',
      texto: 'Aqui você consulta a grade oficial da escola, já publicada.',
    },
    {
      alvo: 'visualizar-por-professor',
      titulo: 'Pela ótica do professor',
      texto: 'Mostra a agenda completa de um docente, somando todos os turnos em que ele dá aula.',
      lado: 'bottom',
    },
    {
      alvo: 'visualizar-por-turma',
      titulo: 'Pela ótica da turma',
      texto: 'Mostra o quadro de uma sala: o que cada turma tem em cada dia e horário.',
      lado: 'bottom',
    },
    {
      alvo: 'visualizar-portal',
      titulo: 'Dá para imprimir',
      texto: 'Depois de abrir a grade, exporte para Excel e imprima para fixar no mural da escola.',
      lado: 'top',
    },
    {
      titulo: 'É só isso!',
      texto: 'Se precisar mudar alguma aula de lugar, use o Refino de Horário.',
    },
  ],
};
