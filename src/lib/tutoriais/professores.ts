import type { Tutorial } from './types';

/**
 * O roteiro acompanha o que a pessoa realmente faz aqui: cadastra o professor,
 * salva, e so entao abre o calendario de restricoes para pintar a grade.
 *
 * Os passos dentro do calendario sao `opcional` porque o botao de restricoes so
 * existe se ja houver professor na lista — numa escola comecando do zero eles
 * sao pulados sozinhos, em vez de apontarem para o vazio.
 *
 * Deixamos de fora de proposito dois controles que confundem mais do que
 * ajudam neste primeiro contato: "Dias Preferidos para Concentracao de Aulas" e
 * "Sem Preferencia de Folga".
 */
export const tutorialProfessores: Tutorial = {
  id: 'professores',
  titulo: 'Como cadastrar os Professores',
  passos: [
    {
      titulo: 'Passo 4 do sistema: Professores',
      texto:
        'Esta é a etapa mais importante. É daqui que o sistema tira o que cada professor pode e o que não pode fazer.',
    },
    {
      alvo: 'professores-btn-adicionar',
      titulo: 'Vamos cadastrar um professor',
      texto: 'Clique em "Adicionar Professor" para abrir o cadastro. Eu continuo com você lá dentro.',
      avancar: 'acao',
      lado: 'bottom',
    },
    {
      alvo: 'professores-sheet-dados',
      titulo: 'Preencha os dados do professor',
      texto:
        'Aqui vão os dados pessoais, a carga de aulas, os turnos em que ele atua e as disciplinas que pode dar.',
      lado: 'left',
    },
    {
      alvo: 'professores-sheet-rodape',
      titulo: 'Salvar ou cancelar',
      texto: 'Só existem duas saídas: "Salvar Informações" grava o professor; "Cancelar" fecha e não grava nada.',
      avancar: 'acao',
      lado: 'top',
    },
    {
      titulo: 'Agora as restrições de horário',
      texto:
        'Se o cadastro ainda estiver aberto, feche-o. Vou mostrar onde se marca quando o professor pode dar aula.',
    },
    {
      alvo: 'professores-btn-restricoes',
      titulo: 'O calendário de restrições',
      texto: 'Na linha do professor, clique no ícone de calendário para abrir a grade dele.',
      avancar: 'acao',
      opcional: true,
      lado: 'left',
    },
    {
      alvo: 'restricoes-paleta',
      titulo: 'Estas são as etiquetas',
      texto: 'Elas funcionam como canetas: você escolhe uma aqui em cima e depois pinta a grade.',
      opcional: true,
      lado: 'bottom',
    },
    {
      alvo: 'restricoes-etiqueta-indisponivel',
      titulo: 'Indisponível (vermelho)',
      texto: 'O professor não pode dar aula nesse horário de jeito nenhum. O sistema nunca vai usá-lo.',
      opcional: true,
      lado: 'bottom',
    },
    {
      alvo: 'restricoes-etiqueta-planejamento',
      titulo: 'Planejamento (azul)',
      texto: 'É só uma preferência. Se for a única saída para fechar o horário, o sistema pode usar assim mesmo.',
      opcional: true,
      lado: 'bottom',
    },
    {
      alvo: 'restricoes-etiqueta-livre_docencia',
      titulo: 'Livre Docência (âmbar)',
      texto: 'Folga garantida por direito. Assim como o vermelho, o sistema nunca coloca aula ali.',
      opcional: true,
      lado: 'bottom',
    },
    {
      alvo: 'restricoes-etiqueta-limpar',
      titulo: 'Limpar',
      texto: 'Escolha esta e clique numa célula pintada para apagar a marcação.',
      opcional: true,
      lado: 'bottom',
    },
    {
      alvo: 'restricoes-grade',
      titulo: 'Escolha a etiqueta e clique na grade',
      texto:
        'Primeiro a etiqueta lá em cima, depois o cruzamento do dia com a aula. Clicar de novo remove a marca.',
      opcional: true,
      lado: 'top',
    },
    {
      alvo: 'restricoes-ld-personalizada',
      titulo: 'Livre Docência Personalizada',
      texto:
        'Marque quando a folga não for o padrão e você mesmo for pintar onde ela cai, usando a etiqueta âmbar.',
      opcional: true,
      lado: 'top',
    },
    {
      alvo: 'restricoes-rodape',
      titulo: 'Salvar ou cancelar',
      texto: 'Só existem duas saídas: "Salvar Alterações" grava o que você pintou; "Cancelar" descarta tudo.',
      avancar: 'acao',
      opcional: true,
      lado: 'top',
    },
    {
      alvo: 'professores-btn-email',
      titulo: 'Ou deixe o professor preencher',
      texto:
        'Este envelope manda um link para o próprio professor sugerir as restrições dele, sem precisar de login.',
      opcional: true,
      lado: 'left',
    },
    {
      titulo: 'Pronto!',
      texto: 'Siga para o Passo 5, Série, no menu à esquerda.',
    },
  ],
};
