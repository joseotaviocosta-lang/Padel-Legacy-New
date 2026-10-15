// Playthrough 5.27-B, Bloco A — escada Bronze < Silver. Hard gate: a mediana de
// força do Bronze não pode ser maior que a do Silver.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { bootDrawCareer } from './lib/v526dDrawKit.mjs';

const { check, finish } = makeSuite('test-bronze-silver-band-v527b');
const { rt, profile } = await bootDrawCareer('bronze-silver-band-527b', { warmDays: 8 });
try {
  const E = rt.localGame.entities;
  const WorldTour = await rt.load('/src/gameplay/worldTour/WorldTourLifecycle.js');
  const q = (v, p) => { const s = v.map(Number).filter(Number.isFinite).sort((a, b) => a - b); if (!s.length) return null; const i = (s.length - 1) * p; return Math.round(s[Math.floor(i)] * 10) / 10; };
  const field = async (tier, id) => {
    const t = await E.Tournament.create({ id, name: tier, tier, start_date: profile.career_date, end_date: profile.career_date, status: 'inscricoes' });
    const f = await WorldTour.buildPlayerTournamentField({ tournament: t, profile, playerRank: 400, playerTeamName: 'A & B', partnerAthleteId: profile.partner_id });
    return f.entrants.map((p) => p.athletes.reduce((s, a) => s + Number(a.overall_rating || a.overall || 50), 0) / p.athletes.length);
  };
  const bronze = await field('Bronze', 'd527b-band-bronze');
  const silver = await field('Silver', 'd527b-band-silver');

  await check('hard gate: Bronze median OVR < Silver median OVR', () => {
    const bm = q(bronze, 0.5); const sm = q(silver, 0.5);
    assert.ok(bm < sm, `Bronze ${bm} >= Silver ${sm}`);
  });

  await check('as bandas são distintas (não é o mesmo conjunto)', () => {
    assert.notDeepEqual([...bronze].sort(), [...silver].sort());
  });

  await check('Silver continua um degrau acessível (median < 60)', () => {
    assert.ok(q(silver, 0.5) < 60, `Silver median ${q(silver, 0.5)}`);
  });
} finally {
  await rt.close();
}
finish();
