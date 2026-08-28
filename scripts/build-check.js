/**
 * Build de verificação que não atrapalha o `npm run dev`.
 *
 * Duas coisas precisam de cuidado ao construir com o dev server no ar:
 *
 * 1. A pasta de saída. `next dev` serve de `.next/`; um build de produção na
 *    mesma pasta troca manifestos e chunks debaixo dele, que passa a dar 404
 *    até ser reiniciado. Daí o NEXT_DIST_DIR.
 *
 * 2. `tsconfig.json` e `next-env.d.ts`. O Next REESCREVE os dois a cada build
 *    para apontar para a distDir da vez — com NEXT_DIST_DIR eles ficariam
 *    apontando para `.next-check`, quebrando os tipos do dev e sujando dois
 *    arquivos versionados. Por isso são salvos antes e restaurados depois,
 *    inclusive quando o build falha.
 *
 * Restaura o conteúdo salvo, e não `git checkout`: alteração legítima que o
 * usuário tenha nesses arquivos seria descartada por um checkout.
 */
const { spawnSync } = require('child_process');
const { readFileSync, writeFileSync, existsSync } = require('fs');

const PRESERVAR = ['tsconfig.json', 'next-env.d.ts'];
const antes = new Map();
for (const arquivo of PRESERVAR) {
  if (existsSync(arquivo)) antes.set(arquivo, readFileSync(arquivo));
}

const r = spawnSync('npx', ['cross-env', 'NEXT_DIST_DIR=.next-check', 'NODE_ENV=production', 'next', 'build'], {
  stdio: 'inherit',
  shell: true,
});

for (const [arquivo, conteudo] of antes) {
  if (!readFileSync(arquivo).equals(conteudo)) writeFileSync(arquivo, conteudo);
}

process.exit(r.status ?? 1);
