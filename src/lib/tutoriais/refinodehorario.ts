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
      titulo: 'Escolha a grade a trabalhar',
      texto: 'Aparecem todas as grades da escola — publicadas e rascunhos. Só a que você escolher aqui pode ser alterada.',
      lado: 'bottom',
    },
    {
      alvo: 'refino-select-horario',
      titulo: 'E as grades de referência, na linha de cima',
      texto: 'Uma por turno. É contra elas que o sistema confere se o professor já está em sala — inclusive num turno de outro nome que começa na mesma hora, como Integral e Matutino.',
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
      alvo: 'refino-painel-impacto',
      titulo: 'Trocar duas aulas direto',
      texto: 'Com uma aula selecionada, clique sobre outra: o painel confere se as duas cabem no horário uma da outra e oferece a troca — sem precisar de slot vazio.',
      lado: 'left',
    },
    {
      titulo: 'Lembre-se',
      texto: 'Aula fixada na série não se move por aqui, e aula de grade de referência aparece com cadeado: ela é de outra grade.',
    },
  ],
};
