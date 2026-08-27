/**
 * A regra do dia numa grade já salva.
 *
 *   npx tsx scripts/verificar-sequencias.ts <horario_id>
 *
 * Três coisas que só se enxergam olhando a grade pronta:
 *
 *   EMENDA      alguma turma recebeu aulas SEGUIDAS demais da mesma matéria?
 *   ESPAÇAMENTO os grupos da mesma matéria no dia respiram? Pelo menos 1 aula
 *               livre entre duas avulsas, 2 quando uma delas é dupla.
 *   TETO        quantas da mesma matéria caíram no dia, no total?
 *
 * Repetir a matéria no dia é permitido — a escola usa. O que ela não usa é o
 * amontoado: o par colado numa terceira aula, ou o dia inteiro tomado por uma
 * disciplina só.
 *
 * O teto é o mesmo do motor:
 *   - com geminação pedida, o tamanho do bloco;
 *   - sem geminação pedida, 2. Sempre 2, sem exceção — três aulas seguidas da
 *     mesma matéria que ninguém pediu é grade que a escola não usa.
 *
 * Como a grade salva não guarda a configuração de geminação usada, o teto
 * assumido aqui é o de quem NÃO pediu geminação. Uma sequência acusada pode,
 * portanto, ser legítima — se aquela disciplina tinha geminação de 3 ou mais na
 * tela. Sequência de 3+ em disciplina de bloco 2 é sempre defeito.
 */
import { config as carregarEnv } from 'dotenv';
carregarEnv({ path: '.env.local' });
carregarEnv();

import { getPool } from '../src/lib/db/pool';

/**
 * Maior sequência aceitável sem geminação pedida.
 *
 * Não é preferência: a escola não consegue usar uma grade em que a mesma
 * matéria cai três vezes seguidas sem ninguém ter pedido. Grade assim é
 * inválida, não é grade pior.
 */
const TETO_SEM_GEMINACAO = 2;

/**
 * Quantas aulas da mesma matéria cabem no dia: 4 num dia de 7 aulas ou mais, 3
 * nos demais, e nunca abaixo do que a aritmética obriga — `aulas` aulas
 * espalhadas por `dias` dias põem `ceil(aulas / dias)` em algum dia, e acusar
 * abaixo disso seria acusar a única grade possível.
 */
const tetoDoDia = (aulasSemana: number, dias: number, aulasPorDia: number) =>
    Math.max(aulasPorDia >= 7 ? 4 : 3, Math.ceil(aulasSemana / Math.max(1, dias)));

/**
 * A regra do dia. Devolve o motivo, ou null.
 *
 * Como a grade salva não guarda a configuração de geminação usada, `limiteRun`
 * assumido é o de quem NÃO pediu geminação. Uma emenda acusada pode, portanto,
 * ser legítima — se aquela disciplina tinha geminação de 3 ou mais na tela.
 * Espaçamento e teto não dependem disso e são sempre confiáveis.
 */
function motivoDaRegra(indices: number[], limiteRun: number, teto: number): string | null {
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

type Linha = {
    turma: string; dia: string; aula_index: number;
    componente: string; componente_id: string; professor: string;
    aulas_semana: number; dias_turno: number; aulas_por_dia: number;
};

async function main() {
    const horarioId = process.argv[2];
    if (!horarioId) {
        console.error('uso: npx tsx scripts/verificar-sequencias.ts <horario_id>');
        process.exit(2);
    }

    const { rows } = await getPool().query<Linha>(
        `select tm.nome as turma, ha.dia_semana as dia, ha.aula_index,
                coalesce(c.nome, ha.componente_id::text) as componente,
                ha.componente_id::text as componente_id,
                coalesce(p.nome_horario, '-') as professor,
                coalesce(sc.aulas_presenciais, 0) as aulas_semana,
                coalesce(array_length(t.dias_semana, 1), 5) as dias_turno,
                coalesce(t.aulas_por_dia, 5) as aulas_por_dia
           from horario_aulas ha
           join horarios h on h.id = ha.horario_id
           join turnos t on t.id = h.turno_id
           left join turmas tm on tm.id = ha.turma_id
           left join series_componentes sc
                  on sc.serie_id = tm.serie_id and sc.componente_id = ha.componente_id
           left join componentes_curriculares c on c.id = ha.componente_id
           left join professores p on p.id = ha.professor_id
          where ha.horario_id = $1
          order by tm.nome, ha.dia_semana, ha.aula_index`,
        [horarioId]
    );

    if (rows.length === 0) {
        console.error(`nenhuma aula encontrada para o horario ${horarioId}`);
        process.exit(2);
    }

    const porTurmaDia = new Map<string, Linha[]>();
    for (const a of rows) {
        const k = `${a.turma}|${a.dia}`;
        const lista = porTurmaDia.get(k);
        if (lista) lista.push(a); else porTurmaDia.set(k, [a]);
    }

    const achados: { tam: number; teto: number; texto: string }[] = [];
    const histograma = new Map<number, number>();
    const excessosDeDia: { qtd: number; texto: string }[] = [];

    for (const [k, aulas] of porTurmaDia) {
        const [turma, dia] = k.split('|');
        const porIndice = new Map(aulas.map(a => [a.aula_index, a]));
        const indices = [...porIndice.keys()].sort((x, y) => x - y);

        // A regra do dia, por disciplina.
        const porComponente = new Map<string, Linha[]>();
        for (const a of aulas) {
            const lista = porComponente.get(a.componente_id);
            if (lista) lista.push(a); else porComponente.set(a.componente_id, [a]);
        }
        for (const [, doDia] of porComponente) {
            const ref = doDia[0];
            const teto = tetoDoDia(ref.aulas_semana, ref.dias_turno, ref.aulas_por_dia);
            const motivo = motivoDaRegra(doDia.map(a => a.aula_index), TETO_SEM_GEMINACAO, teto);
            if (!motivo) continue;
            const quais = doDia.map(a => a.aula_index + 1).sort((x, y) => x - y).join(',');
            excessosDeDia.push({
                qtd: doDia.length,
                texto: `${motivo}  ${turma} ${dia} aulas ${quais}  ` +
                    `${ref.componente} — ${ref.aulas_semana} aula(s)/semana em ` +
                    `${ref.dias_turno} dias (${ref.professor})`,
            });
        }

        let i = 0;
        while (i < indices.length) {
            const inicio = porIndice.get(indices[i])!;
            let fim = i;
            while (
                fim + 1 < indices.length &&
                indices[fim + 1] === indices[fim] + 1 &&
                porIndice.get(indices[fim + 1])!.componente_id === inicio.componente_id
            ) fim++;

            const tam = fim - i + 1;
            histograma.set(tam, (histograma.get(tam) ?? 0) + 1);

            const teto = TETO_SEM_GEMINACAO;
            if (tam > teto) {
                achados.push({
                    tam, teto,
                    texto: `${tam}x (teto ${teto})  ${turma} ${dia} aula ${indices[i] + 1}..${indices[fim] + 1}  ` +
                        `${inicio.componente} — ${inicio.aulas_semana} aula(s)/semana em ${inicio.dias_turno} dias (${inicio.professor})`,
                });
            }
            i = fim + 1;
        }
    }

    console.log(`=== sequencias em ${horarioId} — ${rows.length} aulas ===`);
    const tamanhos = [...histograma.entries()].sort((a, b) => a[0] - b[0]);
    console.log(`tamanho -> quantidade: ${tamanhos.map(([t, n]) => `${t}x:${n}`).join('  ')}`);

    if (achados.length === 0) {
        console.log('\nnenhuma sequencia acima do teto.');
    } else {
        console.log(`\n${achados.length} sequencia(s) acima do teto:`);
        achados.sort((a, b) => b.tam - a.tam).forEach(a => console.log(`  ${a.texto}`));
    }

    if (excessosDeDia.length === 0) {
        console.log('nenhum dia quebra a regra do dia.');
    } else {
        console.log(`\n${excessosDeDia.length} dia(s) quebrando a regra do dia:`);
        excessosDeDia.sort((a, b) => b.qtd - a.qtd).forEach(a => console.log(`  ${a.texto}`));
    }

    await getPool().end();
    process.exit(achados.length === 0 && excessosDeDia.length === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(2); });
