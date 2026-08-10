/**
 * Diagnóstico de login em produção.
 *
 * O NextAuth só emite `CredentialsSignin` quando o `authorize()` devolve null
 * (ver src/lib/auth/index.ts). Falha de conexão com o Postgres produziria
 * `CallbackRouteError`, não este erro. Logo, uma destas três coisas aconteceu:
 *
 *   1. nenhuma linha em auth.users com aquele e-mail
 *   2. a linha existe mas encrypted_password está nulo/vazio
 *   3. o hash existe mas bcrypt.compare devolveu false
 *
 * O código de produção não distingue os três casos (o authorize devolve null
 * em todos e o auth-shim reescreve como "Credenciais invalidas"). Este script
 * distingue.
 *
 * Uso na VM, a partir da raiz do projeto:
 *
 *   node scripts/diagnostico-login.js                      # panorama geral
 *   node scripts/diagnostico-login.js fulano@seduc.to.gov.br
 *   node scripts/diagnostico-login.js fulano@seduc.to.gov.br 'senha'
 *
 * A senha é opcional e serve para testar o bcrypt.compare exatamente como o
 * authorize faz. Ela não é gravada em lugar nenhum.
 */

const path = require('path');

// Resolvido a partir do próprio arquivo, não do cwd: assim o script funciona
// tanto de dentro de scripts/ quanto da raiz do projeto.
const ENV_PATH = path.resolve(__dirname, '..', '.env.local');

// dotenv vem junto com o Next; se não estiver acessível, as variáveis PG* do
// ambiente do pm2 já bastam.
try {
  const r = require('dotenv').config({ path: ENV_PATH });
  console.log(r.error ? `(não li ${ENV_PATH}: ${r.error.message})` : `(lido: ${ENV_PATH})`);
} catch {
  console.log('(dotenv indisponível — usando apenas as variáveis do ambiente)');
}

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const [, , emailArg, senhaArg] = process.argv;

async function main() {
  // Sem isto, um PGPASSWORD ausente aparece só como um erro obscuro de SASL.
  console.log('\n== Variáveis lidas ==');
  console.table(
    ['PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE', 'DATABASE_URL'].map((k) => ({
      variavel: k,
      valor: k === 'PGPASSWORD' || k === 'DATABASE_URL'
        ? (process.env[k] ? '(definida)' : '(AUSENTE)')
        : (process.env[k] ?? '(AUSENTE)'),
    }))
  );

  const pool = process.env.DATABASE_URL
    ? new Pool({ connectionString: process.env.DATABASE_URL })
    : new Pool();

  const alvo = await pool.query(
    'select current_database() as db, current_user as usuario, inet_server_addr() as host, inet_server_port() as porta'
  );
  console.log('\n== Conexão ==');
  console.table(alvo.rows);

  const existeSchema = await pool.query(
    "select to_regclass('auth.users') is not null as tem_tabela"
  );
  if (!existeSchema.rows[0].tem_tabela) {
    console.log('\nauth.users NÃO existe neste banco. O app está apontando para o banco errado.');
    await pool.end();
    process.exit(1);
  }

  const resumo = await pool.query(`
    select
      count(*)                                                        as usuarios,
      count(*) filter (where encrypted_password is null
                          or encrypted_password = '')                 as sem_hash,
      count(*) filter (where encrypted_password not like '$2%')       as hash_nao_bcrypt,
      count(*) filter (where email <> btrim(email))                   as email_com_espaco
    from auth.users
  `);
  console.log('\n== auth.users ==');
  console.table(resumo.rows);

  const prefixos = await pool.query(`
    select substring(encrypted_password from 1 for 4) as prefixo, count(*)
    from auth.users
    where encrypted_password is not null
    group by 1 order by 2 desc
  `);
  console.log('\n== Prefixos de hash (bcryptjs aceita $2a$, $2b$, $2y$) ==');
  console.table(prefixos.rows);

  if (!emailArg) {
    console.log('\nPasse um e-mail como argumento para investigar um usuário específico.\n');
    await pool.end();
    return;
  }

  // Mesma consulta do authorize, sem trim — é o comportamento real de produção.
  const { rows } = await pool.query(
    'select id, email, encrypted_password from auth.users where lower(email) = lower($1) limit 1',
    [emailArg]
  );

  console.log(`\n== Usuário "${emailArg}" ==`);
  if (rows.length === 0) {
    console.log('CAUSA 1: nenhuma linha corresponde. authorize() devolve null aqui.');

    // O trim revela o caso em que só um espaço sobrando separa o usuário do login.
    const comTrim = await pool.query(
      'select id, email from auth.users where lower(btrim(email)) = lower(btrim($1)) limit 1',
      [emailArg]
    );
    if (comTrim.rows.length > 0) {
      console.log('-> Mas casa com btrim aplicado: há espaço em branco no e-mail (banco ou digitação).');
      console.table(comTrim.rows);
    }

    const parecidos = await pool.query(
      'select email from auth.users where email ilike $1 limit 10',
      ['%' + emailArg.trim().split('@')[0] + '%']
    );
    if (parecidos.rows.length > 0) {
      console.log('-> E-mails parecidos no banco:');
      console.table(parecidos.rows);
    }
    await pool.end();
    return;
  }

  const row = rows[0];
  console.log('id:     ', row.id);
  console.log('email:  ', JSON.stringify(row.email)); // aspas expõem espaços invisíveis
  console.log('hash:   ', row.encrypted_password ? row.encrypted_password.slice(0, 7) + '...' : '(vazio)');
  console.log('tamanho:', row.encrypted_password ? row.encrypted_password.length : 0, '(bcrypt = 60)');

  if (!row.encrypted_password) {
    console.log('\nCAUSA 2: encrypted_password vazio. authorize() devolve null aqui.');
    await pool.end();
    return;
  }

  if (!senhaArg) {
    console.log('\nUsuário e hash presentes. Rode de novo passando a senha para testar o bcrypt.compare.\n');
    await pool.end();
    return;
  }

  const ok = await bcrypt.compare(senhaArg, row.encrypted_password);
  console.log('\nbcrypt.compare:', ok);
  console.log(ok
    ? 'Senha confere. O authorize() deveria ter autenticado — o problema não está na verificação de senha.'
    : 'CAUSA 3: hash não confere com esta senha. authorize() devolve null aqui.');

  await pool.end();
}

main().catch((err) => {
  console.error('\nFalhou antes de chegar à verificação:', err.message);
  if (/password must be a string|SASL/i.test(err.message)) {
    console.error('-> PGPASSWORD não chegou ao processo. Veja a tabela "Variáveis lidas" acima:');
    console.error('   se o .env.local não foi lido, exporte as variáveis na mão antes de rodar.');
  } else {
    console.error('-> Se for erro de conexão, as variáveis PG* / DATABASE_URL do pm2');
    console.error('   não são as mesmas que este script está enxergando.');
  }
  process.exit(1);
});
