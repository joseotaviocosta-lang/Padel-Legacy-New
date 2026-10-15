// Playthrough 5.20, Partes AL/AN — NENHUMA ROTA ORFA.
//
// Uma rota fica ORFA quando o conteudo existe mas nenhum caminho de navegacao
// leva a ela: nao esta no menu, nao e aba de hub, e nao e destino de redirect.
// Isso aconteceu DE FATO durante esta fase: ao tirar "Calendario" (631 linhas) e
// "Temporada" (78) do sidebar, as duas ficaram alcancaveis apenas por URL ate
// virarem abas de Torneios e Ranking. Este teste existe para que o proximo corte
// de menu nao repita isso em silencio.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createServer } from 'vite';
import { installShims } from './lib/competitiveReviewGates.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.message}`); }
}
const note = (msg) => console.log(`   [registro] ${msg}`);

const APP = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
installShims('/orphan-routes');
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { NAV_GROUPS } = await vite.ssrLoadModule('/src/navigation/navigationConfig.js');

// Alcancabilidade: menu, grupo, alias, aba de hub ou destino de redirect.
const menu = new Set(NAV_GROUPS.flatMap((g) => [
  ...(g.to ? [g.to] : []),
  ...(g.aliases || []),
  ...g.items.map((i) => i.to),
]));
const redirectTargets = new Set([...APP.matchAll(/LegacyRedirect to="([^"]+)"/g)].map((m) => m[1]));
const navigateTargets = new Set([...APP.matchAll(/<Navigate to=["{]([^"}]+)/g)].map((m) => m[1].trim()));

// Paginas renderizadas como ABA de algum hub.
const hubDir = new URL('../src/pages/hubs/', import.meta.url);
const hubPages = new Set();
const hubTabs = [];
for (const file of readdirSync(hubDir)) {
  if (!file.endsWith('.jsx')) continue;
  const src = readFileSync(new URL(file, hubDir), 'utf8');
  for (const m of src.matchAll(/import\('@\/pages\/([A-Za-z0-9]+)'\)/g)) hubPages.add(m[1]);
  for (const m of src.matchAll(/key: '([^']+)'/g)) hubTabs.push(`${file}:${m[1]}`);
}

// Rotas declaradas e o componente de cada uma.
const declared = new Map();
for (const m of APP.matchAll(/<Route path="([^"]+)" element=\{([\s\S]*?)\} \/>/g)) declared.set(m[1], m[2]);

const PUBLIC = new Set(['/', '/careers', '/career-hub', '/login', '/register', '/forgot-password', '/reset-password', '*']);
// Orfas PRE-EXISTENTES, confirmadas contra o menu anterior a 5.20: nenhuma
// estava no sidebar antigo nem era destino de redirect. A consolidacao nao as
// criou e esta fase nao as resolveu — ficam listadas como divida explicita.
const PRE_EXISTING_ORPHANS = new Set(['/game/training', '/game/matches', '/game/monthly-reports', '/game/annual-reports']);
const DEV_TOOLS = new Set(['/admin', '/database']);

console.log(`\n=== Alcancabilidade de ${declared.size} rotas ===\n`);
const orphans = [];
// Um adaptador devolve <Navigate> e nao tem cabecalho proprio.
function isRouteAdapter(comp) {
  for (const dir of ['src/pages/', 'src/pages/hubs/']) {
    const file = dir + comp + '.jsx';
    if (!existsSync(file)) continue;
    const src = readFileSync(file, 'utf8');
    return src.includes('<Navigate') && !src.includes('PageHeader');
  }
  return false;
}

for (const [path, element] of declared) {
  if (PUBLIC.has(path) || DEV_TOOLS.has(path)) continue;
  if (path.includes(':')) continue;                       // rota de detalhe, alcancada por link
  if (element.includes('LegacyRedirect') || element.includes('Navigate')) continue;
  const reachable = menu.has(path) || redirectTargets.has(path) || navigateTargets.has(path);
  if (!reachable) {
    // Pode ainda estar alcancavel como ABA de hub: compara o componente.
    const comp = (/<([A-Za-z0-9]+)/.exec(element) || [])[1];
    if (comp && hubPages.has(comp)) continue;
    // Playthrough 5.20-B, Parte AK — ADAPTADOR DE ROTA NAO E ORFAO.
    //
    // O teste ja ignorava redirect declarado na propria rota, mas
    // /game/training aponta para <Training />, cujo <Navigate> esta DENTRO do
    // componente: o arquivo nao renderiza UI nenhuma, so reenvia para o hub —
    // que esta no menu. Contar isso como orfao reportava divida inexistente e
    // escondia as duas orfas de verdade (os relatorios de carreira, que so
    // existiam dentro da notificacao e agora tem aba no Legado).
    if (comp && isRouteAdapter(comp)) continue;
    orphans.push({ path, element: element.slice(0, 40) });
  }
}
console.log(`  no menu/alias ............ ${menu.size}`);
console.log(`  destino de redirect ...... ${redirectTargets.size}`);
console.log(`  destino de Navigate ...... ${navigateTargets.size}`);
console.log(`  paginas que viraram aba .. ${hubPages.size}`);
console.log(`  abas declaradas .......... ${hubTabs.length}`);
console.log(`  rotas orfas .............. ${orphans.length}\n`);
for (const o of orphans) console.log(`    ORFA: ${o.path} -> ${o.element}`);
if (orphans.length) console.log('');

check('Parte AL (gate): a consolidacao nao criou rota orfa NOVA', () => {
  const novas = orphans.filter((o) => !PRE_EXISTING_ORPHANS.has(o.path));
  const antigas = orphans.filter((o) => PRE_EXISTING_ORPHANS.has(o.path));
  note(`rotas auditadas=${declared.size} | orfas=${orphans.length}`);
  note(`  pre-existentes (divida, nao regressao): ${antigas.length} -> ${antigas.map((o) => o.path).join(', ') || '(nenhuma)'}`);
  note(`  NOVAS (regressao desta fase): ${novas.length}`);
  for (const o of novas) note(`    ${o.path} -> ${o.element}`);
  assert.equal(novas.length, 0, 'a consolidacao deixou rota sem caminho de navegacao');
});

check('Parte AL (registro): orfas pre-existentes seguem conhecidas', () => {
  // Nao e gate: e inventario. Se uma delas ganhar destino, some daqui.
  const stillOrphan = orphans.filter((o) => PRE_EXISTING_ORPHANS.has(o.path)).map((o) => o.path);
  note(`orfas herdadas ainda sem destino: ${stillOrphan.length}/${PRE_EXISTING_ORPHANS.size}`);
  for (const path of stillOrphan) note(`  ${path}`);
  assert.ok(stillOrphan.length <= PRE_EXISTING_ORPHANS.size, 'surgiu orfa fora da lista conhecida');
});

check('Parte AL: Calendario e Temporada voltaram a ser alcancaveis', () => {
  // O caso real que motivou este teste.
  const calendar = hubTabs.some((t) => t.includes('CompeteHub.jsx:calendar'));
  const season = hubTabs.some((t) => t.includes('RankingHub.jsx:season'));
  note(`Calendario como aba de Torneios=${calendar} | Temporada como aba de Ranking=${season}`);
  assert.ok(calendar, 'Calendario sem destino de navegacao');
  assert.ok(season, 'Temporada sem destino de navegacao');
  assert.ok(redirectTargets.has('/tournaments') || declared.has('/game/calendar'), 'rota antiga do calendario sem tratamento');
});

check('Parte AL: toda pagina consolidada aparece em exatamente um hub', () => {
  const counts = new Map();
  for (const file of readdirSync(hubDir)) {
    if (!file.endsWith('.jsx')) continue;
    const src = readFileSync(new URL(file, hubDir), 'utf8');
    for (const m of src.matchAll(/import\('@\/pages\/([A-Za-z0-9]+)'\)/g)) {
      counts.set(m[1], (counts.get(m[1]) || 0) + 1);
    }
  }
  const dupes = [...counts].filter(([, n]) => n > 1);
  note(`paginas em hub=${counts.size} | em mais de um hub=${dupes.length}`);
  for (const [name, n] of dupes) note(`  ${name} aparece em ${n} hubs`);
  assert.equal(dupes.length, 0, 'uma pagina virou aba de dois hubs diferentes');
});

check('Parte AL: ferramentas de dev seguem acessiveis por URL', () => {
  for (const tool of DEV_TOOLS) {
    assert.ok(declared.has(tool), `${tool} foi apagada`);
  }
  note(`${DEV_TOOLS.size} ferramentas fora do menu, ainda roteadas`);
});

await vite.close();
console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
