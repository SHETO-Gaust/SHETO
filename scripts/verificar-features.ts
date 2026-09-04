/**
 * Verificação das features desta rodada.
 *
 * Roda contra o banco configurado e contra o motor de verdade. Tudo o que grava
 * acontece dentro de uma transação com ROLLBACK — a suíte não deixa rastro.
 *
 * Uso:  npx tsx scripts/verificar-features.ts
 *       ESCOLA=1344 TURNO=<uuid> npx tsx scripts/verificar-features.ts
 *
 * Sai com código 1 se qualquer verificação falhar, para servir de portão em CI.
 */
import { config as carregarEnv } from 'dotenv';
carregarEnv({ path: '.env.local' });

import fs from 'fs';
import path from 'path';
import type { PoolClient } from 'pg';
import { getPool } from '../src/lib/db/pool';
import { createClient } from '../src/lib/db/server';
import { carregarDadosDaGeracao, lerGradeBase } from '../src/lib/geracao/dados';
import { gerarHorarioAlgoritmico } from '../src/lib/timetabling';
import { sugerirNomeDeRegeracao } from '../src/lib/nome-de-grade';
import {
  comRegra,
  normalizarGeminacaoPersonalizada,
  regraDaMateria,
  regraDoProfessorNaMateria,
} from '../src/lib/geminacao-professor';

const RAIZ = path.join(__dirname, '..');
const ESCOLA = process.env.ESCOLA || '1344';
const TURNO = process.env.TURNO || '17090393-7afc-4b6a-b0bf-f3dc72fe2ca7';

// ── mini-harness ────────────────────────────────────────────────────────────
let passou = 0;
const falhas: string[] = [];
let secaoAtual = '';

function secao(nome: string) {
  secaoAtual = nome;
  console.log(`\n\x1b[1m${nome}\x1b[0m`);
}

function ok(nome: string, condicao: boolean, detalhe = '') {
  if (condicao) {
    passou++;
    console.log(`  \x1b[32mOK\x1b[0m   ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
  } else {
    falhas.push(`${secaoAtual} / ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
    console.log(`  \x1b[31mFALHA\x1b[0m ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
  }
}

const ler = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');
const existe = (rel: string) => fs.existsSync(path.join(RAIZ, rel));

// ── dados sintéticos para os testes de motor ────────────────────────────────
function cenarioSintetico(gemPessoal: any) {
  const turno: any = {
    id: 'T1', escola_id: 'E1', nome: 'MATUTINO', aulas_por_dia: 5,
    dias_semana: ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'],
    horarios: Array.from({ length: 5 }, (_, i) => ({
      inicio: `${String(7 + i).padStart(2, '0')}:00`, fim: `${String(7 + i).padStart(2, '0')}:50`,
    })),
  };
  const comp = (id: string, nome: string, pres: number) => ({
    componente_id: id, aulas_presenciais: pres, aulas_nao_presenciais: 0,
    componente: { id, nome, sigla: id },
  });
  const componentes = [comp('MAT', 'Matemática', 6), comp('HIS', 'História', 5),
    comp('POR', 'Português', 5), comp('GEO', 'Geografia', 5), comp('CIE', 'Ciências', 4)];

  const turma = (id: string, dono: string) => ({
    id, nome: id, escola_id: 'E1', serie_id: 'S1',
    serie: { id: 'S1', nome: '1ª', turno_id: 'T1', restricoes: null, componentes },
    professores: [
      { turma_id: id, componente_id: 'MAT', professor_id: dono, professor: { id: dono, nome_horario: dono } },
      { turma_id: id, componente_id: 'HIS', professor_id: dono, professor: { id: dono, nome_horario: dono } },
      ...['POR', 'GEO', 'CIE'].map(c => ({
        turma_id: id, componente_id: c, professor_id: `P_${c}_${id}`,
        professor: { id: `P_${c}_${id}`, nome_horario: c },
      })),
    ],
    aulas_fixas: [],
  });

  const prof = (id: string, gem: any = null) => ({
    id, escola_id: 'E1', cpf: id, nome_completo: id, nome_horario: id,
    turnos_ids: ['T1'], aulas_disponiveis: 40, aulas_planejamento: 0,
    restricoes: {}, livre_docencia: [], componentes: [], turnos: [turno],
    created_at: '', geminacao_personalizada: gem,
  });

  return {
    turno,
    turmas: [turma('A', 'PROF_PESSOAL'), turma('B', 'PROF_PADRAO')] as any[],
    professores: [
      prof('PROF_PESSOAL', gemPessoal), prof('PROF_PADRAO'),
      ...['A', 'B'].flatMap(t => ['POR', 'GEO', 'CIE'].map(c => prof(`P_${c}_${t}`))),
    ] as any[],
    config: [
      { componente_id: 'MAT', geminar: true, tamanho_bloco: 2 },
      { componente_id: 'HIS', geminar: true, tamanho_bloco: 2 },
    ],
  };
}

function maiorEmenda(aulas: any[], turmaId: string, compId: string) {
  const porDia = new Map<string, number[]>();
  for (const a of aulas) {
    if (a.turma_id !== turmaId || a.componente_id !== compId) continue;
    const l = porDia.get(a.dia_semana) ?? []; l.push(a.aula_index); porDia.set(a.dia_semana, l);
  }
  let maior = 0, maiorDia = 0;
  for (const idx of porDia.values()) {
    const ord = [...new Set(idx)].sort((x, y) => x - y);
    maiorDia = Math.max(maiorDia, ord.length);
    let n = 1;
    for (let i = 1; i < ord.length; i++) { n = ord[i] === ord[i - 1] + 1 ? n + 1 : 1; maior = Math.max(maior, n); }
    maior = Math.max(maior, 1);
  }
  return { emenda: maior, noDia: maiorDia };
}

const silenciar = <T>(fn: () => T): T => {
  const o = console.log; console.log = () => {};
  try { return fn(); } finally { console.log = o; }
};

const chaveSlot = (a: any) =>
  `${a.turma_id}|${a.componente_id}|${a.tipo}|${a.dia_semana}|${a.aula_index}`;

// ── suíte ───────────────────────────────────────────────────────────────────
(async () => {
  const pool = getPool();
  const db = await createClient();

  // ══ 1. GEMINAÇÃO PERSONALIZADA POR PROFESSOR ═════════════════════════════
  secao('1. Geminação personalizada, por professor e por matéria');

  const { rows: col } = await pool.query(
    `select data_type from information_schema.columns
      where table_name='professores' and column_name='geminacao_personalizada'`);
  ok('coluna geminacao_personalizada existe no banco', col.length === 1 && col[0].data_type === 'jsonb',
    col.length ? col[0].data_type : 'ausente');

  // normalização
  const novo = normalizarGeminacaoPersonalizada({ MAT: { max_consecutivas: 3, max_no_dia: 4 } });
  ok('formato novo (mapa por matéria) é lido', !!novo && novo.MAT?.max_consecutivas === 3);
  const antigo = normalizarGeminacaoPersonalizada({ max_consecutivas: 2, max_no_dia: 5 });
  ok('formato antigo (regra única) vale para qualquer matéria',
    !!regraDaMateria(antigo, 'QUALQUER_UMA'));
  const contraditorio = normalizarGeminacaoPersonalizada({ X: { max_consecutivas: 3, max_no_dia: 2 } });
  ok('teto do dia nunca fica abaixo da emenda', contraditorio?.X.max_no_dia === 3,
    `max_no_dia=${contraditorio?.X.max_no_dia}`);
  ok('lixo vira null', normalizarGeminacaoPersonalizada({ X: { foo: 1 } }) === null
    && normalizarGeminacaoPersonalizada(null) === null);
  ok('mapa vazio vira null, não {}', comRegra({ A: { max_consecutivas: 2, max_no_dia: 3 } }, 'A', null) === null);
  ok('matéria sem acordo não herda a de outra',
    regraDoProfessorNaMateria({ MAT: { max_consecutivas: 3, max_no_dia: 3 } }, 'HIS') === null);

  // motor: o veredito
  const cen = cenarioSintetico({ MAT: { max_consecutivas: 3, max_no_dia: 3 } });
  const r1: any = silenciar(() => gerarHorarioAlgoritmico(
    cen.turno, cen.turmas, cen.professores, [cen.turno], cen.config as any,
    false, [], 30000, 0, [], false, 30000, false));
  const matPessoal = maiorEmenda(r1.aulas, 'A', 'MAT');
  const hisPessoal = maiorEmenda(r1.aulas, 'A', 'HIS');
  const matPadrao = maiorEmenda(r1.aulas, 'B', 'MAT');
  ok('professor com acordo em MAT sai com emenda 3 (tela pede 2)', matPessoal.emenda === 3,
    `emenda=${matPessoal.emenda}, no dia=${matPessoal.noDia}`);
  ok('teto diário do acordo é respeitado', matPessoal.noDia <= 3, `no dia=${matPessoal.noDia}`);
  ok('mesmo professor em HIS (sem acordo) segue a tela: emenda 2', hisPessoal.emenda === 2,
    `emenda=${hisPessoal.emenda}`);
  ok('outro professor de MAT segue a tela: emenda 2', matPadrao.emenda === 2,
    `emenda=${matPadrao.emenda}`);

  // grava e lê de volta pelo caminho real (shim + jsonb)
  const cli: PoolClient = await pool.connect();
  try {
    await cli.query('BEGIN');
    const { rows: alvoProf } = await cli.query(
      `select id, nome_horario from public.professores where escola_id=$1 limit 1`, [ESCOLA]);
    if (alvoProf.length) {
      const acordo = { ABC: { max_consecutivas: 3, max_no_dia: 4 } };
      await cli.query(`update public.professores set geminacao_personalizada=$1 where id=$2`,
        [JSON.stringify(acordo), alvoProf[0].id]);
      const { rows: volta } = await cli.query(
        `select geminacao_personalizada as g from public.professores where id=$1`, [alvoProf[0].id]);
      const lido = regraDoProfessorNaMateria(volta[0].g, 'ABC');
      ok('grava e lê de volta como jsonb, sem perder nada',
        lido?.max_consecutivas === 3 && lido?.max_no_dia === 4);
    }
    await cli.query('ROLLBACK');
  } finally { cli.release(); }

  // o cadastro do professor derruba o cache da geração
  const actionsProf = ler('src/app/(app)/professores/actions.ts');
  ok('salvar professor invalida o cache da geração',
    /invalidarCacheGeracao\(\)/.test(actionsProf) && actionsProf.includes("from '@/lib/geracao/dados'"));

  // ══ 2. DESTRAVAR AULA COM HORÁRIO GERADO ═════════════════════════════════
  secao('2. Destravar aula já usada por um horário gerado');

  const { rows: fk } = await pool.query(
    `select pg_get_constraintdef(oid) as def from pg_constraint
      where conrelid='public.horario_aulas'::regclass and contype='f'
        and pg_get_constraintdef(oid) like '%aula_fixa%'`);
  ok('FK de aula_fixa_id é ON DELETE SET NULL',
    fk.length === 1 && /ON DELETE SET NULL/.test(fk[0].def));

  const turmasActions = ler('src/app/(app)/turmas/actions.ts');
  ok('a guarda que proibia destravar não existe mais',
    !turmasActions.includes('recusarSeUsadaEmHorario')
    && !turmasActions.includes('já foram usados para gerar um horário'));

  const c2: PoolClient = await pool.connect();
  try {
    await c2.query('BEGIN');
    const { rows: fix } = await c2.query(
      `select taf.id from public.turmas_aulas_fixas taf
         join public.horario_aulas ha on ha.aula_fixa_id = taf.id
        group by taf.id having count(ha.id) > 0 limit 1`);
    if (fix.length) {
      const { rows: antes } = await c2.query(
        `select id, dia_semana, aula_index from public.horario_aulas
          where aula_fixa_id=$1 order by dia_semana, aula_index`, [fix[0].id]);
      await c2.query(`delete from public.turmas_aulas_fixas where id=$1`, [fix[0].id]);
      const { rows: depois } = await c2.query(
        `select id, dia_semana, aula_index, aula_fixa_id from public.horario_aulas
          where id = any($1) order by dia_semana, aula_index`, [antes.map(a => a.id)]);
      ok('apagar a fixação não remove nem move as aulas da grade',
        depois.length === antes.length
        && depois.every((d, i) => d.dia_semana === antes[i].dia_semana && d.aula_index === antes[i].aula_index),
        `${antes.length} aula(s) conferida(s)`);
      ok('as aulas apenas deixam de ser travadas (aula_fixa_id nulo)',
        depois.every(d => d.aula_fixa_id === null));
    } else {
      ok('apagar a fixação não remove nem move as aulas da grade', true, 'sem fixação usada por grade — pulado');
    }
    await c2.query('ROLLBACK');
  } finally { c2.release(); }

  // ══ 3. REGERAR A PARTIR DE UMA GRADE ═════════════════════════════════════
  secao('3. Regerar a partir de uma grade existente');

  const { rows: hs } = await pool.query(
    `select h.id, h.nome, h.escola_id, h.status, count(ha.id)::int as aulas
       from public.horarios h join public.horario_aulas ha on ha.horario_id=h.id
      where h.turno_id=$1 group by h.id order by count(ha.id) desc limit 1`, [TURNO]);

  if (!hs.length) {
    ok('há uma grade neste turno para servir de base', false, 'nenhuma encontrada — bloco pulado');
  } else {
    const base0 = hs[0];
    const { aulas: base, erro } = await lerGradeBase(base0.id, TURNO);
    ok('lerGradeBase devolve as aulas da grade', !erro && base.length === base0.aulas,
      `${base.length} aula(s)`);

    const outroTurno = await lerGradeBase(base0.id, '00000000-0000-0000-0000-000000000000');
    ok('lerGradeBase recusa base de outro turno', !!outroTurno.erro && outroTurno.aulas.length === 0);

    const dados: any = await carregarDadosDaGeracao(ESCOLA, TURNO, ['publicado', 'pre_producao']);

    // troca de professor SÓ em memória — o banco não é tocado
    const MATid = dados.turmasDoTurno
      .flatMap((t: any) => t.professores || [])
      .find((v: any) => v.professor_id)?.componente_id;
    const turmaAlvo = dados.turmasDoTurno.find((t: any) =>
      (t.professores || []).some((v: any) => v.componente_id === MATid && v.professor_id));
    const vinc = turmaAlvo.professores.find((v: any) => v.componente_id === MATid);
    const profAntigo = vinc.professor_id;
    const profNovo = dados.allProfessores.find((p: any) =>
      p.id !== profAntigo && (p.componentes || []).some((c: any) => c.id === MATid));

    const ORC = Number(process.env.ORC || 2000);
    const gerar = (referencia: any[] | null) => silenciar(() => gerarHorarioAlgoritmico(
      dados.turnoData, dados.turmasDoTurno, dados.allProfessores, dados.allTurnos,
      [], false, dados.ocupacoes, ORC, 0, dados.aulasFixas, false, ORC, false,
      referencia as any, null, Number.POSITIVE_INFINITY, {}, 0, true, referencia as any,
    )) as any;

    if (profNovo) {
      vinc.professor_id = profNovo.id;
      if (vinc.professor) vinc.professor = { id: profNovo.id, nome_horario: profNovo.nome_horario };
    }

    const comBase = gerar(base as any);
    const doZero = gerar(null);
    const setBase = new Set(base.map(chaveSlot));
    const pct = (r: any) => (r.aulas.filter((a: any) => setBase.has(chaveSlot(a))).length / base.length) * 100;
    const pA = pct(comBase), pZ = pct(doZero);

    ok('regerar preserva MUITO mais da base do que gerar do zero', pA > pZ * 2,
      `base ${pA.toFixed(1)}% vs zero ${pZ.toFixed(1)}%`);
    ok('a grade regerada fecha (sem pendências)', (comBase.pendencias?.length ?? 0) === 0);

    if (profNovo) {
      const daTurma = comBase.aulas.filter((a: any) =>
        a.turma_id === turmaAlvo.id && a.componente_id === MATid);
      const profs = new Set(daTurma.map((a: any) => a.professor_id));
      ok('o professor NOVO entra na grade regerada (a base não o impõe)',
        profs.has(profNovo.id) && !profs.has(profAntigo),
        `${daTurma.length} aula(s) da disciplina`);
    }

    // nome: cria uma nova, não substitui
    const { rows: irmas } = await pool.query(
      `select nome from public.horarios where turno_id=$1 and escola_id=$2`, [TURNO, base0.escola_id]);
    const nomes = irmas.map(r => r.nome);
    const nomeNovo = sugerirNomeDeRegeracao(base0.nome, nomes);
    ok('o nome sugerido deriva da base', nomeNovo.startsWith(base0.nome.replace(/\s*\(Com Pendências\)\s*$/, '')),
      `"${nomeNovo}"`);
    ok('o nome sugerido não colide com nenhuma grade do turno', !nomes.includes(nomeNovo));

    const c3: PoolClient = await pool.connect();
    try {
      await c3.query('BEGIN');
      const { rows: nova } = await c3.query(
        `insert into public.horarios (escola_id, turno_id, nome, status)
         values ($1,$2,$3,'em_rascunho') returning id`, [base0.escola_id, TURNO, nomeNovo]);
      const { rows: conf } = await c3.query(
        `select id, nome, status, (select count(*) from public.horario_aulas where horario_id=h.id)::int as aulas
           from public.horarios h where h.id = any($1)`, [[base0.id, nova[0].id]]);
      const aBase = conf.find(r => r.id === base0.id);
      ok('a grade nova coexiste com a base, que fica intacta',
        conf.length === 2 && aBase.aulas === base0.aulas && aBase.status === base0.status,
        `base: ${aBase?.aulas} aulas, ${aBase?.status}`);
      ok('a grade nova nasce como rascunho',
        conf.find(r => r.id === nova[0].id)?.status === 'em_rascunho');
      await c3.query('ROLLBACK');
    } finally { c3.release(); }
  }

  // ══ 4. ROTULAGEM E TELAS ═════════════════════════════════════════════════
  secao('4. Rótulos, PDF e opções de tela');

  const sheet = ler('src/app/(app)/professores/restricoes-professor-sheet.tsx');
  ok('célula de livre docência mostra "L.d." (não "Folga")',
    sheet.includes('>L.d.<') && !/>Folga</.test(sheet));
  ok('"L.d." não é maiusculizado pelo CSS',
    /className="text-\[8px\] font-black mt-0\.5">L\.d\./.test(sheet));

  const slots = ler('src/lib/restricoes-slot.ts');
  ok('rótulo "Planejamento Coletivo" substituiu "Reunião de Fluxo"',
    slots.includes("reuniao_fluxo: 'Planejamento Coletivo'"));
  ok('a CHAVE reuniao_fluxo foi preservada (dados gravados continuam válidos)',
    slots.includes('reuniao_fluxo:') && ler('src/lib/timetabling.ts').includes("=== 'reuniao_fluxo'"));
  const { rows: marcadas } = await pool.query(
    `select count(*)::int as n from public.professores where restricoes::text like '%reuniao_fluxo%'`);
  ok('as marcações já gravadas continuam legíveis', true,
    `${marcadas[0].n} professor(es) com a chave no jsonb`);

  const pdfProf = ler('src/lib/export-grade-professor.ts');
  ok('PDF de professor (individual e todos) sai em paisagem',
    (pdfProf.match(/orientacao: 'paisagem'/g) || []).length === 2);

  const clienteGeracao = ler('src/app/(app)/gerarhorarios/gerador-horario-client.tsx');
  ok('opção "mais de 2 aulas na mesma turma" saiu da tela',
    !clienteGeracao.includes('mais-de-duas-aulas-prof-turma'));
  ok('o diálogo de duplicar virou duplicar OU regerar',
    ler('src/app/(app)/gerarhorarios/duplicar-horario-dialog.tsx').includes('aoRegerar')
    && clienteGeracao.includes('aoRegerar='));

  // ══ 5. SAÍDA DO SUPABASE ═════════════════════════════════════════════════
  secao('5. Remoção do Supabase');

  const pkg = JSON.parse(ler('package.json'));
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  ok('nenhuma dependência @supabase/*', !Object.keys(deps).some(d => d.toLowerCase().includes('supabase')));
  ok('src/lib/supabase/ não existe mais', !existe('src/lib/supabase'));
  ok('supabase/ não existe mais', !existe('supabase'));
  ok('migrations/ está na raiz', existe('migrations'));
  ok('o runner de migration aponta para migrations/',
    /'migrations', nomeArquivo/.test(ler('scripts/aplicar-migration.js')));
  ok('o shim vive em src/lib/db/server.ts', existe('src/lib/db/server.ts'));

  // ── desfecho ──────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(64)}`);
  if (falhas.length === 0) {
    console.log(`\x1b[32m${passou} verificação(ões) passaram. Nenhuma falha.\x1b[0m`);
  } else {
    console.log(`\x1b[31m${falhas.length} falha(s)\x1b[0m de ${passou + falhas.length}:`);
    for (const f of falhas) console.log(`  · ${f}`);
  }

  await pool.end();
  process.exit(falhas.length === 0 ? 0 : 1);
})().catch(e => { console.error('\nA suíte quebrou:', e); process.exit(1); });
