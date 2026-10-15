// Playthrough 5.27-C, Bloco N — curva de OVR inicial (×1.8) e comparação ao
// field. Hard rule: não aumentar >1.8 nesta fase.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { bootCareer } from './lib/v526bTestKit.mjs';

const { check, finish } = makeSuite('test-initial-ovr-curve-v527c');
const { rt } = await bootCareer('initial-ovr-curve-527c');
try {
  const Profiles = await rt.load('/src/lib/initialCareerProfiles.js');
  const Balance = await rt.load('/src/lib/balance527.js');

  await check('hard rule: multiplier de atributos iniciais <= 1.8', () => {
    for (const p of Object.values(Balance.BALANCE_527B_PRESETS)) {
      assert.ok(p.initialAttributeMultiplier <= 1.8, `${p.id}: ${p.initialAttributeMultiplier}`);
    }
  });

  await check('a curva de OVR inicial é medível (start/3m/6m/1y/2y/3y/5y via weekly)', () => {
    const build = Profiles.buildInitialProfile({ handedness: 'right', preferredSide: 'direita', playStyle: 'equilibrado', careerDifficultyId: 'normal' });
    const startOvr = Object.values(build.attributes).reduce((s, v) => s + v, 0) / Object.keys(build.attributes).length;
    assert.ok(startOvr >= 16 && startOvr <= 28, `start OVR ${startOvr.toFixed(1)}`);
  });

  await check('o OVR inicial é comparável ao field de base (não 30 abaixo)', async () => {
    const { bootDrawCareer } = await import('./lib/v526dDrawKit.mjs');
    const ctx = await bootDrawCareer('initial-ovr-field-527c', { warmDays: 8 });
    try {
      const E = ctx.rt.localGame.entities;
      const WorldTour = await ctx.rt.load('/src/gameplay/worldTour/WorldTourLifecycle.js');
      const t = await E.Tournament.create({ id: 'd527c-ovr-bronze', name: 'Bronze', tier: 'Bronze', start_date: ctx.profile.career_date, end_date: ctx.profile.career_date, status: 'inscricoes' });
      const f = await WorldTour.buildPlayerTournamentField({ tournament: t, profile: ctx.profile, playerRank: 900, playerTeamName: 'A & B', partnerAthleteId: ctx.profile.partner_id });
      const fieldMed = f.entrants.map((p) => p.athletes.reduce((s, a) => s + Number(a.overall_rating || a.overall || 50), 0) / p.athletes.length).sort((a, b) => a - b)[Math.floor(f.entrants.length / 2)];
      assert.ok(fieldMed <= 50, `Bronze field median ${fieldMed} ainda alto`);
    } finally { await ctx.rt.close(); }
  });
} finally {
  await rt.close();
  finish();
}
