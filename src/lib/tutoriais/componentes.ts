import type { Tutorial } from './types';

/**
 * Mesma ordem do tutorial de Turnos: primeiro o que esta na pagina, e so no fim
 * abrimos o cadastro, para o sheet nao cobrir os alvos anteriores.
 */
export const tutorialComponentes: Tutorial = {
  id: 'componentes',
  titulo: 'Como cadastrar os Componentes',
  passos: [
    {
      titulo: 'Passo 3 do sistema: Componentes',
      texto: 'Componentes são as disciplinas: Matemática, Português, História, Educação Física.',
    },
    {
      alvo: 'componentes-coluna-sigla',
      titulo: 'A sigla aparece no quadro',
      texto: 'Use siglas curtas e fáceis de reconhecer: MAT, POR, HIS, GEO, CIE, EDF.',
      lado: 'bottom',
    },
    {
      alvo: 'componentes-tabela',
      titulo: 'Cadastre todas antes de seguir',
      texto: 'Se esquecer uma disciplina, depois vai precisar corrigir as séries e as turmas na mão.',
      lado: 'top',
    },
    {
      alvo: 'componentes-btn-adicionar',
      titulo: 'Vamos cadastrar uma disciplina',
      texto: 'Clique em "Adicionar Componente" para abrir o cadastro. Eu continuo com você lá dentro.',
      avancar: 'acao',
      lado: 'bottom',
    },
    {
      alvo: 'componentes-sheet-nome',
      titulo: 'Nome completo da disciplina',
      texto: 'Escreva por extenso, como aparece na grade curricular. Exemplo: Matemática.',
      lado: 'bottom',
    },
    {
      alvo: 'componentes-sheet-sigla',
      titulo: 'Agora a sigla',
      texto: 'É ela que vai aparecer no quadro de horários, onde não cabe o nome inteiro.',
      lado: 'bottom',
    },
    {
      alvo: 'componentes-sheet-rodape',
      titulo: 'Salvar ou cancelar',
      texto: 'Só existem duas saídas: "Salvar" grava a disciplina; "Cancelar" fecha e não grava nada.',
      lado: 'top',
    },
    {
      titulo: 'Pronto!',
      texto: 'Siga para o Passo 4, Professores, no menu à esquerda.',
    },
  ],
};
