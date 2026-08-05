import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

const checks = [];
function check(name, condition) {
  checks.push({ name, ok: Boolean(condition) });
  if (!condition) process.exitCode = 1;
}

const queryClient = read('src/lib/query-client.js');
const routeModules = read('src/lib/routeModules.js');
const layout = read('src/components/AppLayout.jsx');
const athletes = read('src/pages/Athletes.jsx');
const ranking = read('src/pages/Ranking.jsx');
const market = read('src/pages/WorldMarket.jsx');
const css = read('src/index.css');

check('cache de consultas configurado', queryClient.includes('staleTime') && queryClient.includes('gcTime'));
check('pré-carregamento em lote disponível', routeModules.includes('preloadRoutes'));
check('rotas principais pré-carregadas em tempo ocioso', layout.includes('requestIdleCallback') && layout.includes("'/game/calendar'"));
check('atletas usam busca adiada e memoização', athletes.includes('useDeferredValue') && athletes.includes('useMemo'));
check('atletas usam carregamento progressivo', athletes.includes('visibleCount') && athletes.includes('PAGE_SIZE'));
check('ranking usa memoização pesada', ranking.includes('useMemo') && ranking.includes('circuitAthletes'));
check('ranking limita renderização inicial', ranking.includes('slice(0, visibleCount)'));
check('mercado limita todas as listas extensas', market.includes('coaches.slice(0, visibleCount)') && market.includes('recentMovements.slice(0, visibleCount)'));
check('itens fora da tela usam content-visibility', css.includes('.render-window > *') && css.includes('content-visibility: auto'));

for (const item of checks) console.log(`${item.ok ? '✓' : '✗'} ${item.name}`);
if (!process.exitCode) console.log(`\nPerformanceV31Test: PASS (${checks.length}/${checks.length})`);
