// Playthrough 5.24-E, Parte J — I/O do boot por tipo de save.
// Para cada save (nova, madura, pesada): prepara, faz 1 load (vira a última
// jogada) e mede 3 boots ociosos com o boot REAL (loadCareer): escritas,
// bytes gravados, leituras e tempo do load.
import { createFileStore, bootWithAchievements, createAchievementCareer, bootCareer, syncAchievements } from './lib/v524eAchievementHarness.mjs';
import { visitHome } from './lib/v524dRewardHarness.mjs';

async function prepare(kind) {
  const store = createFileStore();
  const rt = await bootWithAchievements(store);
  const { careerId, profileId } = await createAchievementCareer(rt, { coins: 100, stats: kind === 'nova' ? {} : { tournaments_played: 3, tournaments_won: 1, matches_played: 12, wins: 7 } });
  if (kind !== 'nova') {
    await visitHome(rt, profileId);
    await syncAchievements(rt);
  }
  if (kind === 'pesada') {
    const athletes = await rt.localGame.entities.AthleteProfile.list(null, 100000);
    const extra = Array.from({ length: Math.max(0, 1500 - athletes.length) }, (_, i) => ({ ...athletes[i % athletes.length], id: undefined, name: `Atleta ${i}` }));
    const teams = Array.from({ length: 1000 }, (_, i) => ({ team_key: `bench-${i}`, player1_id: `a${i}`, player2_id: `b${i}`, ranking_points: 1000 - i, matches_played: 10, wins: 5, losses: 5 }));
    await rt.localGame.batch([
      ...extra.map((data) => ({ type: 'create', entityName: 'AthleteProfile', data })),
      ...teams.map((data) => ({ type: 'create', entityName: 'TeamRanking', data })),
    ]);
  }
  await rt.close();
  const first = await bootCareer(store, careerId);
  await first.close();
  return { store, careerId };
}

const out = {};
for (const kind of ['nova', 'madura', 'pesada']) {
  const { store, careerId } = await prepare(kind);
  const size = store.files.get(`careers/${careerId}.json`).length;
  const boots = [];
  for (let i = 0; i < 3; i += 1) {
    const rt = await bootCareer(store, careerId);
    boots.push(rt.bootMetrics);
    await rt.close();
  }
  const sum = (k) => boots.reduce((s, b) => s + b[k], 0);
  out[kind] = { saveBytes: size, writesPerBoot: sum('writes') / 3, bytesPerBoot: Math.round(sum('bytes') / 3), readsPerBoot: sum('reads') / 3, loadMsMedian: boots.map((b) => b.loadMs).sort((a, b) => a - b)[1] };
  console.log(`${kind.padEnd(7)} save=${(size / 1e6).toFixed(2)}MB · escritas/boot=${out[kind].writesPerBoot} · bytes/boot=${out[kind].bytesPerBoot} · leituras/boot=${out[kind].readsPerBoot} · load≈${out[kind].loadMsMedian}ms`);
}
