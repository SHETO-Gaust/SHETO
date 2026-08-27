/**
 * O preenchimento automático de vagas, contra uma grade salva de verdade.
 *
 *   npx tsx scripts/testar-preenchimento.ts <horario_id>
 *
 * Roda `calcularPreenchimentoAutomatico` sobre os dados reais do banco e depois
 * CONFERE o plano que ele devolveu — não confia na palavra do solver. A
 * conferência é independente: aplica os movimentos numa cópia da grade e checa,
 * do zero, se sobrou choque de professor, buraco novo, restrição violada ou
 * turma com duas aulas no mesmo instante.
 *
 * Existe porque a alternativa é descobrir o defeito depois de gravar em cima do
 * horário de uma escola. Um plano que move dez aulas e erra uma é pior que
 * nenhum plano: o coordenador não tem como saber qual das dez está errada.
 */
import { config as carregarEnv } from 'dotenv';
carregarEnv({ path: '.env.local' });
carregarEnv();

import { getPool } from '../src/lib/db/pool';
import { motivoImpedimento } from '../src/lib/geracao/certificado';
import { getSlotMinutes, minutesConflitam } from '../src/lib/horario-slots';
import { chaveProfessor, paraCertificado, type AulaAlocacao, type ProfessorAlocacao } from '../src/lib/refino-professores';
import { calcularPreenchimentoAutomatico, type PendenciaVaga } from '../src/lib/preencher-vagas';
import type { Turno } from '../src/lib/types';

const horarioId = process.argv[2];
if (!horarioId) {
  console.error('uso: npx tsx scripts/testar-preenchimento.ts <horario_id>');
  process.exit(1);
}

const DIAS_ORDEM = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
const rotuloSlot = (dia: string, idx: number) => `${dia} ${idx + 1}ª`;

async function main() {
  const pool = getPool();

  const { rows: hRows } = await pool.query(
    'select id, escola_id, turno_id, nome, status from horarios where id = $1', [horarioId],
  );
  if (hRows.length === 0) throw new Error('horário não encontrado');
  const horario = hRows[0];

  const { rows: turnos } = await pool.query<Turno>(
    'select * from turnos where escola_id = $1', [horario.escola_id],
  );
  const turnosById = new Map<string, Turno>(turnos.map(t => [t.id, t]));
  const turno = turnosById.get(horario.turno_id)!;

  const SELECT = `
    select ha.id, ha.turma_id, t.nome as turma_nome, ha.componente_id,
           c.nome as componente_nome, coalesce(c.sigla,'') as componente_sigla,
           ha.professor_id, coalesce(p.nome_horario,'Sem professor') as professor_nome,
           p.cpf as professor_cpf, ha.dia_semana, ha.aula_index, ha.tipo, ha.turno_id,
           ha.aula_fixa_id
    from horario_aulas ha
    join turmas t on t.id = ha.turma_id
    join componentes_curriculares c on c.id = ha.componente_id
    left join professores p on p.id = ha.professor_id
    where ha.horario_id = ANY($1::uuid[])`;

  const { rows: aulas } = await pool.query<AulaAlocacao>(SELECT, [[horarioId]]);

  const { rows: outros } = await pool.query(
    `select id from horarios where escola_id = $1 and status in ('publicado','pre_producao') and id <> $2`,
    [horario.escola_id, horarioId],
  );
  const externas: AulaAlocacao[] = outros.length
    ? (await pool.query<AulaAlocacao>(SELECT, [outros.map(o => o.id)])).rows
    : [];

  const { rows: profRows } = await pool.query(
    `select id, nome_horario, cpf, restricoes, livre_docencia, sem_preferencia_livre_docencia,
            coalesce(aulas_disponiveis,0) as aulas_disponiveis,
            coalesce(aulas_planejamento,0) as aulas_planejamento
     from professores where escola_id = $1`, [horario.escola_id],
  );
  const professores: ProfessorAlocacao[] = profRows.map(p => ({
    id: p.id, nome: p.nome_horario ?? '', cpf: p.cpf, componentes: [],
    restricoes: p.restricoes, livre_docencia: p.livre_docencia ?? [],
    sem_preferencia_livre_docencia: p.sem_preferencia_livre_docencia,
    aulas_disponiveis: p.aulas_disponiveis, aulas_planejamento: p.aulas_planejamento,
  }));
  const profPorId = new Map(professores.map(p => [p.id, p]));

  // ── Pendências: o que o cadastro pede e a grade não tem ──────────────────
  const { rows: exigidas } = await pool.query(`
    select t.id as turma_id, t.nome as turma_nome, c.id as componente_id,
           c.nome as componente_nome, coalesce(c.sigla,'') as componente_sigla,
           sc.aulas_presenciais, sc.aulas_nao_presenciais,
           tp.professor_id, coalesce(p.nome_horario,'Sem professor') as professor_nome
    from turmas t
    join series s on s.id = t.serie_id
    join series_componentes sc on sc.serie_id = t.serie_id
    join componentes_curriculares c on c.id = sc.componente_id
    left join turmas_professores tp on tp.turma_id = t.id and tp.componente_id = sc.componente_id
    left join professores p on p.id = tp.professor_id
    where t.escola_id = $1 and s.turno_id = $2`, [horario.escola_id, horario.turno_id]);

  const dias = (turno.dias_semana ?? []).length || 5;
  const tetoDoDia = (carga: number) =>
    Math.max((turno.aulas_por_dia ?? 0) >= 7 ? 4 : 3, Math.ceil(carga / dias));

  const pendencias: PendenciaVaga[] = [];
  for (const e of exigidas) {
    for (const tipo of ['presencial', 'nao_presencial'] as const) {
      const carga = tipo === 'presencial' ? e.aulas_presenciais ?? 0 : e.aulas_nao_presenciais ?? 0;
      if (carga <= 0) continue;
      const posto = aulas.filter(
        a => a.turma_id === e.turma_id && a.componente_id === e.componente_id && a.tipo === tipo,
      ).length;
      for (let n = 0; n < carga - posto; n++) {
        pendencias.push({
          turma_id: e.turma_id, turma_nome: e.turma_nome,
          componente_id: e.componente_id, componente_nome: e.componente_nome,
          componente_sigla: e.componente_sigla, tipo, turno_id: turno.id,
          professor_id: e.professor_id, professor_nome: e.professor_nome,
          tetoDoDia: tetoDoDia(carga),
        });
      }
    }
  }

  console.log(`\n${horario.nome} — ${aulas.length} aulas na grade, ${pendencias.length} pendente(s)\n`);
  for (const p of pendencias) {
    console.log(`   falta  ${p.turma_nome.padEnd(7)} ${p.componente_nome.padEnd(20)} ${p.professor_nome}`);
  }

  const t0 = Date.now();
  const r = calcularPreenchimentoAutomatico(aulas, externas, professores, turnosById, pendencias);
  const ms = Date.now() - t0;

  console.log(`\n── plano (${ms} ms) ──────────────────────────────────────────`);
  console.log(`   ${r.mensagem}\n`);
  for (const passo of r.passos) {
    if (passo.acao === 'mover') {
      console.log(
        `   move   ${passo.turma_nome.padEnd(7)} ${(passo.componente_sigla || passo.componente_nome).padEnd(12)}` +
        ` ${rotuloSlot(passo.origemDia!, passo.origemSlot!).padEnd(12)} -> ${rotuloSlot(passo.destinoDia, passo.destinoSlot).padEnd(12)} (${passo.professor_nome})`,
      );
    } else {
      console.log(
        `   CRIA   ${passo.turma_nome.padEnd(7)} ${(passo.componente_sigla || passo.componente_nome).padEnd(12)}` +
        ` ${''.padEnd(12)}    ${rotuloSlot(passo.destinoDia, passo.destinoSlot).padEnd(12)} (${passo.professor_nome})`,
      );
    }
  }
  for (const f of r.falhas) {
    console.log(`\n   NÃO COUBE  ${f.turma_nome} — ${f.componente_nome}`);
    console.log(`      ${f.motivo}`);
    for (const d of f.detalhes) console.log(`      · ${d}`);
  }

  // ── Conferência independente do plano ───────────────────────────────────
  console.log('\n── conferência do plano ─────────────────────────────────────');

  type Linha = {
    turma_id: string; turma_nome: string; componente_id: string; tipo: string;
    professor_id: string | null; professor_cpf: string | null;
    dia: string; slot: number; turnoId: string; nome: string;
  };

  const grade: Linha[] = aulas.map(a => ({
    turma_id: a.turma_id, turma_nome: a.turma_nome, componente_id: a.componente_id, tipo: a.tipo,
    professor_id: a.professor_id, professor_cpf: a.professor_cpf ?? null,
    dia: a.dia_semana, slot: a.aula_index, turnoId: a.turno_id,
    nome: a.componente_sigla || a.componente_nome,
  }));
  const porId = new Map(aulas.map((a, i) => [a.id, grade[i]]));

  for (const m of r.movimentos) {
    if (m.tipo === 'mover') {
      const linha = porId.get(m.aulaId);
      if (!linha) { falhar(`movimento aponta para aula inexistente: ${m.aulaId}`); continue; }
      linha.dia = m.dia_semana; linha.slot = m.aula_index; linha.turnoId = m.turno_id;
    } else {
      const p = m.professor_id ? profPorId.get(m.professor_id) : undefined;
      grade.push({
        turma_id: m.turma_id, turma_nome: pendencias.find(x => x.turma_id === m.turma_id)?.turma_nome ?? '?',
        componente_id: m.componente_id, tipo: m.tipo_aula,
        professor_id: m.professor_id, professor_cpf: p?.cpf ?? null,
        dia: m.dia_semana, slot: m.aula_index, turnoId: m.turno_id,
        nome: pendencias.find(x => x.componente_id === m.componente_id)?.componente_sigla ?? '?',
      });
    }
  }

  let problemas = 0;
  const falhar = (msg: string) => { problemas++; console.log(`   FALHA  ${msg}`); };

  const instante = (a: { dia: string; slot: number; turnoId: string }, b: { dia: string; slot: number; turnoId: string }) => {
    if (a.dia !== b.dia) return false;
    const [i1, f1] = getSlotMinutes(turnosById.get(a.turnoId), a.slot);
    const [i2, f2] = getSlotMinutes(turnosById.get(b.turnoId), b.slot);
    return minutesConflitam(i1, f1, i2, f2, a.turnoId === b.turnoId, a.slot, b.slot);
  };

  // 1. duas aulas da mesma turma ao mesmo tempo
  for (let i = 0; i < grade.length; i++) {
    for (let j = i + 1; j < grade.length; j++) {
      if (grade[i].turma_id !== grade[j].turma_id) continue;
      if (instante(grade[i], grade[j])) {
        falhar(`turma ${grade[i].turma_nome} com ${grade[i].nome} e ${grade[j].nome} em ${rotuloSlot(grade[i].dia, grade[i].slot)}`);
      }
    }
  }

  // 2. professor em duas salas ao mesmo tempo (incluindo os outros horários)
  const todas = [
    ...grade,
    ...externas.map(e => ({
      turma_id: e.turma_id, turma_nome: e.turma_nome, componente_id: e.componente_id, tipo: e.tipo,
      professor_id: e.professor_id, professor_cpf: e.professor_cpf ?? null,
      dia: e.dia_semana, slot: e.aula_index, turnoId: e.turno_id, nome: e.componente_sigla,
    })),
  ];
  const porProf = new Map<string, typeof todas>();
  for (const l of todas) {
    const k = chaveProfessor(l.professor_id, l.professor_cpf);
    if (!k) continue;
    const arr = porProf.get(k);
    if (arr) arr.push(l); else porProf.set(k, [l]);
  }
  for (const [, linhas] of porProf) {
    for (let i = 0; i < linhas.length; i++) {
      for (let j = i + 1; j < linhas.length; j++) {
        if (linhas[i].turma_id === linhas[j].turma_id && linhas[i].componente_id === linhas[j].componente_id
            && linhas[i].dia === linhas[j].dia && linhas[i].slot === linhas[j].slot) continue;
        if (instante(linhas[i], linhas[j])) {
          falhar(`professor em duas salas: ${linhas[i].turma_nome}/${linhas[i].nome} e ${linhas[j].turma_nome}/${linhas[j].nome} em ${rotuloSlot(linhas[i].dia, linhas[i].slot)}`);
        }
      }
    }
  }

  /**
   * 3. professor alocado em horário vedado a ele
   *
   * Comparado ANTES x DEPOIS, e não em absoluto. A grade salva da Girassol já
   * chegou aqui com quatro aulas em horário vedado — defeito da geração, não do
   * plano. Reprovar o plano por causa delas esconderia o que importa: se o plano
   * CRIOU alguma. (E, de quebra, mostra quando ele conserta as que achou pelo
   * caminho.)
   */
  const vedadas = (linhas: typeof grade) => {
    const fora: string[] = [];
    for (const l of linhas) {
      if (!l.professor_id) continue;
      const p = profPorId.get(l.professor_id);
      const t = turnosById.get(l.turnoId);
      if (!p || !t) continue;
      const motivo = motivoImpedimento(paraCertificado(p), t, l.dia, l.slot);
      if (motivo) fora.push(`${p.nome} em ${rotuloSlot(l.dia, l.slot)} (${l.turma_nome}/${l.nome}) — ${motivo}`);
    }
    return fora;
  };

  const vedadasAntes = new Set(vedadas(aulas.map(a => ({
    turma_id: a.turma_id, turma_nome: a.turma_nome, componente_id: a.componente_id, tipo: a.tipo,
    professor_id: a.professor_id, professor_cpf: a.professor_cpf ?? null,
    dia: a.dia_semana, slot: a.aula_index, turnoId: a.turno_id,
    nome: a.componente_sigla || a.componente_nome,
  }))));
  const vedadasDepois = vedadas(grade);

  for (const v of vedadasDepois) {
    if (!vedadasAntes.has(v)) falhar(`o plano PÔS professor em horário vedado: ${v}`);
  }
  if (vedadasAntes.size > 0) {
    const resolvidasPeloPlano = [...vedadasAntes].filter(v => !vedadasDepois.includes(v)).length;
    console.log(
      `   aviso: a grade JÁ TINHA ${vedadasAntes.size} aula(s) com professor em horário vedado` +
      ` (defeito da geração)${resolvidasPeloPlano ? `; o plano corrigiu ${resolvidasPeloPlano} de passagem` : ''}.`,
    );
    for (const v of vedadasAntes) console.log(`      · ${v}${vedadasDepois.includes(v) ? '' : '  [corrigida]'}`);
  }

  // 4. o total de buracos não pode ter crescido
  const buracosDe = (linhas: { turma_id: string; dia: string; slot: number }[]) => {
    const turmas = new Set(linhas.map(l => l.turma_id));
    const ocupado = new Set(linhas.map(l => `${l.turma_id}|${l.dia}|${l.slot}`));
    let n = 0;
    for (const t of turmas) {
      for (const d of turno.dias_semana ?? []) {
        for (let s = 0; s < (turno.aulas_por_dia ?? 0); s++) {
          if (!ocupado.has(`${t}|${d}|${s}`)) n++;
        }
      }
    }
    return n;
  };
  const antes = buracosDe(aulas.map(a => ({ turma_id: a.turma_id, dia: a.dia_semana, slot: a.aula_index })));
  const depois = buracosDe(grade);
  console.log(`   buracos na grade: ${antes} antes -> ${depois} depois`);
  if (depois > antes) falhar(`o plano ABRIU ${depois - antes} buraco(s)`);
  if (depois !== antes - r.resolvidas) {
    falhar(`esperava ${antes - r.resolvidas} buracos depois de resolver ${r.resolvidas}, deu ${depois}`);
  }

  console.log(
    problemas === 0
      ? `\n   OK — o plano fecha ${r.resolvidas} de ${r.total} pendência(s) sem quebrar nada.\n`
      : `\n   ${problemas} PROBLEMA(S) no plano. Não aplicar.\n`,
  );

  await pool.end();
  process.exit(problemas === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
