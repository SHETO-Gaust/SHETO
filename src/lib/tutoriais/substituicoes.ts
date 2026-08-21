import type { Tutorial } from './types';

export const tutorialSubstituicoes: Tutorial = {
  id: 'substituicoes',
  titulo: 'Como cobrir uma falta',
  passos: [
    {
      titulo: 'Passo 11 do sistema: Substituições',
      texto: 'Faltou um professor hoje? Aqui você descobre na hora quem pode cobrir.',
    },
    {
      alvo: 'substituicoes-form',
      titulo: 'Informe a ausência',
      texto: 'Escolha o turno, o dia da semana e o professor que faltou.',
      lado: 'bottom',
    },
    {
      alvo: 'substituicoes-btn-buscar',
      titulo: 'Busque quem está livre',
      texto: 'O sistema lista os professores da unidade que estão sem aula naquele mesmo horário.',
      avancar: 'ambos',
      lado: 'top',
    },
    {
      titulo: 'É só isso!',
      texto: 'Esta tela é só uma consulta do dia: ela não altera o horário publicado.',
    },
  ],
};
