/**
 * Sequências da mesma disciplina numa grade já salva.
 *
 *   npx tsx scripts/verificar-sequencias.ts <horario_id>
 *
 * Responde a pergunta que só se enxerga olhando a grade pronta: alguma turma
 * recebeu mais aulas seguidas da mesma matéria do que caberia?
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

type Linha = {
    turma: string; dia: string; aula_index: number;
    componente: string; componente_id: string; professor: string;
    aulas_semana: number; dias_turno: number;
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
                coalesce(array_length(t.dias_semana, 1), 5) as dias_turno
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

    for (const [k, aulas] of porTurmaDia) {
        const [turma, dia] = k.split('|');
        const porIndice = new Map(aulas.map(a => [a.aula_index, a]));
        const indices = [...porIndice.keys()].sort((x, y) => x - y);

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

    await getPool().end();
    process.exit(achados.length === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(2); });
