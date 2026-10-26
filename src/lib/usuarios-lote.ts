/**
 * Cadastro de usuarios em lote a partir de planilha.
 *
 * Funcoes puras: o navegador usa as colunas para montar o modelo e ler o
 * arquivo; o servidor usa `resolverLinhaDeUsuario` para validar de verdade
 * (a validacao do navegador e so a previa - Server Action e endpoint aberto).
 */
import type { Escola, ProfileRole } from '@/lib/types';

/** Mesmos modulos da tela de usuarios (users-client.tsx). */
export const MODULOS_USUARIO = [
  { id: 'dashboard', label: 'Painel' },
  { id: 'dados-horario', label: 'Dados do Horário' },
  { id: 'horarios', label: 'Horários' },
  { id: 'usuarios', label: 'Gestão de Usuários' },
] as const;

/** Cabecalhos do modelo, na ordem em que aparecem na planilha. */
export const COLUNAS_LOTE = {
  nome: 'Nome',
  email: 'Email',
  senha: 'Senha',
  funcao: 'Função',
  regional: 'Regional',
  escola: 'Escola (INEP ou nome)',
  modulos: 'Módulos',
} as const;

export type CampoLote = keyof typeof COLUNAS_LOTE;

/** Linha crua, como saiu da planilha: tudo texto. */
export type LinhaLoteBruta = Partial<Record<CampoLote, string>> & { linha: number };

export type LinhaLoteResolvida = {
  linha: number;
  nome: string;
  email: string;
  /** Vazia = o servidor gera uma senha aleatoria. */
  senha: string;
  role: ProfileRole;
  ue: string | null;
  escolaNome: string | null;
  regional: string | null;
  modules: string[];
  erros: string[];
  avisos: string[];
};

export const LIMITE_LINHAS_LOTE = 500;

/** Minusculo, sem acento e sem espaco sobrando: "  Araguaína " === "ARAGUAINA". */
export function normalizar(texto: unknown): string {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Descobre qual campo cada cabecalho representa. Aceita variacoes comuns
 * ("E-mail", "INEP", "Escola", "Perfil") para quem montar a planilha a mao.
 */
export function campoDoCabecalho(cabecalho: string): CampoLote | null {
  const c = normalizar(cabecalho);
  if (!c) return null;
  if (c.startsWith('nome')) return 'nome';
  if (c === 'email' || c === 'e-mail' || c.startsWith('email') || c.startsWith('e-mail')) return 'email';
  if (c.startsWith('senha')) return 'senha';
  if (c.startsWith('funcao') || c.startsWith('perfil') || c === 'role' || c === 'papel') return 'funcao';
  if (c.startsWith('regional') || c === 'dre' || c === 'sre') return 'regional';
  if (c.startsWith('escola') || c === 'inep' || c.startsWith('unidade') || c === 'ue') return 'escola';
  if (c.startsWith('modulo')) return 'modulos';
  return null;
}

/** Converte as linhas de `XLSX.utils.sheet_to_json(..., { header: 1 })` em linhas brutas. */
export function linhasDaPlanilha(matriz: unknown[][]): { linhas: LinhaLoteBruta[]; erro?: string } {
  const indiceCabecalho = matriz.findIndex(l => Array.isArray(l) && l.some(c => campoDoCabecalho(String(c ?? '')) === 'email'));
  if (indiceCabecalho < 0) {
    return { linhas: [], erro: `Não encontrei a coluna "${COLUNAS_LOTE.email}". Use o modelo disponível para download.` };
  }

  const mapa = new Map<number, CampoLote>();
  matriz[indiceCabecalho].forEach((celula, i) => {
    const campo = campoDoCabecalho(String(celula ?? ''));
    if (campo && ![...mapa.values()].includes(campo)) mapa.set(i, campo);
  });

  const linhas: LinhaLoteBruta[] = [];
  for (let i = indiceCabecalho + 1; i < matriz.length; i++) {
    const celulas = matriz[i] || [];
    const linha: LinhaLoteBruta = { linha: i + 1 };
    let algumValor = false;
    for (const [col, campo] of mapa) {
      const valor = String(celulas[col] ?? '').trim();
      if (valor) {
        linha[campo] = valor;
        algumValor = true;
      }
    }
    if (algumValor) linhas.push(linha);
  }
  return { linhas };
}

function resolverModulos(texto: string | undefined, erros: string[]): string[] {
  const modulos = new Set<string>(['dashboard']);
  for (const parte of String(texto ?? '').split(/[,;|\n]/)) {
    const p = normalizar(parte);
    if (!p) continue;
    const modulo = MODULOS_USUARIO.find(m => normalizar(m.id) === p || normalizar(m.label) === p);
    if (modulo) modulos.add(modulo.id);
    else erros.push(`Módulo desconhecido: "${parte.trim()}".`);
  }
  return [...modulos];
}

function resolverFuncao(texto: string | undefined, erros: string[]): ProfileRole {
  const f = normalizar(texto);
  if (!f || f === 'user' || f === 'usuario' || f === 'usuario(a)') return 'user';
  if (f === 'admin' || f === 'administrador' || f === 'administradora' || f === 'administrador(a)') return 'admin';
  erros.push(`Função inválida: "${texto}". Use "Usuário" ou "Administrador".`);
  return 'user';
}

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Valida e resolve uma linha contra as escolas cadastradas.
 * `emailsJaUsados` deve trazer os e-mails ja existentes no banco e os das
 * linhas anteriores do mesmo arquivo (normalizados).
 */
export function resolverLinhaDeUsuario(
  bruta: LinhaLoteBruta,
  escolas: Pick<Escola, 'id' | 'escolar' | 'inep' | 'regional'>[],
  emailsJaUsados: Set<string>,
): LinhaLoteResolvida {
  const erros: string[] = [];
  const avisos: string[] = [];

  const email = String(bruta.email ?? '').trim().toLowerCase();
  if (!email) erros.push('Email em branco.');
  else if (!EMAIL_VALIDO.test(email)) erros.push(`Email inválido: "${email}".`);
  else if (emailsJaUsados.has(email)) erros.push('Email já cadastrado no sistema ou repetido na planilha.');

  const senha = String(bruta.senha ?? '').trim();
  if (senha && senha.length < 6) erros.push('A senha deve ter no mínimo 6 caracteres.');

  const role = resolverFuncao(bruta.funcao, erros);
  const modules = resolverModulos(bruta.modulos, erros);

  let ue: string | null = null;
  let escolaNome: string | null = null;
  let regionalDaEscola: string | null = null;
  const textoEscola = String(bruta.escola ?? '').trim();
  if (textoEscola) {
    const soDigitos = textoEscola.replace(/\D/g, '');
    const porInep = /^\d{6,}$/.test(textoEscola.replace(/[\s.-]/g, ''))
      ? escolas.filter(e => String(e.inep ?? '').replace(/\D/g, '') === soDigitos)
      : [];
    const candidatas = porInep.length > 0
      ? porInep
      : escolas.filter(e => normalizar(e.escolar) === normalizar(textoEscola));
    if (candidatas.length === 1) {
      ue = String(candidatas[0].id);
      escolaNome = candidatas[0].escolar.trim();
      regionalDaEscola = candidatas[0].regional ?? null;
    } else if (candidatas.length > 1) {
      erros.push(`Mais de uma escola corresponde a "${textoEscola}". Informe o INEP.`);
    } else {
      erros.push(`Escola não encontrada: "${textoEscola}".`);
    }
  }

  let regional: string | null = null;
  const textoRegional = String(bruta.regional ?? '').trim();
  if (regionalDaEscola) {
    regional = regionalDaEscola;
    if (textoRegional && normalizar(textoRegional) !== normalizar(regionalDaEscola)) {
      avisos.push(`Regional ajustada para ${regionalDaEscola}, a da escola informada.`);
    }
  } else if (textoRegional) {
    const regionais = [...new Set(escolas.map(e => e.regional).filter((r): r is string => !!r))];
    const encontrada = regionais.find(r => normalizar(r) === normalizar(textoRegional));
    if (encontrada) regional = encontrada;
    else erros.push(`Regional desconhecida: "${textoRegional}".`);
  }

  if (role === 'admin' && ue) {
    avisos.push('Administrador não fica vinculado a escola; a escola foi usada só para definir a regional.');
    ue = null;
    escolaNome = null;
  }
  if (role === 'admin' && bruta.modulos) {
    avisos.push('Administrador acessa todos os módulos; a coluna Módulos foi ignorada.');
  }

  return {
    linha: bruta.linha,
    nome: String(bruta.nome ?? '').trim(),
    email,
    senha,
    role,
    ue,
    escolaNome,
    regional,
    modules,
    erros,
    avisos,
  };
}
