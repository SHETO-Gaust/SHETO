import type { Tutorial } from './types';

/**
 * Mesma ordem do tutorial de Turnos: primeiro o que esta na pagina, e so no fim
 * abrimos o cadastro, para o sheet nao cobrir os alvos anteriores.
 */
export const tutorialSerie: Tutorial = {
  id: 'serie',
  titulo: 'Como cadastrar as Séries',
  passos: [
    {
      titulo: 'Passo 5 do sistema: Série',
      texto: 'A série é a receita da turma: diz quantas aulas de cada disciplina ela tem por semana.',
    },
    {
      alvo: 'serie-lista',
      titulo: 'Depois de criar, defina a carga',
      texto: 'Abra a série na lista e informe quantas aulas por semana cada disciplina terá.',
      lado: 'top',
    },
    {
      alvo: 'serie-lista',
      titulo: 'A conta precisa fechar',
      texto: 'Turno de 5 aulas por dia dá 25 aulas na semana. A soma das disciplinas tem que bater com isso.',
      lado: 'top',
    },
    {
      alvo: 'serie-lista',
      titulo: 'Travar aula é em Turmas',
      texto: 'Para prender uma disciplina num dia e horário fixos, use o cadeado na tela de Turmas.',
      lado: 'top',
    },
    {
      alvo: 'serie-btn-adicionar',
      titulo: 'Vamos criar uma série',
      texto: 'Clique em "Adicionar Série" para abrir o cadastro. Eu continuo com você lá dentro.',
      avancar: 'acao',
      lado: 'bottom',
    },
    {
      alvo: 'serie-sheet-nome',
      titulo: 'Dê um nome à série',
      texto: 'Use o nome do ano letivo, como "6º Ano" ou "1ª Série do Ensino Médio".',
      lado: 'bottom',
    },
    {
      alvo: 'serie-sheet-nivel',
      titulo: 'Escolha o nível de ensino',
      texto: 'São as etapas que você cadastrou no Passo 2.',
      lado: 'bottom',
    },
    {
      alvo: 'serie-sheet-turno',
      titulo: 'E o turno da série',
      texto: 'São os turnos que você cadastrou no Passo 1. É ele que define os horários disponíveis.',
      lado: 'bottom',
    },
    {
      alvo: 'serie-sheet-rodape',
      titulo: 'Salvar ou cancelar',
      texto: 'Só existem duas saídas: "Salvar" grava a série; "Cancelar" fecha e não grava nada.',
      lado: 'top',
    },
    {
      titulo: 'Pronto!',
      texto: 'Siga para o Passo 6, Turmas, no menu à esquerda.',
    },
  ],
};
