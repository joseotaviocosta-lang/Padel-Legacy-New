// Playthrough 5.27-F, Blocos G/H/K — AUDITORIA DE RANKING por participação.
// Carreiras reais (Normal, política v2, preset balanced-e, mesma seed) com taxa
// de vitórias FIXADA pelo harness (PL527F_FORCED_WR = 0 / 0.25 / 0.5 / 0.75):
// mesmo calendário/política, só o resultado das partidas muda. Grava o save
// final (--keepSave) e um save do dia 1 (mundo inicial) para decompor a subida
// em "pontos do jogador" × "movimento do mundo".
//   node scripts/run-ranking-audit-v527f.mjs [--days=365] [--seed=1] [--parallel=2] [--analyze-only]
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const DAYS = Number(arg('days', 365));
const SEED = Number(arg('seed', 1));
const PAR = Math.min(2, Number(arg('parallel', 2)));
const ROOT = resolve(arg('root', 'reports/rebalance-527f/ranking'));
const TAG = arg('tag', 'current');
const SCENARIOS = [['wr0', '0'], ['wr25', '0.25'], ['wr50', '0.5'], ['wr75', '0.75']];
const pad = String(SEED).padStart(3, '0');
const env = { ...process.env, PL527_PRESET: 'balanced-e', PL527E_POLICY: 'v2', PL527D_FASTCLONE: '1', PL527D_ISOLATE_VITE_RNG: '1' };
delete env.PL526_SHIM;
const jobs = [{ name: 'start', days: 1, wr: '0' }, ...SCENARIOS.map(([name, wr]) => ({ name, days: DAYS, wr }))].map((j) => ({ ...j, out: join(ROOT, TAG, j.name) }));
const done = (j) => existsSync(join(j.out, `normal-${pad}.json`)) && existsSync(join(j.out, `normal-${pad}.save.json`));
if (!process.argv.includes('--analyze-only')) {
  const queue = jobs.filter((j) => !done(j));
  console.log(`ranking-audit: ${queue.length} carreiras · ${DAYS} dias · seed ${SEED}`);
  await Promise.all(Array.from({ length: PAR }, async () => {
    while (queue.length) {
      const j = queue.shift();
      mkdirSync(j.out, { recursive: true });
      const t0 = Date.now();
      const code = await new Promise((r) => {
        const ch = spawn(process.execPath, ['--max-old-space-size=4096', 'scripts/sim-progression-economy-v526.mjs', '--profile=normal', `--seeds=${SEED}-${SEED}`, `--days=${j.days}`, `--out=${j.out}`, '--keepSave'], { env: { ...env, PL527F_FORCED_WR: j.wr }, stdio: ['ignore', 'ignore', 'pipe'] });
        let err = ''; ch.stderr.on('data', (b) => { err = (err + b).slice(-600); });
        ch.on('close', (c) => { if (c) console.log(`  ${j.name} falhou: ${err}`); r(c); });
      });
      console.log(`  ${j.name}: ${code === 0 ? 'ok' : 'falha'} (${Math.round((Date.now() - t0) / 60000)} min)`);
    }
  }));
}

// ── Análise ────────────────────────────────────────────────────────────────
function worldBoard(saveFile) {
  const save = JSON.parse(readFileSync(saveFile, 'utf8'));
  const career = JSON.parse(Object.entries(save).find(([k]) => k.startsWith('careers/'))[1]);
  const athletes = (career.entities.AthleteProfile || []).filter((a) => !(a.retired || a.career_status === 'aposentado'));
  return athletes.map((a) => Number(a.world_ranking_points) || 0);
}
const rankAgainst = (board, points) => 1 + board.filter((p) => p > points).length;
const start = jobs[0];
const W0 = worldBoard(join(start.out, `normal-${pad}.save.json`));
const results = {};
for (const j of jobs.slice(1)) {
  if (!done(j)) continue;
  const r = JSON.parse(readFileSync(join(j.out, `normal-${pad}.json`), 'utf8'));
  const W1 = worldBoard(join(j.out, `normal-${pad}.save.json`));
  const last = r.weekly.at(-1);
  const P1 = Number(last.rankPoints) || 0;
  const bySource = {};
  for (const t of r.tournaments) {
    const isQual = (r.matches || []).some((m) => m.tournamentId === t.tournamentId && m.stage === 'qualifying') && !(r.matches || []).some((m) => m.tournamentId === t.tournamentId && m.stage === 'main');
    const key = `${t.tier}|${isQual ? 'qualifying-loss' : t.status === 'champion' ? 'title' : `rounds-won-${t.roundsWon}`}`;
    const e = (bySource[key] ||= { tournaments: 0, points: 0 }); e.tournaments += 1; e.points += Number(t.rankPoints) || 0;
  }
  const wins = r.matches.filter((m) => m.won).length;
  results[j.name] = {
    targetWR: Number(j.wr), matches: r.matches.length, wins, actualWR: r.matches.length ? Math.round((1000 * wins) / r.matches.length) / 10 : null,
    tournaments: r.tournaments.length, titles: r.tournaments.filter((t) => t.status === 'champion').length,
    pointsEarnedSum: r.tournaments.reduce((s, t) => s + (Number(t.rankPoints) || 0), 0), pointsHeldEnd: P1,
    startRank: r.weekly[0]?.rank ?? null, endRankActual: last.rank,
    endRankRecomputed: rankAgainst(W1, P1),
    decomposition: {
      rankWithPlayerPointsWorldFrozen: rankAgainst(W0, P1), // só os pontos do jogador
      rankWithZeroPointsWorldMoved: rankAgainst(W1, 0), // só o mundo (jogador com 0)
      rankAtStartZeroPoints: rankAgainst(W0, 0),
      worldAthletesWithPointsStart: W0.filter((p) => p > 0).length, worldAthletesWithPointsEnd: W1.filter((p) => p > 0).length,
      worldPointsMedianStart: W0.sort((a, b) => a - b)[W0.length >> 1], worldPointsMedianEnd: W1.sort((a, b) => a - b)[W1.length >> 1],
    },
    pointsPerTournament: r.tournaments.length ? Math.round((10 * r.tournaments.reduce((s, t) => s + (Number(t.rankPoints) || 0), 0)) / r.tournaments.length) / 10 : null,
    bySource,
  };
}
mkdirSync(join(ROOT, TAG), { recursive: true });
writeFileSync(join(ROOT, TAG, 'summary.json'), `${JSON.stringify({ at: new Date().toISOString(), days: DAYS, seed: SEED, results }, null, 2)}\n`);
for (const [k, v] of Object.entries(results)) console.log(`${k}: WR ${v.actualWR}% · ${v.tournaments} torneios · ${v.titles} títulos · pts ${v.pointsHeldEnd} · rank ${v.startRank}→${v.endRankActual} (recalc ${v.endRankRecomputed}) · só jogador ${v.decomposition.rankWithPlayerPointsWorldFrozen} · só mundo ${v.decomposition.rankWithZeroPointsWorldMoved}`);
