// Playthrough 5.27-E, Bloco A/B — DIAGNÓSTICO do viés do motor contra o
// jogador (sem carreira, só o motor real). Mesmo OVR-base nos dois lados;
// varia um fator por vez: perfil de atributos (desigual do jogador × uniforme
// dos bots), energia e modificadores de contexto. Só leitura: nada é alterado.
//   node scripts/diag-engine-bias-v527e.mjs [--n=400] [--out=reports/rebalance-527e/engine-bias.json]
import { writeFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createServer } from 'vite';
import { installBrowserShim, installDeterminism } from './lib/v526CareerSim.mjs';

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const N = Number(arg('n', 400));
const OUT = arg('out', 'reports/rebalance-527e/engine-bias.json');
installBrowserShim();
installDeterminism('engine-bias-527e');
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom', logLevel: 'error' });
const load = (p) => server.ssrLoadModule(p);
const engine = await load('/src/lib/matchEngine.js');
const { baseOverallRating } = await load('/src/lib/attributes.js');

// Perfis reais de atributos do jogador: semana ~1 ano das carreiras oficiais da 5.27-D.
const KEYS = ['serve', 'forehand', 'backhand', 'volley', 'bandeja', 'smash', 'defense', 'agility', 'strategy', 'emotional_control'];
const realAttrs = readdirSync('reports/rebalance-527d/runs').slice(0, 45).map((f) => {
  const r = JSON.parse(readFileSync(`reports/rebalance-527d/runs/${f}`, 'utf8')).result;
  return (r.weekly.find((w) => w.day >= 365) || r.weekly.at(-1)).attrs;
});

const uniform = (ovr) => Object.fromEntries(KEYS.map((k) => [k, ovr]));
// Personalidade é semeada pelo id (PersonalityModel.createBehaviorProfile): ids
// únicos por partida, senão os mesmos 4 temperamentos se enfrentam sempre.
let uid = 0;
const bot = (id, ovr) => { uid += 1; return { id: `${id}-${uid}`, name: `${id}-${uid}`, overall_rating: ovr, overall: ovr }; };
function player(id, attrs, extra = {}) { uid += 1; return { id: `${id}-${uid}`, name: `${id}-${uid}`, ...attrs, ...extra }; }

function play(teamA, teamB, seed) {
  let s = engine.createMatch(teamA, teamB, { initialTacticId: 'equilibrado', seed });
  let g = 0;
  while (!s.finished && g < 4000) { s = engine.playPoint(s); g += 1; }
  return s.winner === 'A';
}
function variant(name, build) {
  let wins = 0; const ovrs = [];
  for (let i = 0; i < N; i += 1) {
    const { A, B, ovrA } = build(i);
    ovrs.push(ovrA);
    if (play(A, B, `${name}-${i}`)) wins += 1;
  }
  return { name, n: N, winPct: Math.round((1000 * wins) / N) / 10, meanBaseOvrA: Math.round((ovrs.reduce((a, b) => a + b, 0) / N) * 10) / 10 };
}

const results = [];
// --symmetry: controle com N grande em 3 níveis de OVR (o lado A — o do
// jogador — tem desvantagem estrutural com times idênticos?).
if (process.argv.includes('--symmetry')) {
  for (const ovr of [35, 50, 75]) results.push(variant(`symmetry: bots uniformes ${ovr}×${ovr}`, () => ({ A: [bot('a1', ovr), bot('a2', ovr)], B: [bot('b1', ovr), bot('b2', ovr)], ovrA: ovr })));
  await server.close();
  writeFileSync(OUT.replace(/\.json$/, '-symmetry.json'), `${JSON.stringify({ at: new Date().toISOString(), n: N, results }, null, 2)}\n`);
  for (const r of results) console.log(`${String(r.winPct).padStart(5)}%  ${r.name}`);
  process.exit(0);
}
// Controle: os dois times de bots uniformes no mesmo OVR → deve dar ~50%.
results.push(variant('control: bots uniformes 50×50', () => ({ A: [bot('a1', 50), bot('a2', 50)], B: [bot('b1', 50), bot('b2', 50)], ovrA: 50 })));
// Jogador com atributos uniformes no OVR dele (como um bot), energia 100.
results.push(variant('player uniforme (OVR do perfil real), energia 100', (i) => {
  const a = realAttrs[i % realAttrs.length]; const ovr = Math.round(baseOverallRating(a));
  return { A: [player('p', uniform(ovr), { energy: 100 }), bot('pt', ovr)], B: [bot('b1', ovr), bot('b2', ovr)], ovrA: ovr };
}));
// Jogador com o perfil REAL desigual (mesmo OVR-base), energia 100.
results.push(variant('player perfil real desigual, energia 100', (i) => {
  const a = realAttrs[i % realAttrs.length]; const ovr = Math.round(baseOverallRating(a));
  return { A: [player('p', a, { energy: 100 }), bot('pt', ovr)], B: [bot('b1', ovr), bot('b2', ovr)], ovrA: ovr };
}));
// Só energia: uniforme, energia 55 (mediana medida nas partidas) — sem a penalidade de OVR.
results.push(variant('player uniforme, energia 55 (só rally)', (i) => {
  const ovr = Math.round(baseOverallRating(realAttrs[i % realAttrs.length]));
  return { A: [player('p', uniform(ovr), { energy: 55 }), bot('pt', ovr)], B: [bot('b1', ovr), bot('b2', ovr)], ovrA: ovr };
}));
// Energia como o harness/jogo aplica: energy 55 + _energyPenalty −2.
results.push(variant('player uniforme, energia 55 + _energyPenalty −2 (como no jogo)', (i) => {
  const ovr = Math.round(baseOverallRating(realAttrs[i % realAttrs.length]));
  return { A: [player('p', uniform(ovr), { energy: 55, _energyPenalty: -2 }), bot('pt', ovr)], B: [bot('b1', ovr), bot('b2', ovr)], ovrA: ovr };
}));
// Combinação real: perfil desigual + energia 55 + −2.
results.push(variant('player perfil real + energia 55 + −2 (realidade)', (i) => {
  const a = realAttrs[i % realAttrs.length]; const ovr = Math.round(baseOverallRating(a));
  return { A: [player('p', a, { energy: 55, _energyPenalty: -2 }), bot('pt', ovr)], B: [bot('b1', ovr), bot('b2', ovr)], ovrA: ovr };
}));

await server.close();
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify({ at: new Date().toISOString(), n: N, results }, null, 2)}\n`);
for (const r of results) console.log(`${String(r.winPct).padStart(5)}%  ${r.name}  (OVR-base A ~${r.meanBaseOvrA})`);
