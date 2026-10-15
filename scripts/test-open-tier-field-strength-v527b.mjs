// Playthrough 5.27-B, Bloco A — força do field dos tiers abertos. O floor do
// mundo foi calibrado para existir uma base de desenvolvimento real, e o
// weak-first garante que Bronze/Silver usem essa base (sem contaminação elite).
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { bootDrawCareer } from './lib/v526dDrawKit.mjs';

const { check, finish } = makeSuite('test-open-tier-field-strength-v527b');
const { rt, profile } = await bootDrawCareer('open-tier-field-527b', { warmDays: 8 });
try {
  const E = rt.localGame.entities;
  const WorldTour = await rt.load('/src/gameplay/worldTour/WorldTourLifecycle.js');
  const q = (v, p) => { const s = v.map(Number).filter(Number.isFinite).sort((a, b) => a - b); if (!s.length) return null; const i = (s.length - 1) * p; return Math.round(s[Math.floor(i)] * 10) / 10; };
  const fieldOf = async (tier, id) => {
    const t = await E.Tournament.create({ id, name: tier, tier, start_date: profile.career_date, end_date: profile.career_date, status: 'inscricoes' });
    const f = await WorldTour.buildPlayerTournamentField({ tournament: t, profile, playerRank: 400, playerTeamName: 'A & B', partnerAthleteId: profile.partner_id });
    const ovrs = f.entrants.map((p) => p.athletes.reduce((s, a) => s + Number(a.overall_rating || a.overall || 50), 0) / p.athletes.length);
    const ranks = f.entrants.map((p) => { const r = p.athletes.map((a) => Number(a.ranking_position) || 0).filter((v) => v > 0); return r.length ? Math.round(r.reduce((a, b) => a + b, 0) / r.length) : 0; });
    return { f, ovrs, ranks };
  };
  const bronze = await fieldOf('Bronze', 'd527b-open-bronze');
  const silver = await fieldOf('Silver', 'd527b-open-silver');

  await check('Bronze: field de base real (median OVR <= 45, sem top-100)', () => {
    assert.ok(bronze.ovrs.length >= 8, 'campo pequeno');
    assert.ok(q(bronze.ovrs, 0.5) <= 45, `Bronze median OVR ${q(bronze.ovrs, 0.5)}`);
    assert.equal(bronze.ranks.filter((r) => r > 0 && r <= 100).length, 0, 'elite no Bronze');
  });

  await check('Silver: field de base real (median OVR <= 55, sem top-100)', () => {
    assert.ok(q(silver.ovrs, 0.5) <= 55, `Silver median OVR ${q(silver.ovrs, 0.5)}`);
    assert.equal(silver.ranks.filter((r) => r > 0 && r <= 100).length, 0, 'elite no Silver');
  });

  await check('R1 dos tiers abertos é um adversário de base (não um topo do mundo)', () => {
    for (const [name, f] of [['Bronze', bronze], ['Silver', silver]]) {
      const r1Id = f.f.mainOpponentIds[0];
      const r1 = r1Id ? f.f.pairsById.get(r1Id) : null;
      assert.ok(r1, `${name}: sem R1`);
      const rank = f.f.rankByPairId.get(r1Id) || 0;
      assert.ok(rank > 400, `${name}: R1 rank ${rank} não é de base`);
    }
  });

  await check('sem fallback sintético e sem OVR fabricado', () => {
    assert.ok(!bronze.f.diagnostics.syntheticFallback, 'Bronze com fallback sintético');
    assert.ok(!silver.f.diagnostics.syntheticFallback, 'Silver com fallback sintético');
  });
} finally {
  await rt.close();
}
finish();
