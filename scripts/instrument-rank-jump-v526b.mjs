// Playthrough 5.26-B, Bloco I — INSTRUMENTAÇÃO (sem correção) do salto de
// ~290 posições do jogador em 01/01/2027 com os mesmos pontos (5.26).
// Avança uma carreira real até a virada do ano com os pontos do jogador
// congelados e registra, dia a dia em torno da virada, a população do
// ranking mundial. Saída: reports/progression-integrity-526b/rank-jump-2027.json
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { installDeterminism, MemoryStorage, bootRuntime, createRealCareer } from './lib/v526CareerSim.mjs';
import * as act from './lib/v526Actions.mjs';

installDeterminism('rank-jump-526b');
const rt = await bootRuntime(new MemoryStorage());
const A = await act.loadActionModules(rt);
const { profile: p0 } = await createRealCareer(rt, { saveName: 'rank-jump' });
await act.completeOnboarding(rt, A, p0, { side: 'direita', style: 'equilibrado', name: 'Instrumento' });
const PLAYER_POINTS = 117;
const freeze = () => rt.localGame.entities.PlayerProfile.update(p0.id, { rank_points: PLAYER_POINTS, world_ranking_points: PLAYER_POINTS, ranking_points: PLAYER_POINTS, matches_played: 30, tournaments_played: 10 });
await freeze();

async function worldSnapshot(label) {
  const p = await rt.localGame.entities.PlayerProfile.get(p0.id);
  const athletes = (await rt.localGame.entities.AthleteProfile.list('-world_ranking_points', 5000)) || [];
  const points = (a) => Number(a.world_ranking_points ?? a.ranking_points ?? a.rank_points) || 0;
  const active = athletes.filter((a) => !a.retired && a.career_status !== 'aposentado');
  const ranked = active.filter((a) => points(a) > 0).sort((a, b) => points(b) - points(a));
  const at = (n) => (ranked[n - 1] ? points(ranked[n - 1]) : null);
  const wr = await rt.padel.getWorldRank(p);
  const results = (await rt.localGame.entities.AthleteRankingResult.list(null, 200000)) || [];
  const seedRows = results.filter((r) => String(r.id || '').includes('legacy') || r.finish === 'legacy-seed' || r.legacy_seed);
  return {
    label, date: p.career_date, playerPoints: Number(p.rank_points) || 0, playerRank: wr.rank, playerRankingPositionField: p.ranking_position ?? null,
    athletesTotal: athletes.length, active: active.length, retired: athletes.length - active.length, rankedWithPoints: ranked.length,
    aboveOrEqualPlayer: ranked.filter((a) => points(a) >= PLAYER_POINTS).length,
    pointsAtRank: { 100: at(100), 300: at(300), 500: at(500), 700: at(700) },
    totalPoints: ranked.reduce((t, a) => t + points(a), 0),
    rankingResults: results.length, legacySeedRows: seedRows.length,
    resultsByYear: results.reduce((acc, r) => { const y = String(r.date || '').slice(0, 4) || '?'; acc[y] = (acc[y] || 0) + 1; return acc; }, {}),
  };
}

const snapshots = [];
let profile = await rt.localGame.entities.PlayerProfile.get(p0.id);
while (profile.career_date < '2027-01-08') {
  const r = await rt.calendar.advanceCareerDays(profile, 1);
  if (r.blockedBy?.id) await A.calendarSystem.resolveDecision(r.blockedBy.id, 'skip').catch(() => null);
  await freeze();
  profile = await rt.localGame.entities.PlayerProfile.get(p0.id);
  if (profile.career_date >= '2026-12-24') snapshots.push(await worldSnapshot('diario'));
}
const dir = resolve(process.env.RJ_DIR || 'reports/progression-integrity-526b');
mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, process.env.RJ_OUT || 'rank-jump-2027.json'), JSON.stringify({ note: 'Instrumentação apenas (Bloco I). Pontos do jogador congelados em 117.', snapshots }, null, 2));
for (const s of snapshots) console.log(`${s.date} jogador #${s.playerRank} (campo ${s.playerRankingPositionField}) · ativos ${s.active} · com pontos ${s.rankedWithPoints} · ≥117 pts: ${s.aboveOrEqualPlayer} · pts@300 ${s.pointsAtRank[300]} · total ${s.totalPoints} · resultados ${s.rankingResults} (legado ${s.legacySeedRows}) · por ano ${JSON.stringify(s.resultsByYear)}`);
await rt.close();
process.exit(0);
