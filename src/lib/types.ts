
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
  ue?: string | null;
  escolas?: Partial<Escola> | null;
  created_at: string; // timestamp with time zone
  updated_at: string; // timestamp with time zone
};
