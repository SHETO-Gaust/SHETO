import type { Tutorial } from './types';

/**
 * Ordem pensada para o que esta visivel na tela: primeiro tudo o que fica na
 * pagina, e so no fim abrimos o cadastro. Se o sheet abrisse antes, ele cobriria
 * a tabela e a grade, e o destaque apontaria para elementos escondidos atras dele.
 */
export const tutorialTurno: Tutorial = {
  id: 'turno',
  titulo: 'Como cadastrar os Turnos',
  passos: [
    {
      titulo: 'Passo 1 do sistema: Turnos',
      texto:
        'Aqui você define em que períodos a escola funciona e o horário de cada aula. Tudo começa por esta tela.',
    },
    {
      alvo: 'turno-tabela',
      titulo: 'Seus turnos ficam nesta lista',
      texto: 'Cada turno que você criar aparece aqui, com a situação e as ações disponíveis.',
      lado: 'top',
    },
    {
      alvo: 'turno-coluna-status',
      titulo: 'Ative só o que a escola usa',
      texto: 'A chavinha de cada linha liga e desliga o turno. Turno desligado não entra no horário.',
      lado: 'bottom',
    },
    {
      alvo: 'turno-coluna-acoes',
      titulo: 'Aqui você coloca as horas',
      texto:
        'Nos três pontinhos de cada turno, escolha "Horários". É ali que você digita a hora de início e de fim de cada aula.',
      lado: 'left',
    },
    {
      alvo: 'turno-coluna-acoes',
      titulo: 'Onde fica o intervalo',
      texto:
        'Dentro de "Horários", cada aula tem uma chave laranja de Intervalo. Ligue na aula depois da qual o recreio acontece.',
      lado: 'left',
    },
    {
      alvo: 'turno-grade',
      titulo: 'O intervalo vem depois daquela aula',
      texto:
        'Ligou o intervalo na 3ª aula? O recreio acontece logo depois dela, e não antes.',
      lado: 'top',
    },
    {
      alvo: 'turno-grade',
      titulo: 'Quanto tempo dura o intervalo',
      texto:
        'A duração é o espaço entre o fim de uma aula e o início da próxima. Termina 09:30 e a seguinte começa 09:50? São 20 minutos de recreio.',
      lado: 'top',
    },
    {
      alvo: 'turno-grade',
      titulo: 'Confira aqui o resultado',
      texto: 'Esta grade mostra o horário de cada aula dos turnos ativos, já com os intervalos no lugar.',
      lado: 'top',
    },
    {
      alvo: 'turno-btn-adicionar',
      titulo: 'Agora crie um turno',
      texto: 'Clique em "Adicionar Turno" para abrir o cadastro. Eu continuo com você lá dentro.',
      avancar: 'acao',
      lado: 'bottom',
    },
    {
      alvo: 'turno-sheet-nome',
      titulo: 'Dê um nome ao turno',
      texto: 'Use um nome que a escola reconheça, como Matutino, Vespertino ou Noturno.',
      lado: 'bottom',
    },
    {
      alvo: 'turno-sheet-rodape',
      titulo: 'Salvar ou cancelar',
      texto: 'Só existem duas saídas: "Salvar Turno" grava o cadastro; "Cancelar" fecha e não grava nada.',
      lado: 'top',
    },
    {
      titulo: 'Turnos prontos!',
      texto: 'Agora siga para o Passo 2, Ensino, no menu à esquerda. Cada etapa depende da anterior.',
    },
  ],
};
