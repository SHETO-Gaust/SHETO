
export type ProfileRole = 'admin' | 'user';

export type Escola = {
  id: string;
  escolar: string;
  regional?: string | null;
  cidade?: string | null;
  inep?: string | null;
};

export type Profile = {
  id: string; // uuid
  name?: string;
  email: string;
  role?: ProfileRole;
  modules?: string[];
  ue?: string | null; // uuid da escola
  active: boolean;
  escolas?: Partial<Escola> | null;
  created_at: string; // timestamp with time zone
  updated_at: string; // timestamp with time zone
};

export type HorarioAula = {
  id: string;
  inicio: string; // "HH:mm"
  fim: string; // "HH:mm"
};

export type Turno = {
  id: string;
  escola_id: string;
  nome: string;
  ativo: boolean;
  dias_semana: string[];
  aulas_por_dia: number;
  horarios: HorarioAula[];
  created_at: string;
};

export type NivelEnsino = {
    id: string;
    escola_id: string;
    nome: string;
    sigla: string;
    created_at: string;
};

export type ComponenteCurricular = {
    id: string;
    escola_id: string;
    nome: string;
    sigla: string;
    created_at: string;
};

export type Professor = {
    id: string;
    escola_id: string;
    cpf: string;
    nome_completo: string;
    nome_horario: string;
    email?: string | null;
    turnos_ids: string[];
    aulas_disponiveis: number;
    aulas_planejamento: number;
    restricoes?: any; // JSONB for restrictions
    created_at: string;
};

export type SolicitacaoRestricao = {
    id: string;
    professor_id: string;
    token: string;
    status: 'pendente' | 'respondido' | 'concluido';
    dados_temp: any;
    expires_at: string;
    created_at: string;
};

// This will be the type returned by the main get action
export type ProfessorComDados = Professor & {
    componentes: Pick<ComponenteCurricular, 'id' | 'nome' | 'sigla'>[];
    turnos: Turno[];
    aulas_atribuidas?: number;
    alocacoes?: { turma_nome: string; serie_nome: string; aulas: number; componente_nome: string }[];
    solicitacao_pendente?: SolicitacaoRestricao | null;
};

export type Serie = {
  id: string;
  escola_id: string;
  nome: string;
  nivel_ensino_id: string;
  turno_id: string;
  aulas_nao_presenciais_semanais: number;
  restricoes?: any; // JSONB for restrictions
  created_at: string;
};

export type SerieComponente = {
  serie_id: string;
  componente_id: string;
  aulas_presenciais: number;
  aulas_nao_presenciais: number;
};

// This type represents the comprehensive data needed for the /serie page
export type SerieComDados = Serie & {
  nivel_ensino: Pick<NivelEnsino, 'id' | 'nome' | 'sigla'>;
  turno: Turno;
  componentes: (SerieComponente & {
      componente: Pick<ComponenteCurricular, 'id' | 'nome' | 'sigla'>;
  })[];
  total_aulas_presenciais_semanais: number;
  total_aulas_presenciais_distribuidas: number;
  total_aulas_nao_presenciais_distribuidas: number;
  turmas_count: number;
};


// --- TURMAS ---

export type Turma = {
    id: string;
    escola_id: string;
    serie_id: string;
    nome: string; // e.g., 'A', 'B'
    created_at: string;
};

export type TurmaProfessor = {
    turma_id: string;
    componente_id: string;
    professor_id: string;
};

export type TurmaComDados = Turma & {
    serie: Pick<Serie, 'id' | 'nome' | 'turno_id' | 'restricoes'> & {
        componentes: (SerieComponente & {
            componente: Pick<ComponenteCurricular, 'id' | 'nome' | 'sigla'>;
        })[];
    };
    professores: (TurmaProfessor & {
        professor: Pick<Professor, 'id' | 'nome_horario'>;
    })[];
};


// --- HORARIO ---

export type ChecklistItemStatus = 'ok' | 'warning' | 'error';

export type ChecklistItem = {
    id: string;
    title: string;
    description: string;
    status: ChecklistItemStatus;
    details?: string;
    link?: string;
};

export type ChecklistReportData = ChecklistItem[];

export type Horario = {
  id: string;
  escola_id: string;
  turno_id: string;
  nome: string;
  status: 'em_rascunho' | 'publicado';
  created_at: string;
};

export type HorarioAulaGerada = {
  id: string;
  horario_id: string;
  turma_id: string;
  componente_id: string;
  professor_id: string | null;
  dia_semana: string;
  aula_index: number;
  tipo: 'presencial' | 'nao_presencial';
};

export type TurmaConfigHorario = {
    id: string;
    serie: {
        id: string;
        componentes: {
            componente_id: string;
            aulas_presenciais: number;
            aulas_nao_presenciais: number;
            componente: Pick<ComponenteCurricular, 'id' | 'nome' | 'sigla'>;
        }[];
    };
    professores: {
        componente_id: string;
        professor: {
            nome_horario: string;
        } | null;
    }[];
};

export type HorarioCompleto = Horario & {
    turno: Turno;
    turno_oposto?: Turno;
    aulas: (HorarioAulaGerada & {
        componente: Pick<ComponenteCurricular, 'id' | 'nome' | 'sigla'>;
        professor: Pick<Professor, 'id' | 'nome_horario' | 'restricoes'> | null;
        turma: Pick<Turma, 'id' | 'nome'>;
    })[];
    outras_aulas_publicadas?: (HorarioAulaGerada & {
        componente: Pick<ComponenteCurricular, 'id' | 'nome' | 'sigla'>;
        professor: Pick<Professor, 'id' | 'nome_horario' | 'restricoes'> | null;
        turma: Pick<Turma, 'id' | 'nome'>;
        horario: { turno: Turno };
    })[];
    turmas_config: TurmaConfigHorario[];
};

export type ConfiguracaoGerminacao = {
    componente_id: string;
    geminar: boolean;
    tamanho_bloco: number;
};
