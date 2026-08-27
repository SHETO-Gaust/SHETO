'use server';

/**
 * Preencher as aulas que a geração deixou de fora, trocando professores.
 *
 * Vive em arquivo próprio, e não em `actions.ts`, porque é um assunto inteiro:
 * ler as vagas, calcular a cadeia e gravá-la. O `actions.ts` do módulo já
 * carrega o ciclo de vida da geração.
 *
 * A busca roda AQUI, no servidor, e não no navegador como a do refino. Ela
 * precisa de habilitação por disciplina, restrições e carga de todos os
 * professores da escola — mandar isso para o cliente a cada clique seria caro e
 * exporia dado que a tela não usa para mais nada.
 */

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { requireEscolaDoRecurso } from '@/lib/auth/guards';
import type { Turno } from '@/lib/types';
import {
    calcularAlocacaoComTrocas,
    type AulaAlocacao,
    type MovimentoAlocacao,
    type ProfessorAlocacao,
    type ResultadoAlocacao,
    type Vaga,
} from '@/lib/refino-professores';

/** Um horário livre da turma onde uma aula poderia entrar. */
export type SlotVago = {
    dia_semana: string;
    aula_index: number;
    turno_id: string;
    inicio: string | null;
    fim: string | null;
};

/** Uma aula que o cadastro pede e a grade não tem. */
export type AulaFaltando = {
    componente_id: string;
    componente_nome: string;
    componente_sigla: string;
    professor_id: string | null;
    professor_nome: string;
    tipo: 'presencial' | 'nao_presencial';
    quantidade: number;
};

export type VagasDaTurma = {
    turma_id: string;
    turma_nome: string;
    slotsVagos: SlotVago[];
    faltando: AulaFaltando[];
};

type Contexto = {
    escolaId: string;
    turno: Turno;
    turnosById: Map<string, Turno>;
    aulasDoHorario: AulaAlocacao[];
    aulasParaConflito: AulaAlocacao[];
    professores: ProfessorAlocacao[];
    turmas: any[];
};

const mapearAula = (a: any): AulaAlocacao => ({
    id: a.id,
    turma_id: a.turma_id,
    turma_nome: a.turma?.nome ?? '',
    componente_id: a.componente_id,
    componente_nome: a.componente?.nome ?? '',
    componente_sigla: a.componente?.sigla ?? '',
    professor_id: a.professor_id,
    professor_nome: a.professor?.nome_horario ?? 'Sem professor',
    professor_cpf: a.professor?.cpf ?? null,
    dia_semana: a.dia_semana,
    aula_index: a.aula_index,
    tipo: a.tipo,
    turno_id: a.turno_id,
    aula_fixa_id: a.aula_fixa_id ?? null,
});

const SELECT_AULA =
    'id, horario_id, turma_id, componente_id, professor_id, dia_semana, aula_index, tipo, turno_id, aula_fixa_id,' +
    ' turma:turmas(nome), componente:componentes_curriculares(nome, sigla), professor:professores(nome_horario, cpf)';

/**
 * Junta tudo que a alocação precisa.
 *
 * A distinção entre `aulasDoHorario` e `aulasParaConflito` importa: a troca só
 * pode mexer nas aulas DESTE horário, mas o professor não pode estar em duas
 * salas ao mesmo tempo em NENHUM horário vigente da escola — inclusive num
 * turno oposto que começa noutra hora. Ignorar isso produziria uma alocação que
 * a tela aceita e a escola não consegue cumprir.
 */
async function carregarContexto(horarioId: string): Promise<{ ctx?: Contexto; error?: string }> {
    const supabase = await createClient();

    const { data: horario, error: hErr } = await supabase
        .from('horarios')
        .select('*, turno:turnos(*)')
        .eq('id', horarioId)
        .single();
    if (hErr || !horario) return { error: 'Horário não encontrado.' };

    const escolaId = (horario as any).escola_id as string;

    const { data: turnos } = await supabase.from('turnos').select('*').eq('escola_id', escolaId);
    const turnosById = new Map<string, Turno>(((turnos ?? []) as Turno[]).map(t => [t.id, t]));

    const { data: aulasDeste, error: aErr } = await supabase
        .from('horario_aulas')
        .select(SELECT_AULA)
        .eq('horario_id', horarioId);
    if (aErr) return { error: 'Não foi possível ler as aulas deste horário.' };

    // Aulas dos demais horários vigentes da escola, só para detectar choque.
    const { data: outrosHorarios } = await supabase
        .from('horarios')
        .select('id')
        .eq('escola_id', escolaId)
        .in('status', ['publicado', 'pre_producao']);
    const idsOutros = ((outrosHorarios ?? []) as { id: string }[])
        .map(h => h.id)
        .filter(id => id !== horarioId);

    let aulasOutras: any[] = [];
    if (idsOutros.length > 0) {
        const { data } = await supabase.from('horario_aulas').select(SELECT_AULA).in('horario_id', idsOutros);
        aulasOutras = data ?? [];
    }

    const { data: profs, error: pErr } = await supabase
        .from('professores')
        .select('id, nome_horario, cpf, restricoes, aulas_disponiveis, aulas_planejamento')
        .eq('escola_id', escolaId);
    if (pErr) return { error: 'Não foi possível ler os professores da escola.' };

    const { data: habilitacoes } = await supabase.from('professores_componentes').select('professor_id, componente_id');
    const porProfessor = new Map<string, string[]>();
    for (const h of (habilitacoes ?? []) as { professor_id: string; componente_id: string }[]) {
        const lista = porProfessor.get(h.professor_id);
        if (lista) lista.push(h.componente_id);
        else porProfessor.set(h.professor_id, [h.componente_id]);
    }

    const professores: ProfessorAlocacao[] = ((profs ?? []) as any[]).map(p => ({
        id: p.id,
        nome: p.nome_horario ?? '',
        cpf: p.cpf ?? null,
        componentes: porProfessor.get(p.id) ?? [],
        restricoes: p.restricoes ?? null,
        aulas_disponiveis: p.aulas_disponiveis ?? 0,
        aulas_planejamento: p.aulas_planejamento ?? 0,
    }));

    const { data: turmas } = await supabase
        .from('turmas')
        .select(
            'id, nome, serie:series(id, turno_id, restricoes,' +
            ' componentes:series_componentes(aulas_presenciais, aulas_nao_presenciais,' +
            ' componente:componentes_curriculares(id, nome, sigla))),' +
            ' professores:turmas_professores(componente_id, professor:professores(id, nome_horario))'
        )
        .eq('escola_id', escolaId);

    const aulasDoHorario = ((aulasDeste ?? []) as any[]).map(mapearAula);

    return {
        ctx: {
            escolaId,
            turno: (horario as any).turno as Turno,
            turnosById,
            aulasDoHorario,
            aulasParaConflito: [...aulasDoHorario, ...aulasOutras.map(mapearAula)],
            professores,
            turmas: (turmas ?? []) as any[],
        },
    };
}

/** Teto de aulas da mesma disciplina no dia. Espelha o motor de geração. */
function tetoDoDia(aulasPorDia: number, cargaSemanal: number, dias: number): number {
    return Math.max(aulasPorDia >= 7 ? 4 : 3, Math.ceil(cargaSemanal / Math.max(1, dias)));
}

/**
 * O que ficou faltando em cada turma, e onde caberia.
 *
 * Deriva do cadastro comparado com a grade em vez de ler as pendências
 * gravadas: `PendenciaDetalhada` guarda só nomes, sem ids, e sem id não dá para
 * montar a aula que falta. A conta aqui é direta e não depende de a geração ter
 * gravado diagnóstico nenhum.
 */
export async function getVagasDoHorario(
    horarioId: string,
): Promise<{ data?: VagasDaTurma[]; error?: string }> {
    await requireEscolaDoRecurso('horarios', horarioId, 'horarios');
    const { ctx, error } = await carregarContexto(horarioId);
    if (!ctx) return { error };

    const doTurno = ctx.turmas.filter(t => t.serie?.turno_id === ctx.turno.id);
    const dias = ctx.turno.dias_semana ?? [];
    const resultado: VagasDaTurma[] = [];

    for (const turma of doTurno) {
        const aulasDaTurma = ctx.aulasDoHorario.filter(a => a.turma_id === turma.id);

        const colocadas = new Map<string, number>();
        for (const a of aulasDaTurma) {
            const k = `${a.componente_id}|${a.tipo}`;
            colocadas.set(k, (colocadas.get(k) ?? 0) + 1);
        }

        const professorDe = new Map<string, { id: string | null; nome: string }>();
        for (const tp of turma.professores ?? []) {
            professorDe.set(tp.componente_id, {
                id: tp.professor?.id ?? null,
                nome: tp.professor?.nome_horario ?? 'Sem professor',
            });
        }

        const faltando: AulaFaltando[] = [];
        for (const c of turma.serie?.componentes ?? []) {
            for (const tipo of ['presencial', 'nao_presencial'] as const) {
                const carga = tipo === 'presencial' ? c.aulas_presenciais ?? 0 : c.aulas_nao_presenciais ?? 0;
                if (carga <= 0) continue;
                const posto = colocadas.get(`${c.componente.id}|${tipo}`) ?? 0;
                if (posto >= carga) continue;
                const prof = professorDe.get(c.componente.id);
                faltando.push({
                    componente_id: c.componente.id,
                    componente_nome: c.componente.nome ?? '',
                    componente_sigla: c.componente.sigla ?? '',
                    professor_id: prof?.id ?? null,
                    professor_nome: prof?.nome ?? 'Sem professor',
                    tipo,
                    quantidade: carga - posto,
                });
            }
        }

        if (faltando.length === 0) continue;

        // Slot vago = horário do turno que a turma não usa e que a série não
        // proíbe. Slot proibido na série não é vaga: foi o usuário quem fechou.
        const ocupados = new Set(aulasDaTurma.map(a => `${a.dia_semana}|${a.aula_index}`));
        const restricoes = turma.serie?.restricoes ?? {};
        const slotsVagos: SlotVago[] = [];
        for (const dia of dias) {
            for (let i = 0; i < (ctx.turno.aulas_por_dia ?? 0); i++) {
                if (ocupados.has(`${dia}|${i}`)) continue;
                if (restricoes?.[dia]?.[i] === 'proibido') continue;
                const hor = ctx.turno.horarios?.[i];
                slotsVagos.push({
                    dia_semana: dia,
                    aula_index: i,
                    turno_id: ctx.turno.id,
                    inicio: hor?.inicio ?? null,
                    fim: hor?.fim ?? null,
                });
            }
        }

        resultado.push({
            turma_id: turma.id,
            turma_nome: turma.nome,
            slotsVagos,
            faltando,
        });
    }

    return { data: resultado };
}

export type EscolhaAlocacao = {
    turma_id: string;
    componente_id: string;
    tipo: 'presencial' | 'nao_presencial';
    dia_semana: string;
    aula_index: number;
};

/** Calcula as rotas de troca que preenchem uma vaga específica. */
export async function calcularAlocacao(
    horarioId: string,
    escolha: EscolhaAlocacao,
): Promise<{ data?: ResultadoAlocacao; error?: string }> {
    await requireEscolaDoRecurso('horarios', horarioId, 'horarios');
    const { ctx, error } = await carregarContexto(horarioId);
    if (!ctx) return { error };

    const turma = ctx.turmas.find(t => t.id === escolha.turma_id);
    if (!turma) return { error: 'Turma não encontrada neste horário.' };

    const comp = (turma.serie?.componentes ?? []).find((c: any) => c.componente?.id === escolha.componente_id);
    if (!comp) return { error: 'Esta disciplina não faz parte da grade da série desta turma.' };

    const prof = (turma.professores ?? []).find((p: any) => p.componente_id === escolha.componente_id);
    const carga = escolha.tipo === 'presencial'
        ? comp.aulas_presenciais ?? 0
        : comp.aulas_nao_presenciais ?? 0;

    const vaga: Vaga = {
        turma_id: turma.id,
        turma_nome: turma.nome,
        componente_id: escolha.componente_id,
        componente_nome: comp.componente?.nome ?? '',
        componente_sigla: comp.componente?.sigla ?? '',
        professor_id: prof?.professor?.id ?? null,
        professor_nome: prof?.professor?.nome_horario ?? 'Sem professor',
        tipo: escolha.tipo,
        turno_id: ctx.turno.id,
        dia_semana: escolha.dia_semana,
        aula_index: escolha.aula_index,
        // A grade salva não guarda a geminação usada, então o limite de emenda
        // assumido é o de quem NÃO pediu geminação: 2.
        limiteRun: 2,
        tetoDoDia: tetoDoDia(
            ctx.turno.aulas_por_dia ?? 0,
            carga,
            (ctx.turno.dias_semana ?? []).length || 5,
        ),
    };

    return {
        data: calcularAlocacaoComTrocas(
            ctx.aulasParaConflito,
            ctx.professores,
            ctx.turnosById,
            vaga,
        ),
    };
}

/**
 * Grava a rota escolhida.
 *
 * Revalida o estado antes de escrever, do mesmo jeito que `aplicarMudancasRefino`:
 * a rota foi calculada sobre a grade de alguns segundos atrás, e entre o cálculo
 * e o clique alguém pode ter mexido. Gravar sobre uma rota velha produz um
 * horário que ninguém pediu.
 */
export async function aplicarAlocacao(
    horarioId: string,
    movimentos: MovimentoAlocacao[],
): Promise<{ success?: true; error?: string }> {
    await requireEscolaDoRecurso('horarios', horarioId, 'horarios');
    if (!movimentos || movimentos.length === 0) return { error: 'Nenhuma troca recebida.' };

    const supabase = await createClient();

    const idsParaTrocar = movimentos
        .filter((m): m is Extract<MovimentoAlocacao, { tipo: 'reatribuir' }> => m.tipo === 'reatribuir')
        .map(m => m.aulaId);

    if (idsParaTrocar.length > 0) {
        const { data: atuais, error: lerErr } = await supabase
            .from('horario_aulas')
            .select('id, horario_id, aula_fixa_id')
            .in('id', idsParaTrocar);

        if (lerErr) return { error: 'Não foi possível conferir o estado atual das aulas antes de gravar.' };
        if (!atuais || atuais.length !== idsParaTrocar.length) {
            return {
                error: 'Uma ou mais aulas da rota não existem mais. A rota está desatualizada — recarregue a página e calcule de novo.',
            };
        }
        const travada = (atuais as any[]).find(a => a.aula_fixa_id);
        if (travada) {
            return {
                error: 'A rota inclui uma aula travada, que não pode mudar de professor. Altere a fixação no modelo da série.',
            };
        }
    }

    for (const m of movimentos) {
        if (m.tipo === 'criar') {
            const { error } = await supabase.from('horario_aulas').insert({
                horario_id: horarioId,
                turma_id: m.turma_id,
                componente_id: m.componente_id,
                professor_id: m.professor_id,
                dia_semana: m.dia_semana,
                aula_index: m.aula_index,
                tipo: m.tipo_aula,
                turno_id: m.turno_id,
            });
            if (error) {
                return {
                    error: `Não foi possível criar a aula no horário vago. Nenhuma outra troca foi aplicada. Detalhe: ${error.message}`,
                };
            }
        } else {
            const { error } = await supabase
                .from('horario_aulas')
                .update({ professor_id: m.professor_id })
                .eq('id', m.aulaId);
            if (error) {
                return {
                    error:
                        'A aula foi criada, mas uma das trocas de professor falhou — o horário pode ter ficado ' +
                        `incompleto. Recarregue a página e confira. Detalhe: ${error.message}`,
                };
            }
        }
    }

    revalidatePath('/gerarhorarios');
    revalidatePath('/visualizarhorario');
    revalidatePath('/refinodehorario');
    return { success: true };
}
