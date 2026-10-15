// Playthrough 5.26-C, Bloco A — reprodução/medição do rollover 31/12 → 01/01
// e da primeira semana de circuito de 2027. Carreira real, pontos do jogador
// congelados (sem resultado novo), snapshots diários do ranking mundial.
//   RC_TAG=before|after node scripts/instrument-rank-rollover-v526c.mjs
// Saída: reports/progression-clean-526c/ranking-rollover-<tag>.json
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { installDeterminism, MemoryStorage, bootRuntime, createRealCareer } from './lib/v526CareerSim.mjs';
import * as act from './lib/v526Actions.mjs';

const TAG = process.env.RC_TAG || 'run';
installDeterminism('rank-rollover-526c');
const rt = await bootRuntime(new MemoryStorage());
const A = await act.loadActionModules(rt);
const { profile: p0 } = await createRealCareer(rt, { saveName: 'rank-rollover' });
await act.completeOnboarding(rt, A, p0, { side: 'direita', style: 'equilibrado', name: 'Instrumento' });
const PLAYER_POINTS = 117;
const freeze = () => rt.localGame.entities.PlayerProfile.update(p0.id, { rank_points: PLAYER_POINTS, world_ranking_points: PLAYER_POINTS, ranking_points: PLAYER_POINTS, matches_played: 30, tournaments_played: 10 });
await freeze();
const points = (a) => Number(a.world_ranking_points ?? a.ranking_points ?? a.rank_points) || 0;

let prev = null;
async function snapshot() {
  const p = await rt.localGame.entities.PlayerProfile.get(p0.id);
  const athletes = ((await rt.localGame.entities.AthleteProfile.list('-world_ranking_points', 5000)) || []).filter((a) => !a.retired && a.career_status !== 'aposentado');
  const ranked = athletes.filter((a) => points(a) > 0).sort((a, b) => points(b) - points(a));
  const positions = new Map(ranked.map((a, i) => [a.id, i + 1]));
  const results = (await rt.localGame.entities.AthleteRankingResult.list(null, 200000)) || [];
  const ids = new Set(results.map((r) => r.id));
  const seedRows = results.filter((r) => r.is_legacy_seed || r.finish === 'legacy_seed');
  const wr = await rt.padel.getWorldRank(p);
  const snap = {
    date: p.career_date, playerPoints: Number(p.rank_points) || 0, playerRank: wr.rank, racePoints: Number(p.race_points) || 0,
    rankedPlayers: ranked.length, worldPoints: ranked.reduce((t, a) => t + points(a), 0), pointsAtRank300: ranked[299] ? points(ranked[299]) : null,
    athletesAtOrAbovePlayer: ranked.filter((a) => points(a) >= PLAYER_POINTS).length,
    rankingResults: results.length, legacySeedRows: seedRows.length,
    expiredRowsSincePrev: prev ? [...prev.ids].filter((id) => !ids.has(id)).length : 0,
    athletesLostPosition: prev ? [...positions].filter(([id, pos]) => prev.positions.has(id) && pos > prev.positions.get(id)).length : 0,
    athletesDroppedFromRanking: prev ? [...prev.positions.keys()].filter((id) => !positions.has(id)).length : 0,
    aiRacePointsTotal: athletes.reduce((t, a) => t + (Number(a.race_points) || 0), 0),
  };
  prev = { ids, positions };
  return snap;
}

const snapshots = [];
let profile = await rt.localGame.entities.PlayerProfile.get(p0.id);
while (profile.career_date < '2027-01-10') {
  const r = await rt.calendar.advanceCareerDays(profile, 1);
  if (r.blockedBy?.id) await A.calendarSystem.resolveDecision(r.blockedBy.id, 'skip').catch(() => null);
  await freeze();
  profile = await rt.localGame.entities.PlayerProfile.get(p0.id);
  // Amostra do ano inteiro (dia 1 de cada mês) + todos os dias em torno da virada.
  if (profile.career_date >= '2026-12-28' || profile.career_date.endsWith('-01')) snapshots.push(await snapshot());
  else if (prev === null) await snapshot();
}
const dir = resolve('reports/progression-clean-526c');
mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, `ranking-rollover-${TAG}.json`), JSON.stringify({ tag: TAG, note: 'Pontos do jogador congelados em 117 (sem resultado novo).', snapshots }, null, 2));
for (const s of snapshots) console.log(`${TAG} ${s.date} jogador #${s.playerRank} · race ${s.racePoints} · ranqueados ${s.rankedPlayers} · pontos do mundo ${s.worldPoints} · ≥117 ${s.athletesAtOrAbovePlayer} · seeds ${s.legacySeedRows} · expiradas ${s.expiredRowsSincePrev} · perderam posição ${s.athletesLostPosition} · race IA ${s.aiRacePointsTotal}`);
await rt.close();
process.exit(0);
