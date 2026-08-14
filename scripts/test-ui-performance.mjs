// Gate de performance do redesign UI/UX (Fase 2 — Design System 2.0).
// Não mede tempo de execução; verifica estaticamente que o redesign não
// reintroduziu os riscos já mapeados em docs/UI_UX_AUDIT.md seção 7:
// imports eager, listas sem paginação, animação contínua sem guarda de
// baixa performance, polling novo e assets gráficos grandes.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (relPath) => fs.readFileSync(path.join(root, relPath), 'utf8');
const exists = (relPath) => fs.existsSync(path.join(root, relPath));

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, out);
    else if (/\.(jsx?|tsx?)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

let checks = 0;
function check(label, condition) {
  checks += 1;
  if (!condition) throw new Error(`FALHA: ${label}`);
}

// 1. Rotas continuam carregadas sob demanda — nenhuma página estática no entrypoint.
const appJsx = read('src/App.jsx');
check('App.jsx importa uma página estaticamente (deveria usar PAGE_LOADERS/lazy)', !/from ['"]@\/pages\//.test(appJsx));
check('App.jsx não usa mais lazy() para páginas', appJsx.includes('lazy(') && appJsx.includes('PAGE_LOADERS'));
check('routeModules.js (registro central de lazy loading) ausente', exists('src/lib/routeModules.js'));

// 2. Ranking — a lista mais sensível a virtualização (auditoria seção 7) continua paginada.
const ranking = read('src/pages/Ranking.jsx');
check('Ranking.jsx perdeu a paginação em lotes (LIST_PAGE_SIZE)', ranking.includes('LIST_PAGE_SIZE'));
check('Ranking.jsx renderiza a lista sem slice/limite', ranking.includes('.slice(0, visibleCount)'));

// 3. Política de motion — qualquer animação contínua nova precisa checar allowDecorativeMotion/lowPower.
const srcFiles = walk('src');
const offenders = [];
for (const file of srcFiles) {
  const source = read(file);
  if (!/repeat:\s*Infinity/.test(source)) continue;
  if (!/allowDecorativeMotion|useMotionPolicy|lowPower/.test(source)) offenders.push(file);
}
check(
  `animação contínua (repeat: Infinity) sem guarda de baixa performance em: ${offenders.join(', ')}`,
  offenders.length === 0,
);

// 4. Polling — nenhum setInterval novo fora da lista já auditada/aceita.
// Lista viva: CommunicationBell (60s, rede de segurança com cleanup), BetaTools
// (15s, só com o painel BETA aberto) e TrainingTimerModal (1s, contador de um
// modal de treino específico, não polling de dados). Qualquer novo setInterval
// precisa ser adicionado aqui conscientemente, não silenciosamente.
const KNOWN_INTERVAL_FILES = new Set([
  'src/components/communications/CommunicationBell.jsx',
  'src/components/system/BetaTools.jsx',
  'src/components/training/TrainingTimerModal.jsx',
]);
const intervalFiles = srcFiles.filter((file) => /setInterval\(/.test(read(file)));
const newIntervals = intervalFiles.filter((file) => !KNOWN_INTERVAL_FILES.has(file.replace(/\\/g, '/')));
check(`setInterval novo introduzido sem revisão: ${newIntervals.join(', ')}`, newIntervals.length === 0);

// 5. Assets gráficos — o master oficial raster pode ter até 1.1 MB; os
//    assets auxiliares continuam sob orçamento pequeno.
const BRAND_ASSETS = [
  'src/assets/brand/logo-mark.svg',
  'src/assets/brand/app-icon-master.png',
  'src/assets/brand/logo-horizontal.svg',
  'src/assets/brand/logo-monochrome.svg',
  'public/favicon-16.png',
  'public/favicon-32.png',
];
for (const file of BRAND_ASSETS) {
  const size = fs.statSync(path.join(root, file)).size;
  const budgetBytes = file.endsWith('app-icon-master.png') ? 1_100_000 : 15 * 1024;
  check(`asset de marca acima do orçamento de ${(budgetBytes / 1024).toFixed(0)}KB: ${file} (${(size / 1024).toFixed(1)}KB)`, size <= budgetBytes);
}

// 6. Recharts (chunk de ~374KB já documentado) continua só atrás de rotas lazy.
const rechartsConsumers = srcFiles.filter((file) => /from ['"]recharts['"]/.test(read(file)));
for (const file of rechartsConsumers) {
  check(`${file} importa recharts fora de src/pages ou src/components (verifique se é consumido só por rota lazy)`,
    file.startsWith('src/pages/') || file.startsWith('src/components/'));
}

// 7. Dependências pesadas — o redesign não deve adicionar bibliotecas visuais
//    gigantes (auditoria seção 22/PROJECT-CLEANUP-AUDIT-RC já removeu várias).
const packageJson = JSON.parse(read('package.json'));
const HEAVY_BLOCKLIST = ['moment', 'lodash', 'three', 'chart.js', 'html2canvas', 'jspdf', 'react-quill', 'react-markdown', '@stripe/stripe-js'];
const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
const reintroduced = HEAVY_BLOCKLIST.filter((name) => Object.prototype.hasOwnProperty.call(deps, name));
check(`dependência pesada reintroduzida: ${reintroduced.join(', ')}`, reintroduced.length === 0);

console.log('UiPerformanceTest: PASS');
console.log(`✓ ${checks} verificações — lazy loading, paginação, motion policy, polling e orçamento de assets`);
