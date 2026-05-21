# Manual do Usuário - SHE (Sistema de Horário Escolar)

Bem-vindo ao manual do usuário do **SHE (Sistema de Horário Escolar)**. Este guia detalhado ajudará você a configurar sua unidade escolar e gerar o quadro de horários de forma eficiente.

## Visão Geral do Processo

A configuração do horário escolar no SHE segue um fluxo lógico de passos organizados. É crucial seguir a ordem indicada, pois as informações dos passos iniciais são necessárias para as etapas seguintes.

---

### Passo 1: Turnos
**Objetivo:** Definir os períodos de funcionamento da escola.
- Acesse a aba **Turnos**.
- Cadastre os turnos em que sua escola opera (ex: Matutino, Vespertino, Noturno).
- Defina os horários de início e fim para cada aula (slot) do turno.
- Especifique quantos dias letivos o turno possui e ative os turnos relevantes.

### Passo 2: Ensino
**Objetivo:** Cadastrar os níveis de ensino oferecidos.
- Acesse a aba **Ensino**.
- Cadastre as modalidades de ensino presentes na unidade escolar (ex: Ensino Fundamental Anos Finais, Ensino Médio Regular, Novo Ensino Médio).

### Passo 3: Componentes
**Objetivo:** Cadastrar as disciplinas/componentes curriculares.
- Acesse a aba **Componentes**.
- Adicione todas as disciplinas que compõem a grade curricular da escola (ex: Matemática, Língua Portuguesa, Biologia, Eletivas).

### Passo 4: Professores
**Objetivo:** Cadastrar o corpo docente e suas restrições de horário.
- Acesse a aba **Professores**.
- Cadastre os dados do professor (Nome, CPF).
- Defina os turnos em que o professor atua e as disciplinas que ele está habilitado a lecionar.
- **Restrições de Horário:** Configure as restrições individuais de cada professor:
  - **Indisponível:** Horários em que o professor **não pode** lecionar de forma alguma.
  - **Livre Docência (Folga):** Períodos garantidos de folga/estudo (ex: folga sindical).
  - **Planejamento:** Horários preferenciais para planejamento pedagógico.
- É possível definir também os "Dias Preferidos" para concentrar a carga horária do professor em determinados dias da semana.

### Passo 5: Série (Modelos)
**Objetivo:** Criar os "esqueletos" ou modelos para cada ano letivo.
- Acesse a aba **Série**.
- Crie uma série (ex: "1ª Série do Ensino Médio").
- Selecione o Nível de Ensino correspondente e o Turno padrão.
- Para cada série criada, adicione os **Componentes Curriculares** da grade e defina a carga horária semanal (quantidade exata de aulas presenciais e não presenciais).
- **Aulas Fixas:** Caso haja aulas que devam acontecer obrigatoriamente em um dia e horário específico (ex: uso de quadra, laboratório compartilhado), elas podem ser definidas aqui.

### Passo 6: Turmas
**Objetivo:** Criar as turmas reais e alocar os professores.
- Acesse a aba **Turmas**.
- Crie as turmas baseadas nos modelos de Série definidos no Passo 5 (ex: "1ª Série A", "1ª Série B").
- **Alocação de Professores:** Para cada turma criada, associe o professor responsável por cada componente curricular daquela turma específica.

### Passo 7: Gerar Horário
**Objetivo:** Acionar o algoritmo de inteligência para montar a grade.
- Acesse a aba **Gerar Horário**.
- O sistema lerá todas as regras, disponibilidades, cargas horárias e alocações configuradas nos passos anteriores.
- Inicie a geração. O algoritmo tentará encaixar todas as aulas respeitando as restrições bloqueantes (hard constraints) e otimizando as preferências (soft constraints, como dias preferidos e geminação de aulas).
- Após a geração, você receberá um relatório de diagnóstico. Se houver falhas de encaixe (aulas pendentes), o sistema sugerirá o motivo (ex: "Professor X não tem disponibilidade suficiente para a carga horária exigida").
- Uma vez satisfeito com o resultado gerado (Status: Em Rascunho), clique em **Publicar** para tornar o horário oficial.

### Passo 8: Visualizar Horário
**Objetivo:** Consultar a grade gerada e publicada.
- Acesse a aba **Visualizar Horário**.
- Aqui você pode consultar a grade oficial de forma interativa.
- Utilize os filtros para ver o horário sob a perspectiva da **Turma** ou do **Professor**.

### Passo 9: Relatórios
**Objetivo:** Extrair métricas consolidadas.
- Acesse a aba **Relatórios**.
- Visualize estatísticas gerais de alocação de aulas.

### Passo 10: Refino de Horário
**Objetivo:** Ajustar manualmente a grade oficial de forma inteligente e validar movimentos.
- Acesse a aba **Refino de Horário**.
- Se necessário realizar mudanças finas, você pode mover aulas de lugar manualmente.
- O sistema indicará o impacto do movimento (avisará se gera choque de horário para o professor, se desrespeita restrições, etc).
- O módulo de refino possui inteligência para sugerir "cadeias de movimento" que ajudam a resolver conflitos sem "quebrar" o horário de outras turmas.

### Passo 11: Substituições
**Objetivo:** Gerenciar ausências diárias pontuais.
- Acesse a aba **Substituições**.
- Caso um professor precise faltar em um dia específico, utilize este módulo para identificar imediatamente quais outros professores da unidade estão com horário livre (janelas) naquele mesmo turno e momento, permitindo que assumam a turma temporariamente.

---

## Funcionalidades de Gestão (Coordenadores/Admins)

- **Painel (Dashboard):** Visão geral rápida dos quadros de horários publicados da unidade escolar.
- **Seletor de Unidades (Topo da Tela):** Permite trocar de unidade escolar rapidamente caso o usuário tenha acesso a múltiplas escolas.
- **Auditoria de Dados:** Administradores podem visualizar a integridade do banco de dados global, limpar rascunhos acumulados, otimizar armazenamento e monitorar anomalias nos dados.
- **Usuários:** Módulo para controle de acesso, onde administradores podem conceder, revogar permissões e definir os níveis de acesso (Admin vs User Comum) aos módulos para os funcionários da rede.
- **Unidades:** Gerenciamento das unidades escolares cadastradas no sistema.

---

## Boas Práticas e Dicas de Uso

1. **Revisão de Dados é Fundamental:** A qualidade do horário gerado pelo algoritmo depende inteiramente das informações cadastradas. Se um professor estiver associado a turmas que somam 30 aulas na semana, mas na aba de professores ele só tiver 15 "slots" sem restrição, o sistema não conseguirá alocar todas as aulas.
2. **Aulas Não Presenciais (NP):** As aulas marcadas como NP geralmente são alocadas pelo sistema no turno oposto ao turno regular da turma (ex: Turma Matutina terá as aulas NP no Vespertino). Certifique-se de que os professores tenham disponibilidade neste turno oposto.
3. **Restrições vs Preferências:** Use as opções "Indisponível" e "Livre Docência" apenas quando o professor **realmente não puder** estar na escola. Para preferências menores, prefira usar a opção de "Planejamento", pois o sistema entende que pode sobrescrevê-la caso seja a única forma de gerar um horário completo.
