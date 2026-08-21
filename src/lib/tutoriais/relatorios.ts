import type { Tutorial } from './types';

export const tutorialRelatorios: Tutorial = {
  id: 'relatorios',
  titulo: 'Como usar os Relatórios',
  passos: [
    {
      titulo: 'Passo 9 do sistema: Relatórios',
      texto: 'Os relatórios mostram em números como ficou a distribuição das aulas.',
    },
    {
      alvo: 'relatorios-turno',
      titulo: 'Escolha o turno primeiro',
      texto: 'Todo relatório é calculado em cima do turno que você marcar aqui.',
      lado: 'right',
    },
    {
      alvo: 'relatorios-cards',
      titulo: 'Clique no relatório que quer ver',
      texto: 'Cada cartão gera uma análise diferente: carga dos professores, gargalos e conferência dos dados.',
      lado: 'bottom',
    },
    {
      alvo: 'relatorios-cards',
      titulo: 'Use antes de gerar',
      texto: 'A conferência de dados aponta o que falta cadastrar. Vale rodar antes de gerar o horário.',
      lado: 'bottom',
    },
    {
      titulo: 'É só isso!',
      texto: 'Os relatórios não alteram nada: são só para você enxergar melhor.',
    },
  ],
};
