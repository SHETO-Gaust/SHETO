/**
 * Bancada de medição do motor de geração.
 *
 * Roda a busca com um orçamento fixo e reporta quantas aulas ficaram de fora e
 * em quanto tempo. É a única forma de saber se uma mudança no motor melhorou
 * alguma coisa — o resultado é estocástico, então comparar duas execuções "no
 * olho" não diz nada.
 *
 *   npx tsx scripts/bancada-motor.ts <escola> <turnoId> <orcamento> [repeticoes]
 *
 * Sem argumentos, roda o conjunto padrão de escolas de referência.
 */
import 'dotenv/config';
import { getPool } from '../src/lib/db/pool';
import { carregarDadosDaGeracao } from '../src/lib/geracao/dados';
import { gerarHorarioEmWorker } from '../src/lib/timetabling-pool';

type Caso = { escola: string; turno: string; rotulo: string };

/** Escolas de referência: uma que não fecha, uma que fecha. */
const PADRAO: Caso[] = [
    { escola: '1120', turno: '0de2fef3-9115-4b0c-a76a-fd859ea1a0a0', rotulo: '1120 Integral (9 turmas, 405/405 — nao fecha)' },
    { escola: '1344', turno: '17090393-7afc-4b6a-b0bf-f3dc72fe2ca7', rotulo: '1344 Integral (22 turmas — fecha)' },
];

/**
 * Confere que a grade devolvida respeita as restrições que o motor promete nunca
 * violar. Um motor mais rápido que produz grade inválida não vale nada, e o
 * número de pendências sozinho não denuncia isso.
 */
function validar(aulas: any[], dados: any): string[] {
    const erros: string[] = [];
    const turnos = new Map<string, any>(dados.allTurnos.map((t: any) => [t.id, t]));
    const profs = new Map<string, any>(dados.allProfessores.map((p: any) => [p.id, p]));

    // Uma turma não pode ter duas aulas no mesmo slot
    const slotsTurma = new Set<string>();
    for (const a of aulas) {
        const k = `${a.turma_id}|${a.turno_id}|${a.dia_semana}|${a.aula_index}`;
        if (slotsTurma.has(k)) erros.push(`turma com duas aulas no mesmo slot: ${k}`);
        slotsTurma.add(k);
    }

    // Um professor não pode estar em duas turmas ao mesmo tempo
    const slotsProf = new Map<string, string>();
    for (const a of aulas) {
        if (!a.professor_id) continue;
        const k = `${a.professor_id}|${a.dia_semana}|${a.turno_id}|${a.aula_index}`;
        const ja = slotsProf.get(k);
        if (ja && ja !== a.turma_id) erros.push(`professor em duas turmas ao mesmo tempo: ${k}`);
        slotsProf.set(k, a.turma_id);
    }

    // BAN e reunião de fluxo são intransponíveis
    for (const a of aulas) {
        const p = profs.get(a.professor_id);
        const st = p?.restricoes?.[a.turno_id]?.[a.dia_semana]?.[a.aula_index];
        if (st === 'indisponivel') erros.push(`aula em slot BAN: ${p?.nome_horario} ${a.dia_semana}/${a.aula_index}`);
        if (st === 'reuniao_fluxo') erros.push(`aula em reuniao de fluxo: ${p?.nome_horario} ${a.dia_semana}/${a.aula_index}`);
    }

    // Nenhuma turma pode receber mais aulas de um componente do que a carga
    const carga = new Map<string, number>();
    for (const t of dados.turmasDoTurno) {
        for (const c of t.serie.componentes || []) {
            carga.set(`${t.id}|${c.componente_id}|presencial`, c.aulas_presenciais || 0);
            carga.set(`${t.id}|${c.componente_id}|nao_presencial`, c.aulas_nao_presenciais || 0);
        }
    }
    const contagem = new Map<string, number>();
    for (const a of aulas) {
        const k = `${a.turma_id}|${a.componente_id}|${a.tipo}`;
        contagem.set(k, (contagem.get(k) ?? 0) + 1);
    }
    for (const [k, n] of contagem) {
        const max = carga.get(k) ?? 0;
        if (n > max) erros.push(`aulas a mais: ${k} tem ${n}, carga e ${max}`);
    }

    // Travamentos precisam continuar nos seus slots
    for (const f of dados.aulasFixas) {
        const achou = aulas.some((a: any) =>
            a.turma_id === f.turma_id && a.componente_id === f.componente_id &&
            a.dia_semana === f.dia_semana && a.aula_index === f.aula_index);
        if (!achou) erros.push(`travamento perdido: turma ${f.turma_id} ${f.dia_semana}/${f.aula_index}`);
    }

    void turnos;
    return [...new Set(erros)];
}

async function medir(caso: Caso, orcamento: number, repeticoes: number) {
    const dados = await carregarDadosDaGeracao(caso.escola, caso.turno, ['publicado', 'em_rascunho', 'pre_producao']);

    const resultados: { pendentes: number; aulas: number; ms: number; fechou: boolean }[] = [];

    for (let r = 0; r < repeticoes; r++) {
        const t0 = Date.now();
        // Cada repetição parte de um offset diferente: a semente é o índice global,
        // então repetir com offset 0 devolveria exatamente o mesmo resultado e a
        // "média de 3 execuções" seria uma única execução contada três vezes.
        const res = await gerarHorarioEmWorker(
            [
                dados.turnoData as any, dados.turmasDoTurno, dados.allProfessores, dados.allTurnos,
                [], false, dados.ocupacoes,
                orcamento, r * orcamento, dados.aulasFixas, false, orcamento, false,
            ] as any,
            () => { }
        );
        const ms = Date.now() - t0;
        const problemas = validar(res.aulas, dados);
        resultados.push({
            pendentes: res.success ? 0 : res.melhorPendentes,
            aulas: res.aulas.length,
            ms,
            fechou: res.success,
        });
        process.stdout.write(
            `  rep ${r + 1}/${repeticoes}: ${res.success ? 'FECHOU' : `${res.melhorPendentes} pendentes`}` +
            ` | ${res.aulas.length} aulas | ${(ms / 1000).toFixed(1)}s` +
            ` | ${problemas.length === 0 ? 'grade valida' : `INVALIDA (${problemas.length}): ${problemas.slice(0, 3).join(' ; ')}`}\n`
        );
    }

    const pend = resultados.map(x => x.pendentes);
    const media = pend.reduce((a, b) => a + b, 0) / pend.length;
    const msMedio = resultados.reduce((a, b) => a + b.ms, 0) / resultados.length;
    const fechou = resultados.filter(x => x.fechou).length;

    console.log(`\n  ${caso.rotulo}`);
    console.log(`  orcamento=${orcamento} | fechou ${fechou}/${repeticoes} vez(es)`);
    console.log(`  pendentes: melhor=${Math.min(...pend)} pior=${Math.max(...pend)} media=${media.toFixed(1)}`);
    console.log(`  tempo medio: ${(msMedio / 1000).toFixed(1)}s | ${(msMedio / orcamento).toFixed(2)}ms por tentativa\n`);

    return { rotulo: caso.rotulo, melhor: Math.min(...pend), media, msMedio, fechou, repeticoes };
}

async function main() {
    const [escola, turno, orcamentoArg, repeticoesArg] = process.argv.slice(2);
    const orcamento = Number(orcamentoArg || 3000);
    const repeticoes = Number(repeticoesArg || 3);

    const casos = escola && turno ? [{ escola, turno, rotulo: `${escola} / ${turno}` }] : PADRAO;

    console.log(`=== bancada do motor | ${new Date().toISOString()} ===\n`);
    const linhas = [];
    for (const caso of casos) {
        linhas.push(await medir(caso, orcamento, repeticoes));
    }

    console.log('=== resumo ===');
    for (const l of linhas) {
        console.log(`${l.rotulo}\n  melhor=${l.melhor} media=${l.media.toFixed(1)} fechou=${l.fechou}/${l.repeticoes} tempo=${(l.msMedio / 1000).toFixed(1)}s`);
    }

    await getPool().end();
}

main().catch(e => { console.error(e); process.exit(1); });
