

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
