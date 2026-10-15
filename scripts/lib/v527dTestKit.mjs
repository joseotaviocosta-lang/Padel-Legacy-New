// Playthrough 5.27-D — fixtures dos testes *-v527d: raízes temporárias do
// pipeline e resultados SINTÉTICOS com envelope/hash válidos (para testar
// manifest, import, gates e o analisador sem gastar horas de simulação).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as J from './v527dJobs.mjs';

export function tempRoot(tag) { return mkdtempSync(join(tmpdir(), `pl527d-${tag}-`)); }
export const cleanup = (dir) => rmSync(dir, { recursive: true, force: true });

export function orch(root, args, env = {}) {
  const e = { ...process.env, PL527D_ROOT: root, ...env };
  delete e.PL526_SHIM;
  return spawnSync(process.execPath, ['scripts/run-balance-validation-v527d.mjs', ...args], { env: e, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}
export function analyze(root) {
  return spawnSync(process.execPath, ['scripts/analyze-rebalance-527d.mjs', `--root=${root}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}
export function initRoot(root, env = {}) {
  const r = orch(root, ['--init'], env);
  if (r.status !== 0) throw new Error(`--init falhou: ${r.stderr.slice(-400)}`);
  return J.loadManifest(root);
}

const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/**
 * Carreira sintética. `opts.winRate` por classe de tier, `opts.titlesPerYear`,
 * `opts.rankAt(day)`, `opts.monthly(i)` → { prize, sponsor, investment, recurringExpense, oneOff, closing }.
 */
export function syntheticResult({ profile, seed, days, startDate = '2026-01-01', winRate = { Bronze: 0.6, Gold: 0.45, Masters: 0.3 }, matchesPerYear = 30, titlesPerYear = 1, rankAt = (d) => Math.max(1, 1000 - Math.round(d / 2)), monthly = () => ({ prize: 500, sponsor: 300, investment: 0, recurringExpense: 400, oneOff: 100, closing: 2000 }), coinsAt = () => 1000, staff = [], purchases = [], dismissals = [] } = {}) {
  const weekly = [];
  for (let d = 0; d <= days; d += 7) weekly.push({ day: d, date: addDays(startDate, d), rank: rankAt(d), ovr: 30 + Math.round(d / 40), coins: coinsAt(d), staff: 0, gearEquipped: 0, age: 16 + Math.floor(d / 365), saveMB: 10 + d / 100, shopUnlockedRarity: 'raro' });
  const matches = []; const tournaments = [];
  let k = 0;
  for (let y = 0; y < Math.ceil(days / 365); y += 1) {
    for (let i = 0; i < matchesPerYear; i += 1) {
      const tier = Object.keys(winRate)[i % Object.keys(winRate).length];
      const day = y * 365 + Math.floor((i * 360) / matchesPerYear);
      if (day > days) continue;
      const won = ((k * 7919) % 100) / 100 < winRate[tier];
      k += 1;
      matches.push({ date: addDays(startDate, day), tournamentId: `t${y}-${i}`, tier, stage: 'main', round: 'Oitavas de Final', stageRoundIndex: 0, won });
    }
    for (let t = 0; t < titlesPerYear; t += 1) { const day = y * 365 + 100 + t; if (day <= days) tournaments.push({ day, date: addDays(startDate, day), tournamentId: `title${y}-${t}`, tier: 'Bronze', status: 'champion', roundsWon: 4, totalRounds: 4, prize: 1000 }); }
  }
  const ledger = {};
  const months = Math.ceil(days / 30.44);
  const [sy, sm] = startDate.split('-').map(Number);
  for (let i = 0; i < months; i += 1) {
    const month = `${sy + Math.floor((sm - 1 + i) / 12)}-${String(((sm - 1 + i) % 12) + 1).padStart(2, '0')}`;
    const m = monthly(i);
    ledger[month] = { opening: 0, closing: m.closing, income: { prize: m.prize, match_reward: 0, sponsor_monthly: m.sponsor, sponsor_signing: 0, missions: 0, achievements: 0, investment_income: m.investment, passive_income: 0, other_income: 0 }, expense: { coach: m.recurringExpense, staff: 0, club_fee: 0, partner_salary: 0, reward_overwrite: 0, maintenance: 0, training: m.oneOff, equipment: 0, entry_fee: 0, coach_signing: 0, staff_signing: 0, other_expense: 0 }, transfers: 0 };
  }
  return { profileId: `p-${profile}-${seed}`, profile, seed, careerId: `uuid-${Math.random()}`, startDate, birthDate: '2010-01-01', weekly, matches, tournaments, sponsors: [], coaches: [], staff, purchases, registrations: [], investments: [], partners: [], forfeits: 0, reloads: 0, errors: [], dismissals, dismissalBlocked: [], registrationFailures: {}, ledger, finalCoins: weekly.at(-1).coins, days, ms: 1 };
}

/** Envelope com hashes válidos para o código/balanceamento da raiz. */
export function envelopeFor(root, jobId, result, overrides = {}) {
  const m = J.loadManifest(root);
  const job = m.jobs.find((j) => j.id === jobId);
  const env = {
    schemaVersion: J.SCHEMA_VERSION, jobId, stage: job.stage, preset: job.preset, profile: job.profile, seed: job.seed, targetYears: job.targetYears, targetDays: job.targetDays,
    codeHash: m.codeHash, balanceHash: m.balanceHash, harnessVersion: J.HARNESS_VERSION, checkpointEvery: J.CHECKPOINT_EVERY, fastClone: true, host: 'test-host',
    runtimeSeconds: 60, attempts: 0, segments: 1, seededFrom: null, createdAt: '2026-10-11T00:00:00.000Z', outcomeHash: J.outcomeHash(result), result, ...overrides,
  };
  env.resultHash = J.envelopeHash(env);
  return env;
}
/** Grava um resultado sintético como DONE (arquivo + manifest), como o orquestrador faria. */
export function markDone(root, jobId, resultOpts = {}) {
  const m = J.loadManifest(root);
  const job = m.jobs.find((j) => j.id === jobId);
  const result = syntheticResult({ profile: job.profile, seed: job.seed, days: job.targetDays, ...resultOpts });
  const env = envelopeFor(root, jobId, result);
  J.atomicWrite(join(J.paths(root).runs, `${jobId}.json`), JSON.stringify(env));
  J.updateManifest((mm) => { const j = mm.jobs.find((x) => x.id === jobId); Object.assign(j, { status: 'DONE', resultHash: env.resultHash, outcomeHash: env.outcomeHash, finishedAt: env.createdAt, runtimeSeconds: 60 }); }, root);
  return env;
}
export function writeSyntheticCheckpoint(file, payload) {
  J.mkdirSync(join(file, '..'), { recursive: true });
  const body = JSON.stringify(payload);
  writeFileSync(file, `${body}\n#sha256:${J.sha256(body)}`);
}
