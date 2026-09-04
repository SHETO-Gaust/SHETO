/**
 * Leitura visual das restrições de um professor, slot a slot.
 *
 * A grade do professor precisa mostrar exatamente o que o motor respeitou. Até
 * aqui ela reimplementava só um pedaço da regra — reconhecia `planejamento` e a
 * livre docência por período, e ignorava indisponibilidade, planejamento coletivo, os
 * tipos personalizados e a livre docência marcada célula a célula. O resultado
 * era uma grade que parecia vazia em horários que o motor tinha vedado.
 *
 * Para os motivos que o motor nunca relaxa a fonte é `motivoImpedimento` — a
 * mesma função que o certificado de inviabilidade usa. Aqui só se acrescenta o
 * que é soft (planejamento e personalizados), que o certificado deixa de fora de
 * propósito por não impedir nada.
 */

import type { Turno, LivreDocenciaItem } from '@/lib/types';
import { motivoImpedimento } from '@/lib/geracao/certificado';

/** Recorte do professor que a leitura de restrições precisa. */
export type ProfessorRestricoes = {
    restricoes?: any;
    livre_docencia?: LivreDocenciaItem[] | null;
    sem_preferencia_livre_docencia?: boolean | null;
};

export type TomEtiqueta = 'vermelho' | 'roxo' | 'ambar' | 'azul' | 'neutro';

export type EtiquetaSlot = {
    /** Id gravado na célula (`indisponivel`, `planejamento`, `personalizado_2`…). */
    id: string;
    label: string;
    tom: TomEtiqueta;
    /** `true` quando o motor jamais poderia pôr aula ali. */
    bloqueio: boolean;
};

const ROTULOS_FIXOS: Record<string, string> = {
    indisponivel: 'Indisponível',
    planejamento: 'Planejamento',
    livre_docencia: 'Livre Docência',
    reuniao_fluxo: 'Planejamento Coletivo',
};

const TONS_FIXOS: Record<string, TomEtiqueta> = {
    indisponivel: 'vermelho',
    reuniao_fluxo: 'roxo',
    livre_docencia: 'ambar',
    planejamento: 'azul',
};

/** Chaves de metadado que convivem com os ids de turno dentro de `restricoes`. */
const META_KEYS = ['_custom_types', '_personalizado_label', '_livre_docencia_personalizada'];

/**
 * Rótulos dos tipos personalizados, que o professor renomeia livremente.
 * `_personalizado_label` é o formato antigo, de quando só havia um tipo.
 */
export function rotulosPersonalizados(restricoes: any): Record<string, string> {
    const mapa: Record<string, string> = {};
    const lista = restricoes?._custom_types;
    if (Array.isArray(lista)) {
        lista.forEach((ct: any) => {
            if (ct?.id) mapa[ct.id] = ct.label || 'Personalizado';
        });
    } else if (typeof restricoes?._personalizado_label === 'string' && restricoes._personalizado_label) {
        mapa.personalizado = restricoes._personalizado_label;
    }
    return mapa;
}

/**
 * Etiqueta a exibir na célula, ou `null` se o slot está livre para o professor.
 *
 * Uma célula marcada `livre_docencia` por um professor que depois dispensou a
 * preferência devolve `null`: o motor ignora a marca, e a grade tem que contar
 * a mesma história.
 */
export function etiquetaDoSlot(
    prof: ProfessorRestricoes | undefined,
    turno: Turno,
    dia: string,
    idx: number,
): EtiquetaSlot | null {
    if (!prof) return null;

    const motivo = motivoImpedimento(prof as any, turno, dia, idx);
    if (motivo) {
        return { id: motivo, label: ROTULOS_FIXOS[motivo], tom: TONS_FIXOS[motivo], bloqueio: true };
    }

    const status = prof.restricoes?.[turno.id]?.[dia]?.[idx];
    if (!status || typeof status !== 'string') return null;
    if (status === 'livre_docencia') return null; // preferência dispensada — o motor não a respeita

    if (status === 'planejamento') {
        return { id: status, label: ROTULOS_FIXOS.planejamento, tom: 'azul', bloqueio: false };
    }

    return {
        id: status,
        label: rotulosPersonalizados(prof.restricoes)[status] || 'Personalizado',
        tom: 'neutro',
        bloqueio: false,
    };
}

/**
 * O professor tem alguma restrição ou livre docência cadastrada neste turno?
 *
 * Conta células de verdade. Salvar a tela de restrições deixa dias vazios
 * (`{"terca": {}, "quinta": {}}`) gravados no turno, e contar as chaves do turno
 * dava "tem restrição" para quem não marcou nada.
 */
export function temRestricaoNoTurno(prof: ProfessorRestricoes | undefined, turno: Turno): boolean {
    if (!prof) return false;

    const dias = turno.dias_semana ?? [];
    const doTurno = prof.restricoes?.[turno.id];
    if (doTurno) {
        for (const dia of Object.keys(doTurno)) {
            const celulas = doTurno[dia];
            if (celulas && Object.keys(celulas).length > 0) return true;
        }
    }

    // Livre docência por período só vale quando a preferência foi declarada.
    if (prof.sem_preferencia_livre_docencia !== false) return false;
    return (prof.livre_docencia ?? []).some(ld => dias.includes(ld.dia) && periodoCobreTurno(ld.periodo, turno));
}

/**
 * A livre docência é declarada por período do dia; o turno pode ser um bloco que
 * atravessa períodos (Integral cobre manhã e tarde).
 */
function periodoCobreTurno(periodo: string, turno: Turno): boolean {
    const nome = turno.nome.toLowerCase();
    if (nome.includes('integral')) return periodo === 'matutino' || periodo === 'vespertino';
    if (periodo === 'matutino') return nome.includes('matutino') || nome.includes('manhã');
    if (periodo === 'vespertino') return nome.includes('vespertino') || nome.includes('tarde');
    if (periodo === 'noturno') return nome.includes('noturno');
    return false;
}

/** Ignora as chaves de metadado ao varrer `restricoes` por id de turno. */
export function idsDeTurnoEmRestricoes(restricoes: any): string[] {
    return Object.keys(restricoes || {}).filter(k => !META_KEYS.includes(k));
}
