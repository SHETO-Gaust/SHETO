
'use server';

import { createClient } from '@/lib/supabase/server';
import type { ChecklistReportData, TurmaComDados, ProfessorComDados, Turno } from '@/lib/types';
import { getTurmas } from '@/app/(app)/turmas/actions';
import { getProfessores } from '@/app/(app)/professores/actions';
import { getTurnos } from '@/app/(app)/turno/actions';
import { requireEscolaEModulo } from '@/lib/auth/guards';
import {
    motivoImpedimento,
    ROTULO_IMPEDIMENTO,
    calcularTurmasSemFolga,
    tamanhoMaximoEmparelhamento,
    adjacenciaDoSlot,
    type MotivoImpedimento,
} from '@/lib/geracao/certificado';

/**
 * Relatório 1: Checklist de Dados
 */
export async function getChecklistReportData(escolaId: string, turnoId: string): Promise<{ data?: ChecklistReportData; error?: string }> {
    await requireEscolaEModulo(escolaId, 'horarios');
  const supabase = await createClient();

  try {
    const [
      turnosResult,
      niveisEnsinoResult,
      componentesResult,
      professoresResult,
      turmasResult,
      seriesResult,
    ] = await Promise.all([
      getTurnos(escolaId),
      supabase.from('niveis_ensino').select('id', { count: 'exact', head: true }).eq('escola_id', escolaId),
      supabase.from('componentes_curriculares').select('id', { count: 'exact', head: true }).eq('escola_id', escolaId),
      getProfessores(escolaId),
      getTurmas(escolaId),
      supabase.from('series').select('id, nome, turno_id, series_componentes(aulas_presenciais, aulas_nao_presenciais, componente_id)').eq('escola_id', escolaId),
    ]);

    // Cada leitura precisa ser conferida. Sem isto, uma falha de banco virava
    // `[]` e o checklist respondia "Ensalamento: ok" — o pior desfecho possível
    // para uma tela cuja única função é dizer se o cadastro está completo.
    if (turnosResult.error) throw new Error('Falha ao buscar turnos.');
    if (professoresResult.error) throw new Error(professoresResult.error);
    if (turmasResult.error) throw new Error(turmasResult.error);
    if (seriesResult.error) throw new Error('Falha ao buscar séries.');

    const allTurnos = turnosResult.data || [];
    const allProfessores = professoresResult.data || [];
    const allTurmas = turmasResult.data || [];
    const allSeries = seriesResult.data || [];
    
    const selectedTurno = allTurnos.find(t => t.id === turnoId);
    const seriesDoTurno = allSeries.filter(s => s.turno_id === turnoId);
    const turmasDoTurno = allTurmas.filter(t => t.serie.turno_id === turnoId);
    const professoresDoTurno = allProfessores.filter(p => p.turnos_ids.includes(turnoId));

    const checklist: ChecklistReportData = [];

    // 1. Turno
    checklist.push({
        id: '1',
        title: 'Configuração do Turno',
        description: 'Verifica se os dias e horários das aulas foram definidos.',
        status: selectedTurno && selectedTurno.horarios?.length ? 'ok' : 'error',
        details: !(selectedTurno && selectedTurno.horarios?.length) ? 'Horários das aulas não configurados.' : '',
        link: '/turno'
    });
    
    // 2. Séries
    const seriesIncompletas = seriesDoTurno.filter(s => {
        const total = (s.series_componentes as any[]).reduce((acc, curr) => acc + (curr.aulas_presenciais || 0), 0);
        const esperado = (selectedTurno?.aulas_por_dia || 0) * (selectedTurno?.dias_semana?.length || 0);
        return total !== esperado;
    });
    checklist.push({
        id: '2',
        title: 'Carga Horária das Séries',
        description: 'A soma das aulas das disciplinas deve bater com a grade do turno.',
        status: seriesIncompletas.length > 0 ? 'warning' : 'ok',
        details: seriesIncompletas.length > 0 ? `Séries com carga divergente: ${seriesIncompletas.map(s => s.nome).join(', ')}` : '',
        link: '/serie'
    });

    // 3. Ensalamento
    const turmasIncompletas = turmasDoTurno.filter(t => {
        const componentesObrigatorios = t.serie.componentes.filter(c => (c.aulas_presenciais || 0) > 0);
        const alocados = t.professores.map(p => p.componente_id);
        return componentesObrigatorios.some(c => !alocados.includes(c.componente_id));
    });
    checklist.push({
        id: '3',
        title: 'Vínculo de Professores (Ensalamento)',
        description: 'Todas as disciplinas das turmas devem ter um professor associado.',
        status: turmasIncompletas.length > 0 ? 'error' : 'ok',
        details: turmasIncompletas.length > 0 ? `${turmasIncompletas.length} turmas possuem disciplinas sem professor.` : '',
        link: '/turmas'
    });

    return { data: checklist };
  } catch (error: any) {
    return { error: error.message };
  }
}

/**
 * Relatório 2: Carga Horária Docente (Audit)
 */
export async function getWorkloadReportData(escolaId: string, turnoId: string) {
    await requireEscolaEModulo(escolaId, 'horarios');
    const [turmasRes, professoresRes] = await Promise.all([
        getTurmas(escolaId),
        getProfessores(escolaId),
    ]);

    // "Dados insuficientes" escondia a causa real: uma falha de leitura chegava
    // ao usuário com a mesma frase de um cadastro vazio, e a única pista ficava
    // no console do servidor. Foi assim que a tabela `turmas_aulas_fixas`
    // ausente passou por erro do relatório.
    if (turmasRes.error) return { error: turmasRes.error };
    if (professoresRes.error) return { error: professoresRes.error };

    const turmas = turmasRes.data;
    const professores = professoresRes.data;
    if (!turmas || !professores) return { error: 'Dados insuficientes.' };

    const report = professores.map(prof => {
        let totalAtribuido = 0;
        const detalhes: any[] = [];

        turmas.forEach(t => {
            t.professores.forEach(p => {
                if (p.professor_id === prof.id) {
                    const comp = t.serie.componentes.find(c => c.componente_id === p.componente_id);
                    if (comp) {
                        const aulas = (comp.aulas_presenciais || 0) + (comp.aulas_nao_presenciais || 0);
                        totalAtribuido += aulas;
                        detalhes.push({ 
                            turma: t.nome, 
                            serie: t.serie.nome, 
                            aulas, 
                            disciplina: (comp as any).componente?.nome || 'Disciplina' 
                        });
                    }
                }
            });
        });

        return {
            id: prof.id,
            nome: prof.nome_horario,
            disponivel: prof.aulas_disponiveis,
            atribuido: totalAtribuido,
            saldo: prof.aulas_disponiveis - totalAtribuido,
            detalhes
        };
    }).sort((a, b) => a.nome.localeCompare(b.nome));

    return { data: report };
}

/**
 * Relatório 3: Mapa de Gargalos (Heatmap de Disponibilidade)
 *
 * A contagem antiga somava todo professor do turno que não estivesse marcado
 * como `indisponivel`/`planejamento`, e por isso mentia em duas frentes:
 *
 *  1. ignorava REUNIÃO DE FLUXO e LIVRE DOCÊNCIA, que o motor trata como hard
 *     constraint igual ao bloqueio — professor em folga aparecia como livre;
 *  2. contava `planejamento` como impedimento, quando na verdade é soft (o motor
 *     pode invadir o planejamento como último recurso);
 *  3. contava professor do turno que não leciona em nenhuma turma dele, e que
 *     portanto não cobre horário nenhum.
 *
 * Os impedimentos vêm de `motivoImpedimento`, a mesma função usada pelo
 * certificado de inviabilidade e espelhada em `scripts/comparar-ambientes.sql`,
 * para que os três nunca divirjam.
 *
 * O número exibido NÃO é a contagem de professores livres, e sim quantas turmas
 * conseguem ter aula ao mesmo tempo — o emparelhamento máximo do certificado.
 * Contagem simples dá falso-verde: cinco professores livres que só lecionam na
 * mesma turma atendem UMA turma, não cinco.
 */

/** Quantos nomes de impedidos vão no tooltip antes de virar "e mais N". */
const LIMITE_IMPEDIDOS_LISTADOS = 8;

export async function getBottleneckReportData(escolaId: string, turnoId: string) {
    await requireEscolaEModulo(escolaId, 'horarios');

    try {
        const supabase = await createClient();
        const [turnoRes, turmasRes, professoresRes] = await Promise.all([
            supabase.from('turnos').select('*').eq('id', turnoId).eq('escola_id', escolaId).single(),
            getTurmas(escolaId),
            getProfessores(escolaId),
        ]);

        // Falha de leitura não pode virar "cadastro vazio". Sem esta distinção um
        // banco fora do ar produzia mapa inteiro verde e a mensagem tranquilizadora
        // "Nenhuma turma cadastrada neste turno".
        if (turnoRes.error || !turnoRes.data) {
            return { error: turnoRes.error?.message
                ? `Não foi possível ler o turno: ${turnoRes.error.message}`
                : 'Turno não encontrado nesta unidade.' };
        }
        if (turmasRes.error) return { error: turmasRes.error };
        if (professoresRes.error) return { error: professoresRes.error };

        const turno = turnoRes.data;
        const professores = professoresRes.data || [];
        const turmas = (turmasRes.data || []).filter(t => t.serie?.turno_id === turnoId);

        const numTurmas = turmas.length;
        const dias: string[] = turno.dias_semana || [];
        const aulas: number = turno.aulas_por_dia || 0;
        const capacidade = dias.length * aulas;

        const professoresDoTurno = professores.filter(p => (p.turnos_ids || []).includes(turnoId));
        const profsPorId = new Map(professores.map(p => [p.id, p]));

        // Professor só cobre horário se estiver vinculado a alguma turma do turno,
        // numa disciplina com aula presencial. Sem vínculo ele existe no cadastro,
        // mas não pode assumir nenhuma das turmas contadas em `necessarios`.
        const vinculados = new Set<string>();
        for (const t of turmas) {
            for (const v of t.professores || []) {
                const comp = (t.serie?.componentes || []).find(c => c.componente_id === v.componente_id);
                if (comp && (comp.aulas_presenciais || 0) > 0) vinculados.add(v.professor_id);
            }
        }

        const turmasSemFolga = calcularTurmasSemFolga(turmas, capacidade);
        const todasSemFolga = turmasSemFolga.length === numTurmas;

        const heatmap = dias.map(dia => {
            const slots = Array.from({ length: aulas }).map((_, idx) => {
                const impedidos: { nome: string; motivo: MotivoImpedimento }[] = [];
                const porMotivo: Record<MotivoImpedimento, number> = { indisponivel: 0, reuniao_fluxo: 0, livre_docencia: 0 };
                let semImpedimentoNoTurno = 0;  // todos do turno, vinculados ou não
                let aptos = 0;                  // vinculados e sem impedimento
                let planejamento = 0;           // soft: só entra se o motor relaxar

                for (const p of professoresDoTurno) {
                    const motivo = motivoImpedimento(p, turno, dia, idx);
                    if (motivo) {
                        // Só os vinculados entram nos selos: eles têm de explicar
                        // exatamente o número exibido. Contar impedimento de quem
                        // não leciona em turma nenhuma faz a subtração não fechar.
                        if (vinculados.has(p.id)) {
                            porMotivo[motivo]++;
                            impedidos.push({ nome: p.nome_horario, motivo });
                        }
                        continue;
                    }
                    semImpedimentoNoTurno++;
                    if (!vinculados.has(p.id)) continue;
                    aptos++;
                    // Também só entre os vinculados: o "+N em planejamento" fica ao
                    // lado dos selos e tem de falar do mesmo grupo de professores.
                    if (p.restricoes?.[turnoId]?.[dia]?.[idx] === 'planejamento') planejamento++;
                }

                // Quantas turmas conseguem ter aula simultaneamente aqui.
                const atendiveis = tamanhoMaximoEmparelhamento(
                    adjacenciaDoSlot(turmas, profsPorId, turno, dia, idx));
                const atendiveisSemFolga = todasSemFolga
                    ? atendiveis
                    : tamanhoMaximoEmparelhamento(
                        adjacenciaDoSlot(turmasSemFolga, profsPorId, turno, dia, idx));

                return {
                    aula: idx + 1,
                    atendiveis,
                    aptos,
                    semImpedimentoNoTurno,
                    planejamento,
                    totalTurno: professoresDoTurno.length,
                    porMotivo,
                    impedidos: impedidos.slice(0, LIMITE_IMPEDIDOS_LISTADOS),
                    impedidosOcultos: Math.max(0, impedidos.length - LIMITE_IMPEDIDOS_LISTADOS),
                    necessarios: numTurmas,
                    conflito: atendiveis < numTurmas,
                    // Concentração: há professores livres de sobra, mas eles se
                    // acumulam nas mesmas turmas e não dá para espalhar.
                    concentracao: aptos >= numTurmas && atendiveis < numTurmas,
                    impossivel: turmasSemFolga.length > 0 && atendiveisSemFolga < turmasSemFolga.length,
                };
            });
            return { dia, slots };
        });

        // ── Verificações: o que exatamente derruba a cobertura, e onde ───────────
        const verificacoes: {
            tipo: 'ok' | 'alerta' | 'erro';
            titulo: string;
            detalhe: string;
            acao?: string;
        }[] = [];

        const criticos = heatmap.flatMap(d => d.slots.filter(s => s.conflito).map(s => ({ dia: d.dia, ...s })));
        const provados = criticos.filter(s => s.impossivel);
        const concentrados = criticos.filter(s => s.concentracao);

        const totalPorMotivo = criticos.reduce(
            (acc, s) => {
                (Object.keys(acc) as MotivoImpedimento[]).forEach(m => { acc[m] += s.porMotivo[m]; });
                return acc;
            },
            { indisponivel: 0, reuniao_fluxo: 0, livre_docencia: 0 } as Record<MotivoImpedimento, number>,
        );

        for (const motivo of ['indisponivel', 'reuniao_fluxo', 'livre_docencia'] as MotivoImpedimento[]) {
            if (totalPorMotivo[motivo] === 0) continue;
            verificacoes.push({
                tipo: 'alerta',
                titulo: `${ROTULO_IMPEDIMENTO[motivo]}: ${totalPorMotivo[motivo]} impedimento(s) em horários críticos`,
                detalhe: `Nos horários em que faltam professores, ${totalPorMotivo[motivo]} marcação(ões) de ` +
                    `"${ROTULO_IMPEDIMENTO[motivo]}" tiram da conta um professor que leciona em turma deste turno. ` +
                    `O motor nunca ignora esse tipo de marcação, nem como último recurso.`,
                acao: motivo === 'livre_docencia'
                    ? 'Revise a livre docência em Professores → Restrições (o período inteiro fica vedado, não só uma aula).'
                    : 'Revise as células desse tipo em Professores → Restrições.',
            });
        }

        if (capacidade === 0) {
            verificacoes.push({
                tipo: 'erro',
                titulo: 'O turno não tem horários configurados',
                detalhe: `O turno ${turno.nome} está com ${dias.length} dia(s) e ${aulas} aula(s) por dia. ` +
                    `Sem grade de horários não há o que verificar.`,
                acao: 'Configure os dias e as aulas do turno em Turnos.',
            });
        } else if (numTurmas === 0) {
            verificacoes.push({
                tipo: 'alerta',
                titulo: 'Nenhuma turma cadastrada neste turno',
                detalhe: 'Sem turmas não há exigência de cobertura, então o mapa não aponta gargalo nenhum.',
                acao: 'Cadastre as turmas do turno em Turmas.',
            });
        } else if (provados.length > 0) {
            verificacoes.push({
                tipo: 'erro',
                titulo: `${provados.length} horário(s) comprovadamente impossível(is)`,
                detalhe: `${turmasSemFolga.length} turma(s) preenchem todos os ${capacidade} horários do turno e ` +
                    `precisam de aula em todos eles, mas nesses horários não existe distribuição que dê um ` +
                    `professor diferente a cada uma. Nenhuma arrumação fecha a grade sem mudar o cadastro.`,
                acao: 'Libere um horário bloqueado dessas turmas ou reduza a carga de uma delas.',
            });
        } else if (criticos.length > 0) {
            verificacoes.push({
                tipo: 'alerta',
                titulo: `${criticos.length} horário(s) sem professores para todas as turmas`,
                detalhe: `Como nenhuma turma preenche o turno inteiro, a grade ainda pode fechar deixando alguma ` +
                    `turma sem aula nesses horários — mas a margem é pequena.`,
            });
        } else {
            verificacoes.push({
                tipo: 'ok',
                titulo: 'Todos os horários conseguem atender todas as turmas',
                detalhe: `Considerando bloqueio, reunião de fluxo e livre docência, em todos os ${capacidade} ` +
                    `horários do turno é possível dar um professor diferente a cada uma das ${numTurmas} turmas.`,
            });
        }

        if (concentrados.length > 0) {
            verificacoes.push({
                tipo: 'alerta',
                titulo: `${concentrados.length} horário(s) com professores concentrados nas mesmas turmas`,
                detalhe: `Nesses horários há professores livres em número suficiente, mas eles lecionam nas ` +
                    `mesmas turmas — não dá para dar um professor diferente a cada uma. A contagem simples ` +
                    `mostraria esses horários como tranquilos.`,
                acao: 'Distribua as disciplinas entre mais professores, ou libere um horário de quem atende as turmas descobertas.',
            });
        }

        const semVinculo = professoresDoTurno.filter(p => !vinculados.has(p.id));
        if (semVinculo.length > 0) {
            const nomes = semVinculo.slice(0, 15).map(p => p.nome_horario).join(', ');
            verificacoes.push({
                tipo: 'alerta',
                titulo: `${semVinculo.length} professor(es) do turno sem turma`,
                detalhe: `${nomes}${semVinculo.length > 15 ? ` e mais ${semVinculo.length - 15}` : ''} ` +
                    `está(ão) no turno mas não leciona(m) em nenhuma turma dele. Aparecem como livres, mas não ` +
                    `cobrem horário nenhum — por isso não entram na contagem de cobertura.`,
                acao: 'Vincule-os em Turmas → Alocar Professores, ou remova o turno do cadastro deles.',
            });
        }

        return {
            data: {
                heatmap,
                numTurmas,
                turmasSemFolga: turmasSemFolga.length,
                totalProfessoresTurno: professoresDoTurno.length,
                professoresVinculados: vinculados.size,
                capacidade,
                verificacoes,
                turnoNome: turno.nome,
            },
        };
    } catch (error: any) {
        console.error('Erro no Mapa de Disponibilidade:', error);
        return { error: error?.message || 'Não foi possível gerar o mapa de disponibilidade.' };
    }
}
