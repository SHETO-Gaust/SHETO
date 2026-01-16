


export type TrainingModality = 'presencial' | 'online' | 'hibrido';

export type Period = {
    enabled: boolean;
    startTime: string;
    endTime: string;
};

export type Coordinates = {
    latitude: number;
    longitude: number;
};

export type Geolocation = {
    id: string;
    latitude: number;
    longitude: number;
    radius: number; // in km
};

export type GeolocationConfig = {
    enabled: boolean;
    locations: Geolocation[];
};

export type AttendanceListInfo = {
    open?: boolean;
    periods?: {
        morning?: Period;
        afternoon?: Period;
    },
    geolocation?: GeolocationConfig;
};

export type Formador = {
  id: string; // uuid
  formacao_id: string; // uuid
  formacao_date: string; // date
  name: string;
  reference?: string | null;
  created_at: string;
};

export type Formacao = {
  id: string; // uuid
  name: string;
  modality: TrainingModality;
  dates?: any; // jsonb
  created_by: string; // uuid
  created_at: string; // timestamp with time zone
  updated_at: string; // timestamp with time zone
  gfcpe_info?: any; // jsonb
  gadsg_info?: {
    avaliacao?: {
        open?: boolean;
    }
  };
  subscription_list_info?: any; // jsonb
  attendance_list_info?: AttendanceListInfo;
  consolidation_info?: any; // jsonb
  subscription_form_config?: any; // jsonb
};

export type Avaliacao = {
  id: string; // uuid
  formacao_id: string; // uuid
  inscricao_id: string; // uuid
  infra_rating?: number; // smallint
  general_suggestions?: string;
  feedback_formadores?: any; // jsonb
  submitted_at: string; // timestamp with time zone
};

export type Frequencia = {
  id: string; // uuid
  formacao_id: string; // uuid
  inscricao_id: string; // uuid
  cpf: string;
  periodo?: string;
  registered_at: string; // timestamp with time zone
};

export type Inscricao = {
  id: string; // uuid
  formacao_id: string; // uuid
  cpf: string;
  nome_completo: string;
  email: string;
  dados?: any; // jsonb
  created_at?: string; // timestamp with time zone
};

export type ProfileRole = 'admin' | 'user';

export type Profile = {
  id: string; // uuid
  name?: string;
  email: string;
  role?: ProfileRole;
  created_at: string; // timestamp with time zone
  updated_at: string; // timestamp with time zone
};

export type Notification = {
  id: string;
  message: string;
  createdAt: string;
  read: boolean;
};

export type AvaliacaoQuestionAvg = {
    dominio_tema: number;
    relevancia_profissional: number;
    contribuicao_tema: number;
    metodologia_adequada: number;
};

export type AvaliacaoSummary = {
  formacao: Formacao;
  totalAvaliacoes: number;
  infraestruturaAvg: number;
  formadoresAvg: AvaliacaoQuestionAvg;
};
