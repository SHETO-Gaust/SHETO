import type { Tutorial } from './types';

/**
 * Mesma ordem do tutorial de Turnos: primeiro o que esta na pagina, e so no fim
 * abrimos o cadastro, para o dialog nao cobrir os alvos anteriores.
 *
 * O travamento de aula mora aqui, e nao em Serie: ele passou a ser por turma
 * (ver o aviso em `serie/carga-horaria-sheet.tsx`).
 *
 * Todo passo que abre um cadastro termina apontando o rodape, com o nome exato
 * dos dois botoes: quem nao sabe sair de uma tela trava ali.
 */
export const tutorialTurmas: Tutorial = {
  id: 'turmas',
  titulo: 'Como cadastrar as Turmas',
  passos: [
    {
      titulo: 'Passo 6 do sistema: Turmas',
      texto: 'A série é a receita. A turma é a sala de verdade: o 6º Ano A, com professor em cada disciplina.',
    },
    {
      alvo: 'turmas-lista',
      titulo: 'Depois de criar, coloque os professores',
      texto: 'Abra a turma na lista e escolha quem dá cada disciplina. As disciplinas vieram da série.',
      lado: 'top',
    },
    {
      alvo: 'turmas-lista',
      titulo: 'Nenhuma pode ficar vazia',
      texto: 'Disciplina sem professor faz o horário daquela turma sair incompleto.',
      lado: 'top',
    },
    {
      alvo: 'turmas-btn-travar',
      titulo: 'O cadeado trava a aula',
      texto: 'Use quando a aula tem hora marcada mesmo, como o uso da quadra. Clique para ver como funciona.',
      avancar: 'acao',
      opcional: true,
      lado: 'top',
    },
    {
      alvo: 'turmas-dialog-travar',
      titulo: 'Escolha a disciplina e o horário',
      texto: 'Clique na disciplina à esquerda e depois nos horários em que ela deve ficar presa.',
      opcional: true,
      lado: 'left',
    },
    {
      alvo: 'turmas-travar-rodape',
      titulo: 'Salvar ou cancelar',
      texto: 'Só existem duas saídas: "Salvar" grava as travas; "Cancelar" fecha e não grava nada.',
      avancar: 'acao',
      opcional: true,
      lado: 'top',
    },
    {
      titulo: 'Trave o mínimo possível',
      texto: 'Cada aula travada tira uma opção do sistema. Muitas travas e ele não acha solução sem conflito.',
    },
    {
      alvo: 'turmas-btn-carga',
      titulo: 'Confira a carga de cada um',
      texto: 'Este botão mostra quantas aulas cada professor ficou com. Vale conferir antes de gerar.',
      lado: 'bottom',
    },
    {
      alvo: 'turmas-btn-adicionar',
      titulo: 'Vamos criar uma turma',
      texto: 'Clique em "Adicionar Turma" para abrir o cadastro. Eu continuo com você lá dentro.',
      avancar: 'acao',
      lado: 'bottom',
    },
    {
      alvo: 'turmas-dialog-serie',
      titulo: 'Escolha o modelo de série',
      texto: 'É a série que você cadastrou no Passo 5. A turma herda as disciplinas dela.',
      lado: 'bottom',
    },
    {
      alvo: 'turmas-dialog-nome',
      titulo: 'Agora a letra da turma',
      texto: 'Digite só a identificação, como A ou B. Junto com a série vira "6º Ano A".',
      lado: 'bottom',
    },
    {
      alvo: 'turmas-dialog-rodape',
      titulo: 'Salvar ou cancelar',
      texto: 'Só existem duas saídas: "Criar Turma" grava a turma; "Cancelar" fecha e não grava nada.',
      lado: 'top',
    },
    {
      titulo: 'Pronto!',
      texto: 'Depois de criar, abra a turma na lista para vincular um professor a cada disciplina.',
    },
  ],
};
