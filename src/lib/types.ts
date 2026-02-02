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
    nome_completo: string;
    nome_horario: string;
    email?: string | null;
    turnos_ids: string[];
    restricoes?: any; // JSONB for restrictions
    created_at: string;
};

// This will be the type returned by the main get action
export type ProfessorComDados = Professor & {
    componentes: Pick<ComponenteCurricular, 'id' | 'nome' | 'sigla'>[];
    turnos: Pick<Turno, 'id' | 'nome'>[];
};

export type Serie = {
  id: string;
  escola_id: string;
  nome: string;
  nivel_ensino_id: string;
  turno_id: string;
  restricoes?: any; // JSONB for restrictions
  created_at: string;
};

export type SerieComponente = {
  serie_id: string;
  componente_id: string;
  aulas_semanais: number;
  professor_id: string | null;
};

// This type represents the comprehensive data needed for the client
export type SerieComDados = Serie & {
  nivel_ensino: Pick<NivelEnsino, 'id' | 'nome' | 'sigla'>;
  turno: Turno;
  componentes: (SerieComponente & {
      componente: Pick<ComponenteCurricular, 'id' | 'nome' | 'sigla'>;
      professor: Pick<Professor, 'id' | 'nome_horario'> | null;
  })[];
  total_aulas_semanais: number;
  total_aulas_distribuidas: number;
};

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
