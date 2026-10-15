// Playthrough 5.26-B — parceiro COMPROMETIDO (registrado na inscrição) entra
// na partida com a identidade certa e o OVR canônico, mesmo depois de a
// parceria terminar. A correção do OVR é de input; o roster comprometido
// (committedRoster.js) continua sendo a autoridade de QUEM joga.
import { makeSuite, bootCareer, assert } from './lib/v526bTestKit.mjs';
import * as act from './lib/v526Actions.mjs';

const { check, finish } = makeSuite('test-partner-committed-roster-ovr-v526b');
const { rt, profile: p0 } = await bootCareer('committed-roster-526b');
try {
  const A = await act.loadActionModules(rt);
  const engine = await rt.load('/src/lib/matchEngine.js');
  const roster = await rt.load('/src/lib/committedRoster.js');
  await act.completeOnboarding(rt, A, p0, { side: 'direita', style: 'equilibrado', name: 'Teste' });
  let profile = await rt.localGame.entities.PlayerProfile.get(p0.id);
  const pr = await act.ensurePartner(rt, A, profile, (rows) => rows[0]);
  assert.ok(pr.partnership, 'sem parceria inicial');
  const partnerId = pr.partnership.partner_bot_id || pr.partnership.athlete_b_id;
  profile = await rt.localGame.entities.PlayerProfile.get(p0.id);

  // Inscrição real num torneio aberto (Bronze/Silver aceitam dupla sem ranking).
  const cands = (await act.registrationCandidates(rt, A, profile)).filter((t) => ['Bronze', 'Silver'].includes(t.tier));
  let registered = null;
  for (const t of cands) { const r = await act.tryRegister(rt, A, profile, t, { id: partnerId, name: 'P' }); if (r.ok) { registered = t; break; } }

  await check('inscrição registra o parceiro comprometido', () => assert.ok(registered, 'nenhuma inscrição aceita'));

  const committed = await roster.resolveCommittedPartnerAthlete({ profile, tournamentId: registered.id });
  await check('parceiro comprometido resolvido com a identidade da inscrição', () => assert.equal(committed?.id, partnerId));
  await check('motor usa o OVR canônico do parceiro comprometido (> 1)', () => {
    const canonical = A.padel ? A.padel.overallRating(committed) : rt.padel.overallRating(committed);
    const state = engine.createMatch([profile, committed], [{ id: 'o1', name: 'O1', overall_rating: 30 }, { id: 'o2', name: 'O2', overall_rating: 30 }], { seed: 'roster' });
    assert.ok(canonical > 1, `OVR canônico inválido: ${canonical}`);
    assert.equal(state.teams.A[1].overall, canonical);
  });

  // Fim da parceria DEPOIS da inscrição: o torneio continua com o ex-parceiro.
  await A.partnerLifecycle.releasePartner(profile, 'teste 5.26-B');
  profile = await rt.localGame.entities.PlayerProfile.get(p0.id);
  const after = await roster.resolveCommittedPartnerAthlete({ profile, tournamentId: registered.id });
  await check('ex-parceiro comprometido: mesma identidade após o fim da parceria', () => assert.equal(after?.id, partnerId));
  await check('ex-parceiro comprometido: OVR válido no motor (não cai para 1)', () => {
    const state = engine.createMatch([profile, after], [{ id: 'o1', name: 'O1', overall_rating: 30 }, { id: 'o2', name: 'O2', overall_rating: 30 }], { seed: 'roster2' });
    assert.equal(state.teams.A[1].overall, rt.padel.overallRating(after));
    assert.ok(state.teams.A[1].overall > 1);
  });
} finally {
  await rt.close();
}
finish();
