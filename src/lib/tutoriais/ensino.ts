import type { Tutorial } from './types';

/**
 * Mesma ordem do tutorial de Turnos: primeiro o que esta na pagina, e so no fim
 * abrimos o cadastro. Se o sheet abrisse antes, cobriria a tabela e o destaque
 * apontaria para elementos escondidos atras dele.
 */
export const tutorialEnsino: Tutorial = {
  id: 'ensino',
  titulo: 'Como cadastrar o Ensino',
  passos: [
    {
      titulo: 'Passo 2 do sistema: Ensino',
      texto: 'Aqui você informa quais modalidades de ensino a sua escola oferece.',
    },
    {
      alvo: 'ensino-tabela',
      titulo: 'Cadastre só o que existe na escola',
      texto: 'Não precisa cadastrar todas as etapas que existem no país, apenas as que você oferece.',
      lado: 'top',
    },
    {
      alvo: 'ensino-btn-adicionar',
      titulo: 'Vamos cadastrar uma etapa',
      texto: 'Clique em "Adicionar Etapa" para abrir o cadastro. Eu continuo com você lá dentro.',
      avancar: 'acao',
      lado: 'bottom',
    },
    {
      alvo: 'ensino-sheet-nome',
      titulo: 'Digite o nome da etapa',
      texto: 'Exemplos: Ensino Fundamental Anos Finais, Ensino Médio, EJA.',
      lado: 'bottom',
    },
    {
      alvo: 'ensino-sheet-rodape',
      titulo: 'Salvar ou cancelar',
      texto: 'Só existem duas saídas: "Salvar" grava a etapa; "Cancelar" fecha e não grava nada.',
      lado: 'top',
    },
    {
      titulo: 'Pronto!',
      texto: 'Siga para o Passo 3, Componentes, no menu à esquerda.',
    },
  ],
};
