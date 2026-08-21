/**
 * Aplica um arquivo .sql de supabase/migrations/ no Postgres configurado.
 *
 * Contexto: o projeto nao roda o Supabase hospedado — `src/lib/db/pool.ts` fala
 * com um Postgres direto, lendo PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE do
 * .env.local. E `psql` nao esta no PATH desta maquina. Este script fecha essa
 * lacuna usando o `pg` que o projeto ja tem como dependencia, para aplicar uma
 * migration sem instalar nada.
 *
 * O SQL roda dentro de uma transacao: ou tudo passa, ou nada e gravado.
 *
 * Uso:
 *   node scripts/aplicar-migration.js 20260820_add_tutoriais_vistos.sql
 *   node scripts/aplicar-migration.js 20260820_add_tutoriais_vistos.sql --simular
 *
 * Com --simular o SQL e executado e depois desfeito (ROLLBACK): serve para
 * conferir que ele roda sem erro antes de gravar de verdade.
 */
const fs = require('fs');
const path = require('path');

// Carrega .env.local sem depender de dependencia extra.
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const linha of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const { Pool } = require('pg');

const argumentos = process.argv.slice(2).filter(a => !a.startsWith('--'));
const simular = process.argv.includes('--simular');
const nomeArquivo = argumentos[0];

if (!nomeArquivo) {
  console.error('Informe o arquivo da migration.');
  console.error('Ex.: node scripts/aplicar-migration.js 20260820_add_tutoriais_vistos.sql');
  process.exit(1);
}

const caminho = path.isAbsolute(nomeArquivo)
  ? nomeArquivo
  : path.join(__dirname, '..', 'supabase', 'migrations', nomeArquivo);

if (!fs.existsSync(caminho)) {
  console.error(`Arquivo nao encontrado: ${caminho}`);
  process.exit(1);
}

const sqlBruto = fs.readFileSync(caminho, 'utf8');

/**
 * Remove o BEGIN;/COMMIT; que os arquivos de migration trazem por conta propria.
 *
 * Sem isto o `--simular` MENTIA. Este script abre a sua propria transacao e
 * termina em ROLLBACK quando simula — mas o COMMIT de dentro do arquivo fecha a
 * transacao antes disso, e o ROLLBACK seguinte nao tem mais o que desfazer. O
 * resultado e' que a "simulacao" gravava de verdade, e so avisava depois que
 * "foi desfeito". Descoberto ao rodar 20260821_multiplos_professores_por_componente.sql:
 * a simulacao aplicou a migration, e a execucao real falhou dizendo que a
 * constraint ja existia.
 *
 * Tirando os delimitadores do arquivo, quem manda na transacao passa a ser este
 * script — que e' o unico que sabe se a intencao era gravar ou ensaiar.
 */
const sql = sqlBruto.replace(/^[ \t]*(BEGIN|COMMIT)[ \t]*;[ \t]*$/gim, '');

if (sql !== sqlBruto) {
  console.log('Nota    : BEGIN/COMMIT do arquivo removidos; a transacao e controlada por este script.');
}

(async () => {
  const pool = process.env.DATABASE_URL
    ? new Pool({ connectionString: process.env.DATABASE_URL })
    : new Pool();

  const alvo = process.env.DATABASE_URL
    ? '(DATABASE_URL)'
    : `${process.env.PGDATABASE} em ${process.env.PGHOST}:${process.env.PGPORT || 5432}`;

  console.log(`Banco   : ${alvo}`);
  console.log(`Migration: ${path.basename(caminho)}`);
  console.log(simular ? 'Modo    : SIMULACAO (sera desfeita ao final)\n' : 'Modo    : aplicar de verdade\n');

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    await cliente.query(sql);

    if (simular) {
      await cliente.query('ROLLBACK');
      console.log('OK: o SQL rodou sem erro e foi desfeito. Rode sem --simular para gravar.');
    } else {
      await cliente.query('COMMIT');
      console.log('OK: migration aplicada.');
    }
  } catch (erro) {
    await cliente.query('ROLLBACK').catch(() => {});
    console.error('FALHOU, nada foi gravado:');
    console.error(`  ${erro.message}`);
    process.exitCode = 1;
  } finally {
    cliente.release();
    await pool.end();
  }
})();
