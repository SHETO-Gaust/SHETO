/**
 * Cenários sintéticos para o certificado de inviabilidade.
 *
 * `npx tsx scripts/verificar-certificado.ts` — sai com código 1 se algum falhar.
 *
 * Existe por causa de um falso positivo em produção: o certificado contava
 * LINHAS de `horario_aulas` para saber quanto do turno o professor já tinha
 * gasto em outra grade. Como cada versão salva da grade repete a mesma aula,
 * um professor com 20 aulas no contraturno aparecia com 80 horários ocupados —
 * e a tela acusava sobrecarga de quem tinha a carga exata. Os casos abaixo
 * fixam as duas regras que passaram a valer: contar slots do turno (não linhas)
 * e só descontar o que colide de verdade em minutos.
 */
import { certificar } from '../src/lib/geracao/certificado';

const HORARIOS_MANHA = [
  { id: 'a1', inicio: '07:00', fim: '07:50' }, { id: 'a2', inicio: '07:50', fim: '08:40' },
  { id: 'a3', inicio: '08:40', fim: '09:30' }, { id: 'a4', inicio: '09:45', fim: '10:35' },
  { id: 'a5', inicio: '10:35', fim: '11:25' },
];
const HORARIOS_TARDE = [
  { id: 'a1', inicio: '13:00', fim: '13:50' }, { id: 'a2', inicio: '13:50', fim: '14:40' },
  { id: 'a3', inicio: '14:40', fim: '15:30' }, { id: 'a4', inicio: '15:45', fim: '16:35' },
  { id: 'a5', inicio: '16:35', fim: '17:25' },
];
const DIAS = ['segunda', 'terca', 'quarta', 'quinta', 'sexta'];
const manha: any = { id: 'T-M', nome: 'Matutino', ativo: true, dias_semana: DIAS, aulas_por_dia: 5, horarios: HORARIOS_MANHA };
const tarde: any = { id: 'T-V', nome: 'Vespertino', ativo: true, dias_semana: DIAS, aulas_por_dia: 5, horarios: HORARIOS_TARDE };
const manhaB: any = { id: 'T-M2', nome: 'Matutino B', ativo: true, dias_semana: DIAS, aulas_por_dia: 5, horarios: HORARIOS_MANHA };
const semHorario: any = { id: 'T-J', nome: 'Jornada', ativo: true, dias_semana: DIAS, aulas_por_dia: 5, horarios: [] };

const prof = (id: string) => ({ id, nome_horario: id, restricoes: {}, livre_docencia: [], sem_preferencia_livre_docencia: true });
const turma = (nome: string, aulas: number, profId: string) => ({
  id: `turma-${nome}`, nome,
  serie: { nome: 'S', componentes: [{ componente_id: 'C1', aulas_presenciais: aulas, aulas_nao_presenciais: 0 }] },
  professores: [{ professor_id: profId, componente_id: 'C1' }],
});
const ocupacao = (profId: string, turnoId: string, dia: string, idx: number, grade = 'g1') => ({
  professor_id: profId, dia_semana: dia, aula_index: idx, turno_id: turnoId, horario: { turno_id: turnoId }, grade,
});

const casos: { nome: string; dados: any; espera: string }[] = [
  {
    nome: 'sobrecarga real (26 aulas em turno de 25) deve acusar carga_professor',
    dados: { turnoData: manha, turmasDoTurno: [turma('A', 26, 'P1')], allProfessores: [prof('P1')], allTurnos: [manha], ocupacoes: [] },
    espera: 'carga_turma+carga_professor',
  },
  {
    nome: 'aulas de tarde NAO devem consumir horarios da manha',
    dados: {
      turnoData: manha, turmasDoTurno: [turma('A', 20, 'P1')], allProfessores: [prof('P1')], allTurnos: [manha, tarde],
      ocupacoes: DIAS.flatMap(d => [0, 1, 2, 3, 4].map(i => ocupacao('P1', 'T-V', d, i))),
    },
    espera: 'nenhuma',
  },
  {
    nome: 'a MESMA aula salva em 3 versoes da grade conta uma vez so',
    dados: {
      turnoData: manha, turmasDoTurno: [turma('A', 20, 'P1')], allProfessores: [prof('P1')], allTurnos: [manha, manhaB],
      // Turno com horario identico ao da manha: colide de verdade, 5 slots.
      ocupacoes: ['v1', 'v2', 'v3'].flatMap(v => DIAS.map(d => ocupacao('P1', 'T-M2', d, 0, v))),
    },
    espera: 'nenhuma',
  },
  {
    nome: 'turno sem horario deve acusar o turno, nao o professor',
    dados: {
      turnoData: manha, turmasDoTurno: [turma('A', 20, 'P1')], allProfessores: [prof('P1')], allTurnos: [manha, semHorario],
      ocupacoes: DIAS.map(d => ocupacao('P1', 'T-J', d, 0)),
    },
    espera: 'turno_sem_horario',
  },
  {
    nome: 'colisao real de horario que estoura a carga ainda deve acusar o professor',
    dados: {
      turnoData: manha, turmasDoTurno: [turma('A', 21, 'P1')], allProfessores: [prof('P1')], allTurnos: [manha, manhaB],
      ocupacoes: DIAS.map(d => ocupacao('P1', 'T-M2', d, 0)),
    },
    espera: 'carga_professor',
  },
];

let falhas = 0;
for (const c of casos) {
  const cert = certificar(c.dados);
  const tipos = [...new Set(cert.causas.map(x => x.tipo))];
  const obtido = tipos.length ? tipos.join('+') : 'nenhuma';
  const ok = obtido === c.espera;
  if (!ok) falhas++;
  console.log(`${ok ? 'OK  ' : 'FALHA'} ${c.nome}\n      esperado=${c.espera} obtido=${obtido}`);
  if (!ok) cert.causas.forEach(x => console.log(`         -> ${x.titulo}: ${x.detalhe}`));
}
console.log(falhas === 0 ? '\nTodos os cenarios passaram.' : `\n${falhas} cenario(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
