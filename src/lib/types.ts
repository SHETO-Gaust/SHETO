

export type TrainingModality = 'presencial' | 'online' | 'hibrido';

export type Formacao = {
  id: string; // uuid
  name: string;
  modality: TrainingModality;
  dates?: any; // jsonb
  created_by: string; // uuid
  created_at: string; // timestamp with time zone
  updated_at: string; // timestamp with time zone
  gfcpe_info?: any; // jsonb
  gadsg_info?: any; // jsonb
  subscription_list_info?: any; // jsonb
  attendance_list_info?: { open?: boolean }; // jsonb
  consolidation_info?: any; // jsonb
  subscription_form_config?: any; // jsonb
};

export type Avaliacao = {
  id: string; // uuid
  formacao_id: string; // uuid
  participant_email: string;
  attended_date: string; // date
  infra_rating?: number; // smallint
  general_suggestions?: string;
  feedback_formadores?: any; // jsonb
  submitted_at: string; // timestamp with time zone
};

export type Frequencia = {
  id: string; // uuid
  formacao_id: string; // uuid
  cpf?: string;
  nome_completo?: string;
  email?: string;
  periodo?: string;
  fonte?: string;
  dados?: any; // jsonb
  registered_at: string; // timestamp with time zone
};

export type Inscricao = {
  id: string; // uuid
  formacao_id: string; // uuid
  cpf?: string;
  nome_completo?: string;
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
