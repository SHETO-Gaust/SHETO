/**
 * Certificado de inviabilidade.
 *
 * Quando a busca desiste, a tela só sabe dizer "não consegui em N tentativas" —
 * o que é honesto mas não distingue *não achei* de *não existe*. Este módulo
 * tenta provar a segunda hipótese.
 *
 * Três verificações exatas, em ordem crescente de custo. Cada uma, quando
 * dispara, é uma PROVA: nenhuma arrumação de horário poderia funcionar com esses
 * dados, e o usuário precisa mudar o cadastro, não gerar de novo.
 *
 * O limite, que precisa ficar visível na tela: montar horário é NP-completo, e
 * provar que não existe solução é, em geral, ainda mais caro do que achar uma.
 * Estas três cobrem o que nasce de erro de cadastro — que é a maioria dos casos
 * reais — mas não todos. Não achar prova NÃO significa que exista solução.
 */

import type { Turno, ProfessorComDados } from '@/lib/types';
import { resolverTurnoOposto } from '@/lib/turno-oposto';

export type CausaInviabilidade = {
    tipo: 'carga_turma' | 'carga_professor' | 'horario_sem_cobertura';
    titulo: string;
    detalhe: string;
    correcao: string;
};

export type Certificado = {
    /**
     * `impossivel` = provado, com a causa mínima. `indeterminado` = a busca não
     * achou solução e estas verificações também não acharam prova; pode existir
     * solução difícil de encontrar.
     */
    veredito: 'impossivel' | 'indeterminado';
    causas: CausaInviabilidade[];
    /** Observações que não provam nada mas explicam a dificuldade. */
    observacoes: string[];
};

type DadosCertificado = {
    turnoData: Turno;
    turmasDoTurno: any[];
    allProfessores: any[];
    allTurnos: Turno[];
    ocupacoes: any[];
};

/** Período de um slot, para casar com a livre docência por período. */
function periodoDaAula(turno: Turno, idx: number): string {
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

/** Slot vedado ao professor por restrição que o motor nunca relaxa. */
function bloqueadoParaSempre(prof: ProfessorComDados | undefined, turno: Turno, dia: string, idx: number): boolean {
    if (!prof) return false;
    const st = (prof.restricoes as any)?.[turno.id]?.[dia]?.[idx];
    if (st === 'indisponivel' || st === 'reuniao_fluxo') return true;
    if (prof.sem_preferencia_livre_docencia === false) {
        if (st === 'livre_docencia') return true;
        const periodo = periodoDaAula(turno, idx);
        if ((prof.livre_docencia || []).some(ld => ld.dia === dia && ld.periodo === periodo)) return true;
    }
    return false;
}

export function certificar(dados: DadosCertificado): Certificado {
    const causas: CausaInviabilidade[] = [];
    const observacoes: string[] = [];

    const turno = dados.turnoData;
    const dias = turno.dias_semana || [];
    const aulasPorDia = turno.aulas_por_dia || 0;
    const capacidade = dias.length * aulasPorDia;
    const turnoOposto = resolverTurnoOposto(turno, dados.allTurnos.filter(t => t.ativo));

    const profsPorId = new Map<string, ProfessorComDados>(
        dados.allProfessores.map((p: any) => [p.id, p])
    );

    // ── 1. Cada turma cabe no turno? ─────────────────────────────────────────
    const semFolga: string[] = [];
    for (const t of dados.turmasDoTurno) {
        const comps = t.serie?.componentes || [];
        const demanda = comps.reduce((s: number, c: any) => s + (c.aulas_presenciais || 0), 0);

        if (demanda > capacidade) {
            causas.push({
                tipo: 'carga_turma',
                titulo: `A turma ${t.nome} tem mais aulas do que horários`,
                detalhe: `A matriz da série pede ${demanda} aulas presenciais, e o turno ${turno.nome} ` +
                    `tem ${aulasPorDia} aulas × ${dias.length} dias = ${capacidade} horários. ` +
                    `Sobram ${demanda - capacidade} aula(s) sem onde caber.`,
                correcao: `Reduza ${demanda - capacidade} aula(s) na carga horária da série ${t.serie?.nome ?? ''}, ` +
                    `ou acrescente aulas ao dia / dias à semana no turno.`,
            });
        } else if (demanda === capacidade) {
            semFolga.push(t.nome);
        }

        const demandaNP = comps.reduce((s: number, c: any) => s + (c.aulas_nao_presenciais || 0), 0);
        if (demandaNP > 0) {
            const capNP = turnoOposto ? (turnoOposto.dias_semana?.length || 0) * (turnoOposto.aulas_por_dia || 0) : 0;
            if (demandaNP > capNP) {
                causas.push({
                    tipo: 'carga_turma',
                    titulo: `A turma ${t.nome} não tem contraturno suficiente`,
                    detalhe: turnoOposto
                        ? `São ${demandaNP} aulas não presenciais para ${capNP} horários no turno ${turnoOposto.nome}.`
                        : `Há ${demandaNP} aulas não presenciais, mas nenhum turno oposto ativo para recebê-las.`,
                    correcao: turnoOposto
                        ? `Reduza as aulas não presenciais da série ou amplie o turno ${turnoOposto.nome}.`
                        : `Ative o turno oposto na tela de Turnos, ou zere as aulas não presenciais da série.`,
                });
            }
        }
    }

    // ── 2. Cada professor cabe na própria agenda? ────────────────────────────
    const cargaPorProf = new Map<string, number>();
    for (const t of dados.turmasDoTurno) {
        for (const v of t.professores || []) {
            const comp = (t.serie?.componentes || []).find((c: any) => c.componente_id === v.componente_id);
            if (!comp) continue;
            cargaPorProf.set(v.professor_id, (cargaPorProf.get(v.professor_id) ?? 0) + (comp.aulas_presenciais || 0));
        }
    }

    // Slots que o professor já gastou em grades publicadas de outros turnos.
    const ocupadoAlhures = new Map<string, number>();
    for (const o of dados.ocupacoes) {
        if (!o.professor_id) continue;
        ocupadoAlhures.set(o.professor_id, (ocupadoAlhures.get(o.professor_id) ?? 0) + 1);
    }

    const apertados: string[] = [];
    for (const [profId, carga] of cargaPorProf) {
        if (carga === 0) continue;
        const prof = profsPorId.get(profId);
        if (!prof) continue;

        let bloqueados = 0;
        for (const d of dias) {
            for (let i = 0; i < aulasPorDia; i++) {
                if (bloqueadoParaSempre(prof, turno, d, i)) bloqueados++;
            }
        }
        const livres = capacidade - bloqueados - (ocupadoAlhures.get(profId) ?? 0);

        if (carga > livres) {
            causas.push({
                tipo: 'carga_professor',
                titulo: `${prof.nome_horario} tem mais aulas do que horários livres`,
                detalhe: `São ${carga} aulas atribuídas e apenas ${livres} horários disponíveis ` +
                    `(${capacidade} do turno, menos ${bloqueados} bloqueados por indisponibilidade, ` +
                    `livre docência ou reunião de fluxo` +
                    `${ocupadoAlhures.get(profId) ? `, menos ${ocupadoAlhures.get(profId)} já ocupados em outro turno` : ''}).`,
                correcao: `Tire ${carga - livres} aula(s) de ${prof.nome_horario}, ou libere ` +
                    `${carga - livres} dos horários bloqueados dele.`,
            });
        } else if (livres - carga <= 2) {
            apertados.push(`${prof.nome_horario} (${carga} aulas em ${livres} horários)`);
        }
    }

    // ── 3. Cada horário consegue atender todas as turmas? ────────────────────
    //
    // Só vale para as turmas SEM FOLGA: uma turma com horário sobrando pode
    // legitimamente ficar vazia num slot, e aí não haveria contradição nenhuma.
    // Para as que precisam preencher tudo, cada horário exige um professor
    // DIFERENTE por turma — um emparelhamento perfeito. Se ele não existe em
    // algum horário, está provado que a grade não fecha.
    const turmasSemFolga = dados.turmasDoTurno.filter(t => {
        const demanda = (t.serie?.componentes || []).reduce((s: number, c: any) => s + (c.aulas_presenciais || 0), 0);
        return demanda === capacidade;
    });

    if (turmasSemFolga.length > 1) {
        for (const d of dias) {
            for (let i = 0; i < aulasPorDia; i++) {
                const adj = new Map<string, Set<string>>();
                for (const t of turmasSemFolga) {
                    const possiveis = new Set<string>();
                    for (const v of t.professores || []) {
                        const comp = (t.serie?.componentes || []).find((c: any) => c.componente_id === v.componente_id);
                        if (!comp || (comp.aulas_presenciais || 0) === 0) continue;
                        if (!bloqueadoParaSempre(profsPorId.get(v.professor_id), turno, d, i)) {
                            possiveis.add(v.professor_id);
                        }
                    }
                    adj.set(t.nome, possiveis);
                }

                const violacao = encontrarViolacaoHall(adj);
                if (violacao) {
                    const nomesProf = [...violacao.professores]
                        .map(id => profsPorId.get(id)?.nome_horario ?? id)
                        .sort();
                    causas.push({
                        tipo: 'horario_sem_cobertura',
                        titulo: `Não há professores suficientes em ${rotuloDia(d)}, ${i + 1}ª aula`,
                        detalhe: `As turmas ${[...violacao.turmas].sort().join(', ')} precisam ter aula nesse ` +
                            `horário — nenhuma delas tem folga na grade — e juntas só podem ser atendidas por ` +
                            `${nomesProf.length} professor(es): ${nomesProf.join(', ')}. ` +
                            `São ${violacao.turmas.size} turmas para ${nomesProf.length} professor(es).`,
                        correcao: `Libere esse horário para mais um professor dessas turmas, ou reduza a carga ` +
                            `de uma delas para que possa ficar sem aula em ${rotuloDia(d)}, ${i + 1}ª aula.`,
                    });
                }
            }
        }
    }

    // ── Observações: não provam nada, mas explicam a dificuldade ─────────────
    if (semFolga.length > 0) {
        observacoes.push(
            `${semFolga.length === dados.turmasDoTurno.length ? 'Todas as turmas' : `As turmas ${semFolga.join(', ')}`} ` +
            `preenchem exatamente os ${capacidade} horários do turno, sem nenhuma folga. Só uma arrumação ` +
            `perfeita fecha a grade: qualquer bloqueio de professor num horário de que a turma precise a torna ` +
            `impossível, não apenas difícil. Acrescentar uma aula ao dia daria margem de manobra à busca.`
        );
    }
    if (apertados.length > 0) {
        observacoes.push(`Professores quase sem margem: ${apertados.join('; ')}.`);
    }

    // Uma causa por tipo já basta para o usuário agir; listar quarenta horários
    // com o mesmo problema só esconde a informação.
    const porTipo = new Map<string, CausaInviabilidade[]>();
    for (const c of causas) {
        const lista = porTipo.get(c.tipo);
        if (lista) lista.push(c); else porTipo.set(c.tipo, [c]);
    }
    const resumidas: CausaInviabilidade[] = [];
    for (const [, lista] of porTipo) {
        resumidas.push(...lista.slice(0, 3));
        if (lista.length > 3) {
            resumidas.push({
                tipo: lista[0].tipo,
                titulo: `…e mais ${lista.length - 3} caso(s) do mesmo tipo`,
                detalhe: 'Corrigir os primeiros normalmente resolve os demais, que costumam ter a mesma origem.',
                correcao: '',
            });
        }
    }

    return {
        veredito: resumidas.length > 0 ? 'impossivel' : 'indeterminado',
        causas: resumidas,
        observacoes,
    };
}

const DIAS: Record<string, string> = {
    segunda: 'segunda-feira', terca: 'terça-feira', quarta: 'quarta-feira',
    quinta: 'quinta-feira', sexta: 'sexta-feira', sabado: 'sábado', domingo: 'domingo',
};
const rotuloDia = (d: string) => DIAS[d] ?? d;

/**
 * Procura um conjunto de turmas que, juntas, têm menos professores disponíveis
 * do que turmas — a violação do teorema de Hall, que é a prova de que nenhum
 * emparelhamento cobre todas.
 *
 * Constrói um emparelhamento máximo por caminhos aumentantes e, se sobrar turma
 * sem par, sai dela por caminhos alternados. Tudo que ele alcança é exatamente o
 * conjunto culpado — e é o MENOR que explica a falha, não a lista inteira de
 * turmas do horário.
 */
function encontrarViolacaoHall(
    adj: Map<string, Set<string>>
): { turmas: Set<string>; professores: Set<string> } | null {
    const par = new Map<string, string>();   // professor -> turma
    const parInv = new Map<string, string>(); // turma -> professor

    const aumentar = (turma: string, visto: Set<string>): boolean => {
        for (const prof of adj.get(turma) ?? []) {
            if (visto.has(prof)) continue;
            visto.add(prof);
            const ocupante = par.get(prof);
            if (!ocupante || aumentar(ocupante, visto)) {
                par.set(prof, turma);
                parInv.set(turma, prof);
                return true;
            }
        }
        return false;
    };

    const semPar: string[] = [];
    for (const turma of adj.keys()) {
        if (!aumentar(turma, new Set())) semPar.push(turma);
    }
    if (semPar.length === 0) return null;

    // Busca alternada a partir de uma turma sem par: o alcance é o violador.
    const turmasAlcancadas = new Set<string>();
    const profsAlcancados = new Set<string>();
    const fila = [semPar[0]];
    turmasAlcancadas.add(semPar[0]);

    while (fila.length > 0) {
        const turma = fila.shift()!;
        for (const prof of adj.get(turma) ?? []) {
            if (profsAlcancados.has(prof)) continue;
            profsAlcancados.add(prof);
            const ocupante = par.get(prof);
            if (ocupante && !turmasAlcancadas.has(ocupante)) {
                turmasAlcancadas.add(ocupante);
                fila.push(ocupante);
            }
        }
    }

    return { turmas: turmasAlcancadas, professores: profsAlcancados };
}
