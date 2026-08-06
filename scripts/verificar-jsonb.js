/**
 * Verifica (e opcionalmente repara) as colunas jsonb que guardam LISTA e que
 * podem ter sido gravadas como objeto vazio.
 *
 * Contexto: antes do commit ff6935e o shim entregava um array JS cru ao
 * node-postgres, que o convertia para o literal de array do Postgres (`{}`).
 * O jsonb aceita isso sem reclamar, como OBJETO vazio. Onde deveria haver
 * `[]` ficou `{}` - sem erro e sem log. O codigo foi corrigido, mas linha ja
 * gravada continua torta ate alguem arrumar.
 *
 * Atencao: so as colunas abaixo guardam lista. `professores.restricoes` e
 * `series.restricoes` sao OBJETOS por design (mapa turno > dia > aula), onde
 * `{}` e o valor correto para "sem restricao". Reparar aquilo destruiria dado
 * legitimo - por isso a lista e fixa aqui e nao uma varredura generica.
 *
 * Uso:
 *   node scripts/verificar-jsonb.js              # so verifica, nao altera nada
 *   node scripts/verificar-jsonb.js --reparar    # corrige o que estiver torto
 */
const fs = require('fs');
const path = require('path');

// Colunas jsonb cujo conteudo e uma LISTA.
const COLUNAS_LISTA = [
  { tabela: 'professores', coluna: 'livre_docencia' },
  { tabela: 'turnos', coluna: 'horarios' },
];

// Carrega .env.local sem depender de dependencia extra.
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const linha of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const { Pool } = require('pg');
const reparar = process.argv.includes('--reparar');

(async () => {
  const pool = process.env.DATABASE_URL
    ? new Pool({ connectionString: process.env.DATABASE_URL })
    : new Pool();

  console.log(`Banco: ${process.env.PGDATABASE || '(DATABASE_URL)'} em ${process.env.PGHOST || '(host da URL)'}`);
  console.log(reparar ? 'Modo: VERIFICAR E REPARAR\n' : 'Modo: somente verificacao (nada sera alterado)\n');

  let totalTortas = 0;
  const paraReparar = [];

  for (const { tabela, coluna } of COLUNAS_LISTA) {
    const { rows } = await pool.query(
      `select count(*)::int total,
              count(*) filter (where "${coluna}" = '{}'::jsonb)::int tortas
         from "${tabela}"`
    );
    const { total, tortas } = rows[0];
    totalTortas += tortas;
    if (tortas > 0) paraReparar.push({ tabela, coluna, tortas });
    console.log(`  ${tabela}.${coluna}: ${tortas} torta(s) de ${total} linha(s)`);
  }

  if (totalTortas === 0) {
    console.log('\nOK - nenhuma linha precisa de reparo.');
    await pool.end();
    return;
  }

  if (!reparar) {
    console.log(`\n${totalTortas} linha(s) precisam de reparo.`);
    console.log('Faca backup do banco (pg_dump) e rode de novo com --reparar.');
    await pool.end();
    process.exitCode = 1;
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const { tabela, coluna, tortas } of paraReparar) {
      const r = await client.query(
        `update "${tabela}" set "${coluna}" = '[]'::jsonb where "${coluna}" = '{}'::jsonb`
      );
      console.log(`  ${tabela}.${coluna}: ${r.rowCount} linha(s) corrigida(s) (esperado ${tortas})`);
    }
    // Confere antes de confirmar: se sobrou alguma, algo saiu do previsto.
    let restantes = 0;
    for (const { tabela, coluna } of paraReparar) {
      const { rows } = await client.query(
        `select count(*)::int n from "${tabela}" where "${coluna}" = '{}'::jsonb`
      );
      restantes += rows[0].n;
    }
    if (restantes > 0) {
      await client.query('ROLLBACK');
      console.error(`\nABORTADO: ainda restam ${restantes} linha(s) tortas. Nada foi alterado.`);
      process.exitCode = 1;
    } else {
      await client.query('COMMIT');
      console.log('\nReparo concluido.');
    }
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('\nERRO - nada foi alterado:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})().catch((e) => {
  console.error('ERRO FATAL:', e.message);
  process.exit(1);
});
