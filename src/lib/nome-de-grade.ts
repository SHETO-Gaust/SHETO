/**
 * Nome de uma grade salva.
 *
 * Existe porque duas partes distantes precisam concordar sobre a mesma string:
 * o diálogo de duplicar, que sugere o nome, e a action, que o grava. E porque o
 * nome carrega um sufixo com significado — `(Com Pendências)` —, que
 * `sincronizarPendencias` remove com uma regex ancorada no FIM do texto. Se a
 * cópia virasse "Horário V1 (Com Pendências) (cópia)", o sufixo deixaria de ser
 * reconhecível e nunca mais sairia do nome, mesmo depois de as pendências serem
 * resolvidas.
 */

export const SUFIXO_PENDENCIAS = ' (Com Pendências)';

const RE_SUFIXO_PENDENCIAS = /\s*\(Com Pendências\)\s*$/;

export function temSufixoDePendencias(nome: string): boolean {
  return RE_SUFIXO_PENDENCIAS.test(nome);
}

export function semSufixoDePendencias(nome: string): string {
  return nome.replace(RE_SUFIXO_PENDENCIAS, '').trim();
}

/**
 * Monta o nome final da cópia: base → `(cópia)` → sufixo de pendências, nesta
 * ordem. `nomesExistentes` são os nomes já usados NO MESMO TURNO, que é o
 * escopo da unicidade no banco (`UNIQUE (escola_id, turno_id, nome)`).
 */
export function sugerirNomeDeCopia(nomeOriginal: string, nomesExistentes: string[]): string {
  const pendente = temSufixoDePendencias(nomeOriginal);
  const base = semSufixoDePendencias(nomeOriginal) || 'Horário';

  const usados = new Set(nomesExistentes.map(n => n.trim().toLowerCase()));
  const montar = (n: number) => {
    const marca = n === 1 ? ' (cópia)' : ` (cópia ${n})`;
    return `${base}${marca}${pendente ? SUFIXO_PENDENCIAS : ''}`;
  };

  let n = 1;
  while (usados.has(montar(n).trim().toLowerCase()) && n < 50) n++;
  return montar(n);
}

/**
 * Normaliza o que o usuário digitou: tira espaço sobrando e recoloca o sufixo
 * de pendências no fim, se a grade de origem o tinha.
 */
export function normalizarNomeDeGrade(nomeDigitado: string, temPendencias: boolean): string {
  const base = semSufixoDePendencias((nomeDigitado || '').trim());
  if (!base) return '';
  return temPendencias ? `${base}${SUFIXO_PENDENCIAS}` : base;
}

/**
 * Nome sugerido para a grade que sai de um "Regerar".
 *
 * Regerar NÃO substitui a grade de origem — ela continua lá, intacta —, então o
 * resultado precisa de um nome próprio. E precisa de um que não colida: o banco
 * tem `UNIQUE (escola_id, turno_id, nome)`, e um nome repetido faz a gravação
 * falhar no fim de uma geração inteira, com o log dizendo "TURNO NAO SALVO" e a
 * tela parecendo que a regeração não produziu nada.
 *
 * O nome carrega a origem de propósito: "Horário V1 (regerado)" diz de onde
 * veio, o que um "Horário V4" qualquer não diria.
 */
export function sugerirNomeDeRegeracao(nomeOriginal: string, nomesExistentes: string[]): string {
  // O sufixo de pendências NÃO é herdado: a grade nova pode muito bem fechar, e
  // anunciar pendência antes de gerar seria mentira. Quem grava é que recoloca.
  const base = semSufixoDePendencias(nomeOriginal) || 'Horário';

  const usados = new Set(nomesExistentes.map(n => n.trim().toLowerCase()));
  const montar = (n: number) => {
    const marca = n === 1 ? ' (regerado)' : ` (regerado ${n})`;
    return `${base}${marca}`;
  };

  let n = 1;
  while (usados.has(montar(n).trim().toLowerCase()) && n < 50) n++;
  return montar(n);
}
