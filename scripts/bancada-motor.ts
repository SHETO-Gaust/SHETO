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
import { config as carregarEnv } from 'dotenv';

/**
 * As credenciais deste projeto moram em `.env.local` — `.env` não existe.
 *
 * `import 'dotenv/config'` lê apenas `.env`, então a bancada subia sem PGPASSWORD
 * e morria com "SASL: client password must be a string", um erro que não diz
 * nada sobre a causa. Ler os dois arquivos mantém a convenção do repositório
 * (mesma de `scripts/aplicar-migration.js`) sem impedir um `.env` no futuro.
 *
 * Roda antes de qualquer consulta porque o pool é preguiçoso: `getPool()` só
 * chama `new Pool()` — que é quem lê PGHOST/PGUSER/PGPASSWORD — na primeira
 * consulta, bem depois deste ponto.
 */
carregarEnv({ path: '.env.local' });
carregarEnv();

import { getPool } from '../src/lib/db/pool';
import { carregarDadosDaGeracao } from '../src/lib/geracao/dados';
import { gerarHorarioEmWorker } from '../src/lib/timetabling-pool';

type Caso = { escola: string; turno: string; rotulo: string };

/** Distância entre as sementes de duas repetições. Ver o uso, mais abaixo. */
const PASSO_DA_SEMENTE = 1_000_003;

/** Escolas de referência: uma que não fecha, uma que fecha. */
const PADRAO: Caso[] = [
    { escola: '1120', turno: '0de2fef3-9115-4b0c-a76a-fd859ea1a0a0', rotulo: '1120 Integral (9 turmas, 405/405 — nao fecha)' },
    { escola: '1344', turno: '17090393-7afc-4b6a-b0bf-f3dc72fe2ca7', rotulo: '1344 Integral (22 turmas — fecha)' },
];

/**
 * A regra do dia, reimplementada aqui de propósito.
 *
 * A bancada é instrumento de medida: se ela chamasse a função do motor, mediria
 * o motor com a régua do próprio motor e aprovaria qualquer regra que ele
 * decidisse aplicar. A leitura independente é o que faz o `INVALIDA` significar
 * alguma coisa — foi ela que pegou os dois vazamentos do reparo.
 *
 * Devolve o motivo, ou null quando o dia está bom.
 */
function motivoDaRegraDoDia(
    indices: number[], limiteRun: number, teto: number,
): string | null {
    const ord = [...new Set(indices)].sort((a, b) => a - b);
    if (ord.length === 0) return null;
    if (ord.length > teto) return `${ord.length} aulas no dia (teto ${teto})`;

    const corridas: { ini: number; fim: number; tam: number }[] = [];
    let i = 0;
    while (i < ord.length) {
        let fim = i;
        while (fim + 1 < ord.length && ord[fim + 1] === ord[fim] + 1) fim++;
        corridas.push({ ini: ord[i], fim: ord[fim], tam: fim - i + 1 });
        i = fim + 1;
    }

    for (const c of corridas) {
        if (c.tam > limiteRun) return `emenda de ${c.tam} (teto ${limiteRun})`;
    }

    for (let k = 1; k < corridas.length; k++) {
        const vao = corridas[k].ini - corridas[k - 1].fim - 1;
        const minimo = corridas[k - 1].tam >= 2 || corridas[k].tam >= 2 ? 2 : 1;
        if (vao < minimo) return `vao de ${vao} entre grupos (minimo ${minimo})`;
    }
    return null;
}

/**
 * Confere que a grade devolvida respeita as restrições que o motor promete nunca
 * violar. Um motor mais rápido que produz grade inválida não vale nada, e o
 * número de pendências sozinho não denuncia isso.
 */
function validar(aulas: any[], dados: any, configGerminacao: any[] = []): string[] {
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

    /**
     * A regra do dia: emenda, espaçamento e teto.
     *
     * Isto é hard constraint, não estética: uma turma com três aulas seguidas
     * de Matemática que ninguém pediu é uma grade que a escola não consegue
     * usar. Enquanto esta verificação não existia, a bancada contava como
     * "FECHOU" grades com quatro aulas emendadas — media sucesso onde havia
     * falha, que é o pior desfecho possível para um instrumento de medida.
     *
     * Repetir a disciplina no dia é permitido desde que as aulas respirem — 1
     * aula livre entre avulsas, 2 quando há dupla envolvida. Houve aqui um teto
     * de contagem puro, no máximo 2 no dia, e ele reprovava o espaçado junto com
     * o colado.
     *
     * O teto é o do motor, e o critério é UM só: emenda que o usuário pediu
     * pode ter qualquer tamanho; emenda que ele não pediu para em 2. Pedir tem
     * duas formas, e as duas valem:
     *   - marcar geminação na tela (o teto vira o tamanho do bloco);
     *   - travar as aulas em `turmas_aulas_fixas` (o teto vira o tamanho da
     *     sequência travada — quem fixou quatro aulas seguidas quer quatro).
     *
     * A chave inclui o turno: `aula_index` recomeça do zero em cada turno, e
     * juntar dois turnos no mesmo dia faria a 1ª aula de um parecer vizinha da
     * última do outro.
     *
     * O teto de contagem é 4 num dia de 7 aulas ou mais e 3 nos demais,
     * levantado pelo piso aritmético `ceil(carga semanal / dias do turno)` —
     * abaixo dele não existe grade nenhuma, então acusar ali seria acusar o
     * impossível, não o defeito — e também pelo bloco pedido na tela e pelas
     * aulas travadas naquele dia, porque travar é pedir.
     */
    const chaveGrupo = (a: any) => `${a.turma_id}|${a.componente_id}|${a.tipo}|${a.turno_id}|${a.dia_semana}`;

    /** Maior sequência travada de cada grupo — é o piso do teto daquele dia. */
    const travadoPorGrupo = new Map<string, number>();
    const fixasPorGrupo = new Map<string, number[]>();
    for (const f of dados.aulasFixas) {
        const k = `${f.turma_id}|${f.componente_id}|${f.tipo_aula}|${dados.turnoData.id}|${f.dia_semana}`;
        const lista = fixasPorGrupo.get(k);
        if (lista) lista.push(f.aula_index); else fixasPorGrupo.set(k, [f.aula_index]);
    }
    for (const [k, indices] of fixasPorGrupo) {
        indices.sort((x: number, y: number) => x - y);
        let maior = 0, i = 0;
        while (i < indices.length) {
            let fim = i;
            while (fim + 1 < indices.length && indices[fim + 1] === indices[fim] + 1) fim++;
            maior = Math.max(maior, fim - i + 1);
            i = fim + 1;
        }
        travadoPorGrupo.set(k, maior);
    }

    /** Carga semanal de cada `turma|componente|tipo`, direto do cadastro. */
    const cargaSemanal = new Map<string, number>();
    for (const t of dados.turmasDoTurno) {
        for (const c of t.serie?.componentes || []) {
            cargaSemanal.set(`${t.id}|${c.componente_id}|presencial`, c.aulas_presenciais || 0);
            cargaSemanal.set(`${t.id}|${c.componente_id}|nao_presencial`, c.aulas_nao_presenciais || 0);
        }
    }

    const indicesPorGrupoDia = new Map<string, number[]>();
    for (const a of aulas) {
        const k = chaveGrupo(a);
        const lista = indicesPorGrupoDia.get(k);
        if (lista) lista.push(a.aula_index); else indicesPorGrupoDia.set(k, [a.aula_index]);
    }
    for (const [k, indices] of indicesPorGrupoDia) {
        const [turmaId, componenteId, tipo, turnoIdDoGrupo] = k.split('|');
        const cfg = configGerminacao.find((g: any) => g.componente_id === componenteId);
        const pedidoNaTela = cfg?.geminar && cfg.tamanho_bloco > 1 ? cfg.tamanho_bloco : 2;
        const teto = Math.max(pedidoNaTela, travadoPorGrupo.get(k) ?? 0);

        const turnoDoGrupo = turnos.get(turnoIdDoGrupo);
        const diasDoTurno = turnoDoGrupo?.dias_semana?.length || 5;
        const piso = Math.ceil(
            (cargaSemanal.get(`${turmaId}|${componenteId}|${tipo}`) ?? 0) / Math.max(1, diasDoTurno)
        );
        const tetoDia = Math.max(
            (turnoDoGrupo?.aulas_por_dia ?? 0) >= 7 ? 4 : 3,
            piso,
            pedidoNaTela,
            fixasPorGrupo.get(k)?.length ?? 0,
        );

        const motivo = motivoDaRegraDoDia(indices, teto, tetoDia);
        if (motivo) {
            const quais = [...indices].sort((x, y) => x - y).map(x => x + 1).join(',');
            erros.push(`${motivo}: ${k} nas aulas ${quais}`);
        }
    }

    return [...new Set(erros)];
}

/**
 * Lê da grade, por fora do motor, quais geminações não foram cumpridas.
 *
 * Não é uma validação de "certo/errado": numa escola apertada pode genuinamente
 * não haver arranjo que caiba, e isso não é defeito. O defeito é o motor não
 * DIZER — por isso quem chama compara esta lista com o `geminacoesQuebradas`
 * que ele devolveu. Divergência entre as duas é a rachadura silenciosa
 * voltando.
 *
 * Cumprir significa duas coisas ao mesmo tempo: existe uma sequência DO tamanho
 * pedido, e nenhuma passa dele — uma sequência de 3 não cumpre "geminar 2x".
 */
function auditarGeminacao(aulas: any[], dados: any, configGerminacao: any[]): { pedidas: number; quebradas: string[] } {
    if (configGerminacao.length === 0) return { pedidas: 0, quebradas: [] };

    const porGrupoDia = new Map<string, number[]>();
    for (const a of aulas) {
        const k = `${a.turma_id}|${a.componente_id}|${a.tipo}|${a.turno_id}|${a.dia_semana}`;
        if (!porGrupoDia.has(k)) porGrupoDia.set(k, []);
        porGrupoDia.get(k)!.push(a.aula_index);
    }

    /**
     * Em que turno cada grupo caiu. As aulas não presenciais vão para o
     * contraturno, e é o `aulas_por_dia` DELE que corta o tamanho do bloco.
     * Lido da grade em vez de recalculado: repetir aqui a regra que escolhe o
     * contraturno seria criar uma segunda fonte para o mesmo número.
     */
    const turnoPorGrupo = new Map<string, string>();
    for (const a of aulas) {
        turnoPorGrupo.set(`${a.turma_id}|${a.componente_id}|${a.tipo}`, a.turno_id);
    }
    const turnosPorId = new Map<string, any>(dados.allTurnos.map((t: any) => [t.id, t]));

    const sequencias = new Map<string, number[]>();
    for (const [k, indices] of porGrupoDia) {
        const grupo = k.split('|').slice(0, 3).join('|');
        indices.sort((x, y) => x - y);
        let i = 0;
        while (i < indices.length) {
            let fim = i;
            while (fim + 1 < indices.length && indices[fim + 1] === indices[fim] + 1) fim++;
            if (!sequencias.has(grupo)) sequencias.set(grupo, []);
            sequencias.get(grupo)!.push(fim - i + 1);
            i = fim + 1;
        }
    }

    let pedidas = 0;
    const quebradas: string[] = [];

    for (const t of dados.turmasDoTurno) {
        for (const c of t.serie.componentes || []) {
            const cfg = configGerminacao.find((g: any) => g.componente_id === c.componente_id);
            if (!cfg?.geminar || cfg.tamanho_bloco <= 1) continue;

            for (const [tipo, n] of [
                ['presencial', c.aulas_presenciais || 0],
                ['nao_presencial', c.aulas_nao_presenciais || 0],
            ] as [string, number][]) {
                /**
                 * O MESMO corte que o motor aplica em `limitesGeminacao`: o
                 * pedido da tela cai para o que sobra depois das travadas e para
                 * o que cabe num dia do turno. Sem isso a bancada acusava grade
                 * correta — `34.01/EST ORIEN=[4] esperava bloco de 2`, numa
                 * disciplina cujas quatro aulas estão todas travadas em
                 * sequência, sem nenhuma livre para formar bloco.
                 */
                const nFixa = (dados.aulasFixas as any[]).filter((f: any) =>
                    f.turma_id === t.id && f.componente_id === c.componente_id && f.tipo_aula === tipo
                ).length;
                const turnoDoGrupo = turnosPorId.get(
                    turnoPorGrupo.get(`${t.id}|${c.componente_id}|${tipo}`) || ''
                ) || dados.turnoData;
                const alvo = Math.min(
                    cfg.tamanho_bloco,
                    Math.max(0, n - nFixa),
                    turnoDoGrupo?.aulas_por_dia || 0,
                );
                if (alvo <= 1) continue;
                pedidas++;

                const runs = sequencias.get(`${t.id}|${c.componente_id}|${tipo}`) || [];
                if (!runs.includes(alvo) || runs.some(x => x > alvo)) {
                    const sigla = c.componente?.sigla || c.componente_id;
                    quebradas.push(`${t.nome}/${sigla}=[${runs.join(',')}] esperava bloco de ${alvo}`);
                }
            }
        }
    }

    return { pedidas, quebradas };
}

/**
 * Configuração de geminação equivalente ao padrão da tela.
 *
 * A bancada mandava `[]`, ou seja, media um motor sem geminação nenhuma — o
 * caminho de código onde o defeito vivia nunca era exercitado. O padrão da tela
 * (`gerador-horario-client.tsx`) é ligar para disciplina com 3 ou mais aulas
 * semanais, bloco de 2; repetir isso aqui mede o que a escola realmente roda.
 */
function geminacaoPadrao(dados: any): { componente_id: string; geminar: boolean; tamanho_bloco: number }[] {
    const total = new Map<string, number>();
    for (const t of dados.turmasDoTurno) {
        for (const c of t.serie.componentes || []) {
            const n = (c.aulas_presenciais || 0) + (c.aulas_nao_presenciais || 0);
            total.set(c.componente_id, Math.max(total.get(c.componente_id) ?? 0, n));
        }
    }
    return [...total].map(([componente_id, n]) => ({
        componente_id,
        geminar: n >= 3,
        tamanho_bloco: 2,
    }));
}

async function medir(caso: Caso, orcamento: number, repeticoes: number) {
    const dados = await carregarDadosDaGeracao(caso.escola, caso.turno, ['publicado', 'em_rascunho', 'pre_producao']);
    // `SHETO_SEM_GEMINACAO=1` volta ao comportamento antigo da bancada (sem
    // geminação), para isolar o custo dela numa comparação.
    const configGerminacao = process.env.SHETO_SEM_GEMINACAO === '1' ? [] : geminacaoPadrao(dados);

    const resultados: { pendentes: number; aulas: number; ms: number; fechou: boolean }[] = [];

    for (let r = 0; r < repeticoes; r++) {
        const t0 = Date.now();
        /**
          * Cada repetição varia a SEMENTE, não o offset.
          *
          * Variar o offset era o que se fazia aqui, e estragava a medida: o
          * offset é também a posição na rampa de relaxamento
          * (`curProg = (offset + tentativa) / orcamento`), então a repetição 2
          * começava com `curProg` já em 1,0 — todos os relaxamentos ligados na
          * primeira tentativa, inclusive o que larga a geminação. Duas de cada
          * três repetições não mediam a busca, mediam o último recurso dela.
          *
          * O passo é grande para as faixas de semente das repetições não se
          * encostarem quando o orçamento for alto.
          */
        const res = await gerarHorarioEmWorker(
            [
                dados.turnoData as any, dados.turmasDoTurno, dados.allProfessores, dados.allTurnos,
                configGerminacao, false, dados.ocupacoes,
                orcamento, 0, dados.aulasFixas, false, orcamento, false,
                null, null, Number.POSITIVE_INFINITY, {}, r * PASSO_DA_SEMENTE,
            ] as any,
            () => { }
        );
        const ms = Date.now() - t0;
        const problemas = validar(res.aulas, dados, configGerminacao);

        // A conta da geminação tem de fechar dos dois lados. Declarar de menos é
        // a perda silenciosa; declarar de mais assustaria o operador à toa.
        const gem = auditarGeminacao(res.aulas, dados, configGerminacao);
        const declaradas = (res as any).geminacoesQuebradas?.length ?? 0;
        if (gem.quebradas.length !== declaradas) {
            problemas.push(
                `geminacao mal declarada: a grade perdeu ${gem.quebradas.length}, ` +
                `o motor declarou ${declaradas} — ${gem.quebradas.slice(0, 2).join(' ; ')}`
            );
        }

        resultados.push({
            pendentes: res.success ? 0 : res.melhorPendentes,
            aulas: res.aulas.length,
            ms,
            fechou: res.success,
        });
        process.stdout.write(
            `  rep ${r + 1}/${repeticoes}: ${res.success ? 'FECHOU' : `${res.melhorPendentes} pendentes`}` +
            ` | ${res.aulas.length} aulas | ${(ms / 1000).toFixed(1)}s` +
            ` | geminacao ${gem.pedidas - gem.quebradas.length}/${gem.pedidas}` +
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

    /**
     * A bancada precisa dizer que acabou.
     *
     * O pool de workers de `timetabling-pool` e feito para um servidor: ele
     * mantem as threads vivas entre as geracoes, que e o certo la. Num script
     * isso quer dizer que o processo nunca sai sozinho — ficava rodando depois
     * de imprimir o resumo, e cada medicao interrompida deixava um orfao
     * segurando CPU. Dois deles chegaram a sobreviver a sessao inteira.
     *
     * Nao ha o que salvar neste ponto: o resumo ja foi impresso e o pool do
     * banco ja fechou.
     */
    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
