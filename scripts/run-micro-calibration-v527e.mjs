// Playthrough 5.27-E, Bloco J — MICRO-CALIBRAÇÃO antes do Stage 1 completo.
// Roda candidatos (conjuntos de variáveis de ambiente: preset, política) ×
// seeds × perfil por N dias, com o simulador real (contínuo == segmentado,
// provado na 5.27-D), até 2 em paralelo, e mede as métricas do item 42.
// Micro-run NÃO é validação final: só elimina candidatos ruins (item 44).
//   node scripts/run-micro-calibration-v527e.mjs --candidates=baseline,taper --seeds=1-3 --profile=normal --days=365
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const ROOT = resolve(arg('root', 'reports/rebalance-527e/micro'));
const [S0, S1] = arg('seeds', '1-3').split('-').map(Number);
const PROFILE = arg('profile', 'normal');
const DAYS = Number(arg('days', 365));
const PARALLEL = Math.min(2, Number(arg('parallel', 2)));
// Candidatos: só variáveis de ambiente lidas pelo simulador/jogo.
export const CANDIDATES = {
  baseline: { PL527_PRESET: 'balanced', PL527E_POLICY: 'v1' },
  taper: { PL527_PRESET: 'balanced', PL527E_POLICY: 'v2' },
  'balanced-e': { PL527_PRESET: 'balanced-e', PL527E_POLICY: 'v2' },
  'balanced-e-v3': { PL527_PRESET: 'balanced-e', PL527E_POLICY: 'v3' },
  'conservative-e-v3': { PL527_PRESET: 'conservative-e', PL527E_POLICY: 'v3' },
  'hardcore-e-v3': { PL527_PRESET: 'hardcore-e', PL527E_POLICY: 'v3' },
  'final-e': { PL527_PRESET: 'balanced-e', PL527E_POLICY: 'v2' },
  'bestfit800': { PL527_PRESET: 'balanced-e', PL527E_POLICY: 'v2', PL527E_COMPETITION: '{"silverPeakLow":800}' },
  'silver900': { PL527_PRESET: 'balanced-e', PL527E_POLICY: 'v2', PL527E_COMPETITION: '{"silverPeakLow":900}' },
  'silver1000': { PL527_PRESET: 'balanced-e', PL527E_POLICY: 'v2', PL527E_COMPETITION: '{"silverPeakLow":1000}' },
  'conservative-e': { PL527_PRESET: 'conservative-e', PL527E_POLICY: 'v2' },
  'hardcore-e': { PL527_PRESET: 'hardcore-e', PL527E_POLICY: 'v2' },
};
const names = arg('candidates', 'baseline,taper').split(',');
const CLASS = { Bronze: 'easy', Silver: 'easy', Gold: 'medium', Platinum: 'medium', Masters: 'hard', Elite: 'hard', Crown: 'hard' };
const TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Masters', 'Elite'];

const jobs = [];
for (const c of names) for (let s = S0; s <= S1; s += 1) jobs.push({ c, seed: s, out: join(ROOT, c, `${PROFILE}-${DAYS}d`) });
const file = (j) => join(j.out, `${PROFILE}-${String(j.seed).padStart(3, '0')}.json`);
const pending = jobs.filter((j) => !existsSync(file(j)));
console.log(`micro: ${jobs.length} carreiras (${pending.length} pendentes) · ${names.join(', ')} · seeds ${S0}-${S1} · ${PROFILE} · ${DAYS} dias`);
async function worker() {
  while (pending.length) {
    const j = pending.shift();
    mkdirSync(j.out, { recursive: true });
    const env = { ...process.env, ...CANDIDATES[j.c], PL527D_FASTCLONE: '1', PL527D_ISOLATE_VITE_RNG: '1' };
    delete env.PL526_SHIM;
    const t0 = Date.now();
    const code = await new Promise((r) => {
      const ch = spawn(process.execPath, ['--max-old-space-size=4096', 'scripts/sim-progression-economy-v526.mjs', `--profile=${PROFILE}`, `--seeds=${j.seed}-${j.seed}`, `--days=${DAYS}`, `--out=${j.out}`], { env, stdio: ['ignore', 'ignore', 'pipe'] });
      let err = ''; ch.stderr.on('data', (b) => { err = (err + b).slice(-800); });
      ch.on('close', (c) => { if (c !== 0) console.log(`  ${j.c} seed ${j.seed} FALHOU (${c}): ${err.slice(-300)}`); r(c); });
    });
    console.log(`  ${j.c} seed ${j.seed}: ${code === 0 ? 'ok' : 'falha'} em ${Math.round((Date.now() - t0) / 60000)} min`);
  }
}
await Promise.all(Array.from({ length: PARALLEL }, worker));

// ── Métricas ───────────────────────────────────────────────────────────────
const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : null);
const wr = (l) => (l.length ? pct(l.filter((m) => m.won).length, l.length) : null);
const med = (v) => { const s = v.filter((x) => x != null).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const at = (c, d) => { let b = null; for (const w of c.weekly) { if (w.day <= d) b = w; else break; } return b; };
const shareY1 = (c, keys) => { const ms = Object.entries(c.ledger || {}).slice(0, 12); let p = 0; let t = 0; for (const [, L] of ms) { p += keys.reduce((s, k) => s + (L.income?.[k] || 0), 0); t += Object.values(L.income || {}).reduce((s, v) => s + v, 0); } return t ? pct(p, t) : null; };
const summary = {};
for (const c of names) {
  const careers = jobs.filter((j) => j.c === c && existsSync(file(j))).map((j) => JSON.parse(readFileSync(file(j), 'utf8')));
  const M = careers.flatMap((x) => x.matches);
  const main = M.filter((m) => m.stage === 'main');
  const r1 = main.filter((m) => Number(m.stageRoundIndex) === 0);
  summary[c] = {
    careers: careers.length, matches: M.length,
    easyWR: wr(M.filter((m) => CLASS[m.tier] === 'easy')), mediumWR: wr(M.filter((m) => CLASS[m.tier] === 'medium')), hardWR: wr(M.filter((m) => CLASS[m.tier] === 'hard')),
    r1WR: wr(r1),
    tierWR: Object.fromEntries(TIERS.map((t) => [t, { all: wr(M.filter((m) => m.tier === t)), main: wr(main.filter((m) => m.tier === t)), r1: wr(r1.filter((m) => m.tier === t)), n: M.filter((m) => m.tier === t).length }])),
    energyAtMatchMedian: med(M.map((m) => m.energy)), r1EnergyMedian: med(r1.map((m) => m.energy)),
    rank1yMedian: med(careers.map((x) => at(x, 365)?.rank)), rankEndMedian: med(careers.map((x) => x.weekly.at(-1)?.rank)),
    sponsorShareY1Median: med(careers.map((x) => shareY1(x, ['sponsor_monthly', 'sponsor_signing']))), prizeShareY1Median: med(careers.map((x) => shareY1(x, ['prize']))),
    titles: careers.map((x) => x.tournaments.filter((t) => t.status === 'champion').length),
    debtCareers: careers.filter((x) => x.weekly.some((w) => w.coins < 0)).length, taperDaysMedian: med(careers.map((x) => x.taperDays || 0)),
  };
  // Gate da micro-calibração (item 43).
  const s = summary[c];
  const silver = s.tierWR.Silver.main; const gold = s.tierWR.Gold.main;
  s.microGate = { easy: s.easyWR >= 40, medium: s.mediumWR >= 28, r1: s.r1WR >= 35, silverNotMateriallyHarderThanGold: silver == null || gold == null || silver >= gold - 5 };
  s.microGate.pass = Object.values(s.microGate).every(Boolean);
}
// O resumo vai para a pasta-mãe da raiz dos brutos (padrão reports/rebalance-527e).
const SUMMARY_DIR = resolve(ROOT, '..');
mkdirSync(SUMMARY_DIR, { recursive: true });
const outFile = resolve(SUMMARY_DIR, `micro-${PROFILE}-${DAYS}d.json`);
writeFileSync(outFile, `${JSON.stringify({ at: new Date().toISOString(), seeds: [S0, S1], profile: PROFILE, days: DAYS, candidates: Object.fromEntries(names.map((n) => [n, CANDIDATES[n]])), summary }, null, 2)}\n`);
for (const [c, s] of Object.entries(summary)) console.log(`${c.padEnd(15)} n${s.careers} E ${s.easyWR} M ${s.mediumWR} H ${s.hardWR} R1 ${s.r1WR} | Br ${s.tierWR.Bronze.main} Si ${s.tierWR.Silver.main} Go ${s.tierWR.Gold.main} (main) | energia ${s.energyAtMatchMedian} | rank@1y ${s.rank1yMedian} | sp ${s.sponsorShareY1Median}% pr ${s.prizeShareY1Median}% | gate ${s.microGate.pass ? 'PASS' : 'FAIL'}`);
