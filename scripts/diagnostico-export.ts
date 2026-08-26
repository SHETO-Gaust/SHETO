/**
 * Roda a exportacao de horario pelo caminho real e inspeciona o arquivo gerado.
 *
 *   npx tsx scripts/diagnostico-export.ts <horarioId>
 *
 * Sem argumento, usa o horario com mais aulas. Escreve o .xlsx num diretorio
 * temporario e le de volta, contando abas, linhas e celulas preenchidas — que e
 * a unica forma de saber se o que sai do exportador bate com o que esta no
 * banco.
 */
import { config as carregarEnv } from 'dotenv';
carregarEnv({ path: '.env.local' });
carregarEnv();

import * as XLSX from 'xlsx';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { getPool } from '../src/lib/db/pool';
import { createClient } from '../src/lib/supabase/server';

/** Mesma consulta de getHorarioDetalhado, sem a checagem de permissao. */
async function carregar(id: string) {
    const supabase = await createClient();

    const { data: horario, error: hError } = await supabase
        .from('horarios').select('*, turno:turnos(*)').eq('id', id).single();
    if (hError || !horario) throw new Error('Horario nao encontrado: ' + (hError as any)?.message);

    const { data: allTurnos } = await supabase.from('turnos').select('*').eq('escola_id', (horario as any).escola_id);
    const nomeTurno = (horario as any).turno.nome.toLowerCase();
    const turnoOposto = allTurnos?.find((t: any) => {
        if (nomeTurno.includes('matutino') || nomeTurno.includes('manhã')) return t.nome.toLowerCase().includes('vespertino') || t.nome.toLowerCase().includes('tarde');
        if (nomeTurno.includes('vespertino') || nomeTurno.includes('tarde')) return t.nome.toLowerCase().includes('matutino') || t.nome.toLowerCase().includes('manhã');
        return false;
    }) || allTurnos?.find((t: any) => t.id !== (horario as any).turno.id);

    const { data: aulas, error: aError } = await supabase
        .from('horario_aulas')
        .select('*, componente:componentes_curriculares(id, nome, sigla), professor:professores(id, nome_horario, cpf, restricoes), turma:turmas(id, nome)')
        .eq('horario_id', id)
        .order('aula_index', { ascending: true });

    if (aError) console.log('ERRO ao ler as aulas:', (aError as any).message);

    // Monta o MESMO objeto que getHorarioDetalhado devolve. Faltando
    // `turno_oposto`, `buildWorkbook` pula as abas de contraturno inteiras e o
    // diagnostico acusa perda de aulas que so existe no diagnostico.
    const completo = {
        ...(horario as any),
        turno: (horario as any).turno,
        turno_oposto: turnoOposto as any,
        aulas: (aulas || []) as any[],
    };

    return { horario: completo, turnoOposto, aulas: completo.aulas };
}

/** Exporta um horario e devolve o que o arquivo realmente contem. */
async function auditar(pool: any, id: string, nomeHorario: string) {
    const { rows: real } = await pool.query(`
        select count(*)::int total,
               count(*) filter (where tipo = 'presencial')::int presenciais,
               count(distinct turma_id)::int turmas
        from public.horario_aulas where horario_id = $1`, [id]);
    const esperado = real[0];

    const { horario, aulas } = await carregar(id);
    const turno: any = (horario as any).turno;

    const { exportarHorarioXLSX } = await import('../src/lib/export-horario');

    /**
     * Diretorio novo a cada horario, e le-se o arquivo que estiver la dentro.
     *
     * Reconstruir o nome esperado aqui foi um erro que se pagou na hora: o
     * exportador passou a incluir o turno no nome, o script continuou montando o
     * nome antigo, e acabou lendo o .xlsx que outro horario deixou no tmp — a
     * auditoria acusou perda de aulas que nao existia. Nao adivinhar o nome
     * elimina a classe inteira de engano.
     */
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'she-export-'));
    const anterior = process.cwd();
    let erroExport: string | null = null;
    process.chdir(dir);
    try {
        exportarHorarioXLSX(horario as any);
    } catch (e: any) {
        erroExport = e?.message || String(e);
    } finally {
        process.chdir(anterior);
    }

    if (erroExport) return { esperado, erro: erroExport, abas: 0, celulas: 0, turmasNoArquivo: 0 };

    const arquivos = fs.readdirSync(dir).filter(f => f.endsWith('.xlsx'));
    if (arquivos.length !== 1) {
        return { esperado, erro: `esperava 1 arquivo, achei ${arquivos.length}`, abas: 0, celulas: 0, turmasNoArquivo: 0 };
    }
    void nomeHorario;
    const wb = XLSX.readFile(path.join(dir, arquivos[0]));

    let celulas = 0;
    let turmasNoArquivo = 0;
    for (const nome of wb.SheetNames) {
        if (nome === 'Por Dia') continue;
        if (nome.startsWith('T-')) turmasNoArquivo++;
        const linhas = XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, blankrows: false }) as any[][];

        /**
         * Conta AULAS, nao celulas.
         *
         * Uma celula marcada "CHOQUE (2)" carrega duas aulas; conta-la como uma
         * fazia a auditoria acusar perda onde as duas estavam la, visiveis. O
         * bloco "FORA DA GRADE" tambem entra: sao aulas reais, listadas fora da
         * matriz justamente para nao sumirem.
         */
        let emFora = false;
        for (const l of linhas.slice(1)) {
            const primeira = String(l[0] ?? '');
            if (primeira.startsWith('⚠ FORA DA GRADE')) { emFora = true; continue; }
            if (emFora) {
                if (primeira === 'Dia') continue;              // cabecalho do bloco
                if (l.length >= 3 && primeira) celulas++;      // uma aula listada
                continue;
            }
            for (const c of l.slice(2)) {
                if (c === undefined || c === null || c === '') continue;
                const m = String(c).match(/^⚠ CHOQUE \((\d+)\)/);
                celulas += m ? Number(m[1]) : 1;
            }
        }
    }

    return { esperado, erro: null, abas: wb.SheetNames.length, celulas, turmasNoArquivo, sheetNames: wb.SheetNames };
}

async function auditarTodos() {
    const pool = getPool();
    const { rows } = await pool.query(`
        select h.id, h.nome, h.status, t.nome turno, count(a.*)::int n
        from public.horarios h
        join public.turnos t on t.id = h.turno_id
        join public.horario_aulas a on a.horario_id = h.id
        group by 1,2,3,4 order by 5 desc`);

    console.log('=== auditoria de ' + rows.length + ' horario(s) com aulas ===\n');
    let ruins = 0;

    for (const h of rows) {
        try {
            const r = await auditar(pool, h.id, h.nome);
            const okTurmas = r.turmasNoArquivo === r.esperado.turmas;
            const okCelulas = r.celulas >= r.esperado.total;
            const marca = r.erro ? 'ERRO    ' : (okTurmas && okCelulas ? 'ok      ' : 'DIVERGE ');
            if (r.erro || !okTurmas || !okCelulas) ruins++;
            console.log(marca + String(h.nome).slice(0, 32).padEnd(32) + ' | ' + String(h.turno).slice(0, 12).padEnd(12) +
                ' | banco: ' + String(h.n).padStart(4) + ' aulas / ' + r.esperado.turmas + ' turmas' +
                ' | arquivo: ' + String(r.celulas).padStart(4) + ' celulas / ' + r.turmasNoArquivo + ' abas de turma' +
                (r.erro ? '  <-- ' + r.erro : ''));
        } catch (e: any) {
            ruins++;
            console.log('FALHOU  ' + String(h.nome).slice(0, 32).padEnd(32) + ' | ' + (e?.message || e));
        }
    }

    console.log('\n' + ruins + ' de ' + rows.length + ' com problema.');
    await pool.end();
}

async function main() {
    const pool = getPool();
    let id = process.argv[2];

    // O pool e singleton: fecha-lo aqui derrubaria a auditoria que vem a seguir.
    if (!id) return auditarTodos();

    // Verdade do banco, para comparar com o que o shim devolve.
    const { rows: real } = await pool.query(`
        select count(*)::int total, count(distinct turma_id)::int turmas,
               count(distinct dia_semana)::int dias, count(distinct aula_index)::int indices
        from public.horario_aulas where horario_id = $1`, [id]);
    console.log('\nBANCO  :', real[0]);

    const { horario, aulas } = await carregar(id);
    const turno: any = (horario as any).turno;

    console.log('SHIM   :', {
        total: aulas.length,
        turmas: new Set(aulas.map((a: any) => a.turma_id)).size,
        dias: new Set(aulas.map((a: any) => a.dia_semana)).size,
        indices: new Set(aulas.map((a: any) => a.aula_index)).size,
    });

    console.log('\nturno.dias_semana =', JSON.stringify(turno?.dias_semana), '| aulas_por_dia =', turno?.aulas_por_dia);
    console.log('turno.horarios e array?', Array.isArray(turno?.horarios), '| itens:', turno?.horarios?.length);

    const a0 = aulas[0];
    if (a0) {
        console.log('\nformato de uma aula:');
        console.log('  dia_semana =', JSON.stringify(a0.dia_semana), '| aula_index =', a0.aula_index, '(', typeof a0.aula_index, ')');
        console.log('  turma      =', JSON.stringify(a0.turma));
        console.log('  componente =', JSON.stringify(a0.componente));
        console.log('  professor  =', a0.professor ? JSON.stringify({ nome_horario: a0.professor.nome_horario }) : 'null');
    }

    const semTurma = aulas.filter((a: any) => !a.turma).length;
    const semComp = aulas.filter((a: any) => !a.componente).length;
    console.log('\naulas sem join de turma:', semTurma, '| sem componente:', semComp);

    // Caminho real da exportacao.
    const { exportarHorarioXLSX } = await import('../src/lib/export-horario');
    const dir = os.tmpdir();
    const anterior = process.cwd();
    process.chdir(dir);
    try {
        exportarHorarioXLSX(horario as any);
    } finally {
        process.chdir(anterior);
    }

    const nomeArquivo = 'Horario-' + (((horario as any).nome ?? 'Grade').replace(/[^a-zA-Z0-9]/g, '_')) + '.xlsx';
    const caminho = path.join(dir, nomeArquivo);
    const wb = XLSX.readFile(caminho);

    console.log('\n=== arquivo gerado: ' + caminho + ' ===');
    console.log('abas (' + wb.SheetNames.length + '):', wb.SheetNames.join(', '));
    for (const nome of wb.SheetNames) {
        const ws = wb.Sheets[nome];
        const linhas = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false }) as any[][];
        const preenchidas = linhas.slice(1).reduce((s, l) => s + l.slice(2).filter(c => c !== undefined && c !== null && c !== '').length, 0);
        console.log('  ' + nome.padEnd(22) + ' ' + String(linhas.length).padStart(3) + ' linha(s), ' +
            String((linhas[0] || []).length).padStart(2) + ' coluna(s), ' + preenchidas + ' celula(s) de aula');
        if (linhas[0]) console.log('      cabecalho: ' + JSON.stringify(linhas[0]));
    }

    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
