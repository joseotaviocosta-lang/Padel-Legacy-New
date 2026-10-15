// Playthrough 5.27-F, Blocos A/C/F — HARNESS PURO DO MOTOR DE PARTIDA.
// Sem carreira: só createMatch/playPoint reais. Cada célula = N partidas com
// times definidos por (OVR, energia, tática inicial) por lado; jogadores com
// atributos uniformes = OVR; ids (e portanto personalidades, que são semeadas
// pelo id) novos a cada partida, para os dois lados; seed distinta por partida.
// Paralelo em processos (cada um sobe o Vite uma vez).
//
//   node scripts/engine-parity-v527f.mjs --matrix=identical|energy|swap|all [--n=10000] [--workers=6] [--tag=before]
//   (interno) node scripts/engine-parity-v527f.mjs --worker <json>
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const opt = (n, d) => argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;

// ── Worker ─────────────────────────────────────────────────────────────────
if (argv[0] === '--worker') {
  const job = JSON.parse(argv[1]);
  const { createServer } = await import('vite');
  const { installBrowserShim, installDeterminism } = await import('./lib/v526CareerSim.mjs');
  installBrowserShim();
  installDeterminism(`engine-parity-${job.slice}`);
  if (job.riskScale != null) globalThis.__PL527F_TACTIC_RISK_SCALE = job.riskScale;
  if (job.conditionScale != null) globalThis.__PL527F_CONDITION_SCALE = job.conditionScale;
  if (job.idBonus != null) globalThis.__PL527G_TACTIC_ID_BONUS = job.idBonus;
  if (job.weightScale != null) globalThis.__PL527G_TACTIC_WEIGHT_SCALE = job.weightScale;
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: 'custom', logLevel: 'error' });
  const engine = await server.ssrLoadModule('/src/lib/matchEngine.js');
  const KEYS = ['serve', 'forehand', 'backhand', 'volley', 'bandeja', 'smash', 'defense', 'agility', 'strategy', 'emotional_control'];
  let uid = 0;
  // Mesmo pipeline do jogo (TournamentModal.jsx): o jogador recebe
  // _energyPenalty (padel.getEnergyPenalty) só quando `gamePipeline` está ligado.
  const energyPenalty = (e) => (e >= 70 ? 0 : e >= 50 ? -2 : e >= 30 ? -5 : -10);
  // 5.27-G: perfis de atributos com a MESMA média (OVR-base) — só a forma muda.
  const ARCH = {
    balanced: {},
    power: { smash: 14, volley: 8, serve: 6, forehand: 4, defense: -10, agility: -6, strategy: -8, emotional_control: -8 },
    defense: { defense: 14, agility: 8, emotional_control: 6, backhand: 4, smash: -12, volley: -8, serve: -6, forehand: -6 },
    technical: { bandeja: 12, strategy: 10, backhand: 6, volley: 4, smash: -10, serve: -8, agility: -6, defense: -8 },
  };
  const athlete = (side, ovr, energy, withPenalty, arch = 'balanced') => {
    uid += 1;
    const a = { id: `${side}${job.slice}-${uid}`, name: `${side}${job.slice}-${uid}`, energy, ...Object.fromEntries(KEYS.map((k) => [k, Math.max(1, Math.min(99, ovr + (ARCH[arch]?.[k] || 0)))])) };
    if (withPenalty) a._energyPenalty = energyPenalty(energy);
    return a;
  };
  const out = [];
  for (const cell of job.cells) {
    let winsA = 0;
    for (let i = 0; i < cell.n; i += 1) {
      const A = [athlete('a', cell.ovrA, cell.energyA, cell.gamePipeline, cell.archetype), athlete('a', cell.ovrA, cell.energyA, false, cell.archetype)];
      const B = [athlete('b', cell.ovrB, cell.energyB, false, cell.archetype), athlete('b', cell.ovrB, cell.energyB, false, cell.archetype)];
      let s = engine.createMatch(A, B, { initialTacticId: cell.tacticA || 'equilibrado', initialOpponentTacticId: cell.tacticB || 'equilibrado', opponentAdaptive: cell.adaptive === true, seed: `${cell.key}-${job.slice}-${i}` });
      let g = 0;
      while (!s.finished && g < 5000) { s = engine.playPoint(s); g += 1; }
      if (s.winner === 'A') winsA += 1;
    }
    out.push({ key: cell.key, winsA, n: cell.n });
  }
  await server.close();
  process.stdout.write(`RESULT ${JSON.stringify(out)}\n`);
  process.exit(0);
}

// ── Coordenador ────────────────────────────────────────────────────────────
const N = Number(opt('n', 10000));
const WORKERS = Number(opt('workers', 6));
const MATRIX = opt('matrix', 'all');
const TAG = opt('tag', 'run');
const OVRS = (opt('ovrs', '20,35,50,65,75,85')).split(',').map(Number);
const TACTIC_A = opt('tacticA', 'equilibrado');
const TACTIC_B = opt('tacticB', 'equilibrado');
const ADAPTIVE = opt('adaptive', '0') === '1';
const GAME_PIPELINE = opt('gamePipeline', '1') === '1';
const cells = [];
const add = (c) => cells.push({ ...c, key: `${c.kind}|ovr${c.ovrA}v${c.ovrB}|e${c.energyA}v${c.energyB}|t${c.tacticA || TACTIC_A}v${TACTIC_B}|a${ADAPTIVE}`, n: N, tacticA: c.tacticA || TACTIC_A, tacticB: TACTIC_B, adaptive: ADAPTIVE, gamePipeline: GAME_PIPELINE });
if (['identical', 'all'].includes(MATRIX)) for (const o of OVRS) for (const e of [100, 80, 60, 40]) add({ kind: 'identical', ovrA: o, ovrB: o, energyA: e, energyB: e });
if (['energy', 'all'].includes(MATRIX)) for (const o of OVRS) for (const e of [90, 80, 70, 60, 50, 40]) add({ kind: 'energy-curve', ovrA: o, ovrB: o, energyA: e, energyB: 100 });
if (['swap', 'all'].includes(MATRIX)) {
  for (const o of OVRS) for (const [ea, eb] of [[100, 80], [100, 60], [100, 40], [80, 60], [80, 100], [60, 100], [40, 100], [60, 80]]) add({ kind: 'swap-energy', ovrA: o, ovrB: o, energyA: ea, energyB: eb });
  for (const [oa, ob] of [[45, 50], [50, 45], [70, 75], [75, 70], [30, 40], [40, 30]]) add({ kind: 'swap-ovr', ovrA: oa, ovrB: ob, energyA: 100, energyB: 100 });
}
// 5.27-G: matriz tática completa (lados estáticos, energia 100, times idênticos).
const TACTICS = ['equilibrado', 'defensivo', 'tatico', 'agressivo', 'potencia'];
if (MATRIX === 'archetypes') {
  for (const o of OVRS) for (const arch of ['balanced', 'power', 'defense', 'technical']) for (const ta of TACTICS) cells.push({ kind: 'archetypes', archetype: arch, ovrA: o, ovrB: o, energyA: 100, energyB: 100, tacticA: ta, tacticB: 'equilibrado', adaptive: false, gamePipeline: false, key: `arch|ovr${o}|${arch}|${ta}`, n: N });
}
if (MATRIX === 'tactics') {
  for (const o of OVRS) for (const ta of TACTICS) for (const tb of TACTICS) cells.push({ kind: 'tactics', ovrA: o, ovrB: o, energyA: 100, energyB: 100, tacticA: ta, tacticB: tb, adaptive: false, gamePipeline: false, key: `tactics|ovr${o}|${ta}v${tb}`, n: N });
}
// Fatia cada célula entre os workers (mesmo número de partidas por fatia).
const per = Math.ceil(N / WORKERS);
const RISK_SCALE = opt('riskScale', null) == null ? null : Number(opt('riskScale'));
const CONDITION_SCALE = opt('conditionScale', null) == null ? null : Number(opt('conditionScale'));
const num = (n) => (opt(n, null) == null ? null : Number(opt(n)));
const jobs = Array.from({ length: WORKERS }, (_, w) => ({ slice: w, riskScale: RISK_SCALE, conditionScale: CONDITION_SCALE, idBonus: num('idBonus'), weightScale: num('weightScale'), cells: cells.map((c) => ({ ...c, n: Math.max(0, Math.min(per, N - w * per)) })).filter((c) => c.n > 0) }));
const t0 = Date.now();
console.log(`engine-parity: ${cells.length} células × ${N} partidas · ${WORKERS} processos · pipeline do jogo ${GAME_PIPELINE ? 'sim' : 'não'} · tática A ${TACTIC_A} · tática B ${TACTIC_B} · B adaptativo ${ADAPTIVE}`);
const parts = await Promise.all(jobs.map((job) => new Promise((res, rej) => {
  const ch = spawn(process.execPath, [process.argv[1], '--worker', JSON.stringify(job)], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; let err = '';
  ch.stdout.on('data', (b) => { out += b; }); ch.stderr.on('data', (b) => { err = (err + b).slice(-2000); });
  ch.on('close', (c) => { const line = out.split('\n').find((l) => l.startsWith('RESULT ')); if (c !== 0 || !line) rej(new Error(`worker ${job.slice} saiu ${c}: ${err}`)); else res(JSON.parse(line.slice(7))); });
})));
const agg = new Map();
for (const part of parts) for (const r of part) { const a = agg.get(r.key) || { winsA: 0, n: 0 }; a.winsA += r.winsA; a.n += r.n; agg.set(r.key, a); }
const rows = cells.map((c) => {
  c.tacticB = c.tacticB || TACTIC_B;
  const a = agg.get(c.key); const p = a.winsA / a.n; const ci = 1.96 * Math.sqrt((p * (1 - p)) / a.n);
  return { kind: c.kind, archetype: c.archetype || 'uniform', ovrA: c.ovrA, ovrB: c.ovrB, energyA: c.energyA, energyB: c.energyB, tacticA: c.tacticA, tacticB: c.tacticB, n: a.n, winPctA: Math.round(p * 1000) / 10, ci95: Math.round(ci * 1000) / 10 };
});
const dir = resolve(opt('outdir', 'reports/rebalance-527f'));
mkdirSync(dir, { recursive: true });
const csv = [Object.keys(rows[0]).join(','), ...rows.map((r) => Object.values(r).join(','))].join('\n');
writeFileSync(resolve(dir, `engine-${MATRIX}-${TAG}.csv`), `${csv}\n`);
console.log(`${Math.round((Date.now() - t0) / 1000)}s`);
for (const r of rows) console.log(`${r.kind.padEnd(13)} A ovr${r.ovrA} e${r.energyA} vs B ovr${r.ovrB} e${r.energyB}  A ${String(r.winPctA).padStart(5)}% ±${r.ci95}`);
