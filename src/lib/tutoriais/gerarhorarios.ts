import type { Tutorial } from './types';

export const tutorialGerarHorarios: Tutorial = {
  id: 'gerarhorarios',
  titulo: 'Como gerar o Horário',
  passos: [
    {
      titulo: 'Passo 7 do sistema: Gerar Horário',
      texto: 'Com tudo cadastrado, o sistema monta o quadro sozinho. Você só confere o resultado.',
    },
    {
      alvo: 'gerar-passo-turno',
      titulo: 'Escolha o turno',
      texto: 'Gere um turno de cada vez, ou escolha "Todos os Turnos" para fazer tudo de uma vez.',
      lado: 'bottom',
    },
    {
      alvo: 'gerar-btn-gerar',
      titulo: 'Mande gerar',
      texto: 'Pode demorar de alguns segundos a alguns minutos. Não feche a página.',
      lado: 'top',
    },
    {
      alvo: 'gerar-btn-gerar',
      titulo: 'Se sobrar aula sem encaixe',
      texto: 'O sistema explica o motivo. Quase sempre é professor com restrição demais para a carga que tem.',
      lado: 'top',
    },
    {
      alvo: 'gerar-historico',
      titulo: 'Gere quantas vezes quiser',
      texto: 'Cada geração vira um rascunho novo aqui. O horário publicado não muda até você mandar.',
      lado: 'top',
    },
    {
      alvo: 'gerar-historico',
      titulo: 'Publicar torna oficial',
      texto: 'Enquanto está como Rascunho, ninguém mais vê. Publique só quando estiver satisfeito.',
      lado: 'top',
    },
    {
      titulo: 'Gerou!',
      texto: 'Use Visualizar Horário para conferir e Refino de Horário para ajustar no detalhe.',
    },
  ],
};
