import type { Tutorial } from './types';

export const tutorialRefinoDeHorario: Tutorial = {
  id: 'refinodehorario',
  titulo: 'Como ajustar o Horário',
  passos: [
    {
      titulo: 'Passo 10 do sistema: Refino',
      texto: 'O horário ficou bom mas você quer mexer em uma aula ou outra? É aqui.',
    },
    {
      alvo: 'refino-select-horario',
      titulo: 'Escolha o horário',
      texto: 'Só aparecem aqui os horários que já foram publicados.',
      lado: 'bottom',
    },
    {
      alvo: 'refino-select-professor',
      titulo: 'Escolha o professor',
      texto: 'A grade abaixo mostra a semana inteira desse professor, turno por turno.',
      lado: 'bottom',
    },
    {
      alvo: 'refino-painel-impacto',
      titulo: 'Clique na aula e veja o impacto',
      texto: 'Ao escolher uma aula, este painel avisa se mover ela cria choque de horário.',
      lado: 'left',
    },
    {
      alvo: 'refino-painel-impacto',
      titulo: 'O sistema sugere a troca',
      texto: 'Se o lugar já estiver ocupado, ele calcula uma sequência de trocas que resolve. Basta aceitar.',
      lado: 'left',
    },
    {
      titulo: 'Lembre-se',
      texto: 'O refino só permite mover a aula dentro do mesmo turno físico do professor.',
    },
  ],
};
