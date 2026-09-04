/**
 * O que veda um slot a um professor.
 *
 * Saiu de dentro de `geracao/certificado.ts` porque o refino passou a precisar
 * dela e roda NO NAVEGADOR: importar o certificado inteiro (com o cálculo de
 * capacidade e o emparelhamento de turmas) arrastaria meio motor para o bundle
 * do cliente por causa de uma função de dez linhas. O certificado reexporta
 * tudo daqui, então nenhum chamador antigo precisou mudar.
 *
 * Continua sendo fonte única: o certificado, o Mapa de Disponibilidade, o
 * preenchimento de vagas e agora o refino precisam dar exatamente o mesmo
 * veredito sobre o mesmo slot, senão uma tela promete professor que a outra
 * nega.
 */

import type { ProfessorComDados, Turno } from '@/lib/types';

/** Período de um slot, para casar com a livre docência por período. */
export function periodoDaAula(turno: Turno, idx: number): string {
    const n = turno.nome.toLowerCase();
    if (n.includes('matutino') || n.includes('manhã')) return 'matutino';
    if (n.includes('vespertino') || n.includes('tarde')) return 'vespertino';
    if (n.includes('noturno') || n.includes('noite')) return 'noturno';
    const h = turno.horarios?.[idx];
    if (h?.inicio) {
        const hora = parseInt(String(h.inicio).split(':')[0], 10);
        if (hora < 13) return 'matutino';
        if (hora < 18) return 'vespertino';
        return 'noturno';
    }
    return idx < 5 ? 'matutino' : 'vespertino';
}

/**
 * Motivos que vedam um slot ao professor de forma permanente — o motor nunca
 * relaxa nenhum deles. `planejamento` e os tipos `personalizado*` ficam de fora
 * de propósito: são soft constraints, o motor pode usá-los como último recurso.
 */
export type MotivoImpedimento = 'indisponivel' | 'reuniao_fluxo' | 'livre_docencia';

export const ROTULO_IMPEDIMENTO: Record<MotivoImpedimento, string> = {
    indisponivel: 'Bloqueio (indisponível)',
    reuniao_fluxo: 'Planejamento coletivo',
    livre_docencia: 'Livre docência',
};

/**
 * Por que o slot está vedado ao professor, ou `null` se ele pode assumir aula ali.
 */
export function motivoImpedimento(
    prof: ProfessorComDados | undefined,
    turno: Turno,
    dia: string,
    idx: number,
): MotivoImpedimento | null {
    if (!prof) return null;
    const st = (prof.restricoes as any)?.[turno.id]?.[dia]?.[idx];
    if (st === 'indisponivel') return 'indisponivel';
    if (st === 'reuniao_fluxo') return 'reuniao_fluxo';
    // Só vale quando o professor TEM preferência declarada; `null`/`true` = dispensou.
    if (prof.sem_preferencia_livre_docencia === false) {
        if (st === 'livre_docencia') return 'livre_docencia';
        const periodo = periodoDaAula(turno, idx);
        if ((prof.livre_docencia || []).some(ld => ld.dia === dia && ld.periodo === periodo)) return 'livre_docencia';
    }
    return null;
}

/** Slot vedado ao professor por restrição que o motor nunca relaxa. */
export function bloqueadoParaSempre(prof: ProfessorComDados | undefined, turno: Turno, dia: string, idx: number): boolean {
    return motivoImpedimento(prof, turno, dia, idx) !== null;
}
