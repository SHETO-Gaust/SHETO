/**
 * O refino contra uma grade salva de verdade.
 *
 *   npx tsx scripts/testar-refino.ts <horario_id>                     → auditoria
 *   npx tsx scripts/testar-refino.ts <horario_id> <aulaA> <aulaB>     → troca
 *
 * Sem os ids das aulas ele AUDITA: monta o mesmo contexto que a tela monta
 * (a grade aberta mais uma grade de referência por turno) e lista todo choque
 * de professor que existe ali — inclusive, e principalmente, o choque entre
 * turnos de nomes diferentes que correm no mesmo horário de relógio, que era o
 * que passava batido.
 *
 * Com os dois ids ele analisa a TROCA e depois CONFERE o veredito do zero:
 * aplica os dois movimentos numa cópia e procura choque de turma, choque de
 * professor e restrição violada por conta própria, sem passar pelo motor. Um
 * "ok" que não sobrevive à conferência é pior que um "bloqueado": o coordenador
 * grava e só descobre quando o professor reclama.
 *
 * Irmã de `scripts/testar-preenchimento.ts`, e pela mesma razão.
 */
import { config as carregarEnv } from 'dotenv';
carregarEnv({ path: '.env.local' });
carregarEnv();

import { getPool } from '../src/lib/db/pool';
import { getSlotMinutes, minutesConflitam, turnosSemHorarioCompleto } from '../src/lib/horario-slots';
import { chaveProfessor, restricaoDoSlot, type ProfessorRefino } from '../src/lib/refino/professor';
import {
  analisarTroca,
  type AulaRefino,
  type ContextoRefino,
} from '../src/lib/refino-horario';
import {
  resolverGradesDeReferencia,
  type GradeCandidata,
} from '../src/lib/refino/grades-de-referencia';
import type { Turno } from '../src/lib/types';

const horarioId = process.argv[2];
const aulaAId = process.argv[3];
const aulaBId = process.argv[4];

if (!horarioId) {
  console.error('uso: npx tsx scripts/testar-refino.ts <horario_id> [aulaA_id aulaB_id]');
  process.exit(1);
}

const SELECT_AULAS = `
  select ha.id, ha.horario_id, h.nome as horario_nome, ha.turma_id,
         t.nome as turma_nome, ha.componente_id, c.nome as componente_nome,
         coalesce(c.sigla,'') as componente_sigla, ha.professor_id,
         coalesce(p.nome_horario,'Sem Professor') as professor_nome, p.cpf as professor_cpf,
         ha.dia_semana, ha.aula_index, ha.tipo, ha.turno_id, ha.aula_fixa_id,
         ha.compartilhada, ha.aula_compartilhada_id
    from horario_aulas ha
    join horarios h on h.id = ha.horario_id
    join turmas t on t.id = ha.turma_id
    join componentes_curriculares c on c.id = ha.componente_id
    left join professores p on p.id = ha.professor_id
   where ha.horario_id = ANY($1::uuid[])`;

const rotulo = (a: AulaRefino) =>
  `${a.componente_sigla || a.componente_nome} · ${a.turma_nome} · ${a.professor_nome} · ${a.dia_semana} ${a.aula_index + 1}ª`;

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

  const { rows: gradesRows } = await pool.query(
    `select h.id, h.nome, h.status, h.turno_id, tn.nome as turno_nome, h.created_at
       from horarios h join turnos tn on tn.id = h.turno_id
      where h.escola_id = $1`, [horario.escola_id],
  );
  const candidatos = gradesRows as GradeCandidata[];

  const { referencias } = resolverGradesDeReferencia(candidatos, horario.id, horario.turno_id);

  console.log(`\nGrade em edição: "${horario.nome}" (${horario.status}) — turno ${turnosById.get(horario.turno_id)?.nome}`);
  console.log('Grades de referência (uma por turno):');
  if (referencias.length === 0) console.log('  — nenhuma —');
  referencias.forEach(r => console.log(`  ${r.turno_nome}: "${r.horario_nome}" (${r.status})`));

  const { rows: moveisRows } = await pool.query(SELECT_AULAS, [[horarioId]]);
  const aulasMoveis: AulaRefino[] = moveisRows.map(a => ({ ...a, movel: true }));

  const turmasEmEdicao = new Set(aulasMoveis.map(a => a.turma_id));
  const idsRef = referencias.map(r => r.horario_id);
  const { rows: refRows } = idsRef.length
    ? await pool.query(SELECT_AULAS, [idsRef])
    : { rows: [] as any[] };
  const aulasReferencia: AulaRefino[] = refRows
    .filter(a => !turmasEmEdicao.has(a.turma_id))
    .map(a => ({ ...a, movel: false }));

  const todas = [...aulasMoveis, ...aulasReferencia];
  const professorIds = Array.from(new Set(todas.map(a => a.professor_id).filter(Boolean)));
  const { rows: profRows } = professorIds.length
    ? await pool.query(
        `select id, nome_horario, cpf, restricoes, livre_docencia, sem_preferencia_livre_docencia
           from professores where id = ANY($1::uuid[])`, [professorIds])
    : { rows: [] as any[] };

  const professores: ProfessorRefino[] = profRows.map(p => ({
    id: p.id, nome: p.nome_horario ?? '', cpf: p.cpf,
    restricoes: p.restricoes, livre_docencia: p.livre_docencia ?? [],
    sem_preferencia_livre_docencia: p.sem_preferencia_livre_docencia,
  }));

  const ctx: ContextoRefino = {
    aulasMoveis,
    aulasReferencia,
    turnosById,
    professoresById: new Map(professores.map(p => [p.id, p])),
  };

  console.log(`\n${aulasMoveis.length} aula(s) móveis · ${aulasReferencia.length} de referência · ${professores.length} professor(es)`);

  const incompletos = turnosSemHorarioCompleto(
    turnos.filter(t => todas.some(a => a.turno_id === t.id)),
  );
  if (incompletos.length > 0) {
    console.log('\n⚠ Turnos sem horário completo no cadastro (toda comparação cruzada com eles é recusada por precaução):');
    incompletos.forEach(t => console.log(`  ${t.nome}: faltam ${t.faltam} horário(s)`));
  }

  if (aulaAId && aulaBId) return conferirTroca(ctx, aulaAId, aulaBId);
  return auditar(ctx);
}

/** Sobreposição real de duas aulas, calculada aqui, sem passar pelo motor. */
function batem(ctx: ContextoRefino, a: AulaRefino, b: AulaRefino): boolean {
  if (a.dia_semana !== b.dia_semana) return false;
  const [i1, f1] = getSlotMinutes(ctx.turnosById.get(a.turno_id), a.aula_index);
  const [i2, f2] = getSlotMinutes(ctx.turnosById.get(b.turno_id), b.aula_index);
  return minutesConflitam(i1, f1, i2, f2, a.turno_id === b.turno_id, a.aula_index, b.aula_index);
}

const mesmaPessoa = (a: AulaRefino, b: AulaRefino) => {
  const ka = chaveProfessor(a.professor_id, a.professor_cpf);
  return !!ka && ka === chaveProfessor(b.professor_id, b.professor_cpf);
};

const aulaColetiva = (a: AulaRefino, b: AulaRefino) =>
  !!a.aula_compartilhada_id && a.aula_compartilhada_id === b.aula_compartilhada_id;

/** Todo choque que existe na grade como ela está agora. */
function auditar(ctx: ContextoRefino) {
  const todas = [...ctx.aulasMoveis, ...ctx.aulasReferencia];
  const choques: string[] = [];
  const entreGrades: string[] = [];

  for (let i = 0; i < todas.length; i++) {
    for (let j = i + 1; j < todas.length; j++) {
      const A = todas[i], B = todas[j];
      if (!batem(ctx, A, B)) continue;

      if (A.turma_id === B.turma_id) {
        choques.push(`TURMA  ${rotulo(A)}  ⨯  ${rotulo(B)}`);
        continue;
      }
      if (mesmaPessoa(A, B) && !aulaColetiva(A, B)) {
        const linha = `PROF   ${rotulo(A)} [${A.horario_nome}]  ⨯  ${rotulo(B)} [${B.horario_nome}]`;
        if (A.horario_id !== B.horario_id) entreGrades.push(linha);
        else choques.push(linha);
      }
    }
  }

  console.log(`\n── Choques DENTRO da grade em edição: ${choques.length}`);
  choques.slice(0, 40).forEach(c => console.log('  ' + c));
  if (choques.length > 40) console.log(`  … e mais ${choques.length - 40}`);

  console.log(`\n── Choques ENTRE grades (é o que o refino não enxergava): ${entreGrades.length}`);
  entreGrades.slice(0, 40).forEach(c => console.log('  ' + c));
  if (entreGrades.length > 40) console.log(`  … e mais ${entreGrades.length - 40}`);

  console.log('\nPara analisar uma troca: npx tsx scripts/testar-refino.ts <horario_id> <aulaA_id> <aulaB_id>');
}

/** Analisa a troca e confere o veredito por fora do motor. */
function conferirTroca(ctx: ContextoRefino, aId: string, bId: string) {
  const todas = [...ctx.aulasMoveis, ...ctx.aulasReferencia];
  const A = todas.find(x => x.id === aId);
  const B = todas.find(x => x.id === bId);
  if (!A || !B) {
    console.error('\n✗ Uma das aulas não está nesta grade nem nas de referência.');
    process.exitCode = 1;
    return;
  }

  console.log(`\nTroca proposta:\n  A: ${rotulo(A)} [${A.horario_nome}]\n  B: ${rotulo(B)} [${B.horario_nome}]`);

  const r = analisarTroca(ctx, aId, bId);
  console.log(`\nMotor: ${r.status.toUpperCase()} — ${r.mensagem}`);
  r.lados.forEach(l => {
    if (l.impedimento) console.log(`  ✗ ${l.rotulo}: ${l.impedimento} — ${l.texto}`);
  });
  r.avisos.forEach(a => console.log(`  ⚠ ${a}`));

  if (r.status !== 'ok') {
    console.log('\nNada a conferir: o motor recusou.');
    return;
  }

  // ── Conferência independente ─────────────────────────────────────────────
  const depois = todas.map(x => {
    if (x.id === A.id) return { ...x, dia_semana: B.dia_semana, aula_index: B.aula_index, turno_id: B.turno_id };
    if (x.id === B.id) return { ...x, dia_semana: A.dia_semana, aula_index: A.aula_index, turno_id: A.turno_id };
    return x;
  });

  const problemas: string[] = [];
  for (const alvo of depois.filter(x => x.id === A.id || x.id === B.id)) {
    for (const outra of depois) {
      if (outra.id === alvo.id) continue;
      if (!batem(ctx, alvo, outra)) continue;
      if (outra.turma_id === alvo.turma_id) {
        problemas.push(`turma ${alvo.turma_nome} com duas aulas: ${rotulo(alvo)} ⨯ ${rotulo(outra)}`);
      } else if (mesmaPessoa(alvo, outra) && !aulaColetiva(alvo, outra)) {
        problemas.push(`${alvo.professor_nome} em dois lugares: ${rotulo(alvo)} ⨯ ${rotulo(outra)} [${outra.horario_nome}]`);
      }
    }

    if (alvo.professor_id) {
      const { dura } = restricaoDoSlot(
        ctx.professoresById?.get(alvo.professor_id),
        ctx.turnosById.get(alvo.turno_id), alvo.dia_semana, alvo.aula_index,
      );
      if (dura) problemas.push(`${alvo.professor_nome} tem restrição "${dura}" no destino`);
    }
  }

  if (problemas.length === 0) {
    console.log('\n✓ Conferência independente: a troca não cria choque nem viola restrição.');
  } else {
    console.log(`\n✗ Conferência independente encontrou ${problemas.length} problema(s) que o motor deixou passar:`);
    problemas.forEach(p => console.log('  ' + p));
    process.exitCode = 1;
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch(e => { console.error(e); process.exit(1); });
