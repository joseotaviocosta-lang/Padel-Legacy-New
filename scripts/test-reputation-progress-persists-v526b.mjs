// Playthrough 5.26-B — reputação do jogador evolui pela autoridade existente
// (efeitos `reputation` declarados nas respostas de entrevista, aplicados por
// pressData.js:applyReputationEffects no fluxo de Press.jsx) e persiste.
import { makeSuite, bootModules, bootCareer, reloadCareer, assert } from './lib/v526bTestKit.mjs';
import * as act from './lib/v526Actions.mjs';

const { check, finish } = makeSuite('test-reputation-progress-persists-v526b');

// ── Regra pura ──────────────────────────────────────────────────────────────
{
  const m = await bootModules();
  try {
    const press = await m.load('/src/lib/pressData.js');
    await check('efeito declarado chega ao campo reputation (base 0)', () => assert.equal(press.applyReputationEffects({}, { reputation: 3 }).reputation, 3));
    await check('soma sobre a reputação atual', () => assert.equal(press.applyReputationEffects({ reputation: 10 }, { reputation: 4 }).reputation, 14));
    await check('clamp 0–100 (mesmo dos demais campos)', () => {
      assert.equal(press.applyReputationEffects({ reputation: 99 }, { reputation: 5 }).reputation, 100);
      assert.equal(press.applyReputationEffects({ reputation: 1 }, { reputation: -3 }).reputation, 0);
    });
    await check('sem efeito de reputação → campo não é tocado', () => assert.equal('reputation' in press.applyReputationEffects({ reputation: 7 }, { fan_appeal: 2 }), false));
    await check('valores de ganho NÃO mudaram: banco de perguntas intacto (pre_1 humilde = +3)', () => {
      // pressData.js: QUESTION_BANKS.pre_match[0].answers[0].effects.reputation
      const q = press.selectInterviewQuestions('pre_match', {}, [], 10).find((x) => x.id === 'pre_1');
      if (q) assert.equal(q.answers.find((a) => a.tone === 'humilde').effects.reputation, 3);
    });
  } finally { await m.close(); }
}

// ── Fluxo real de imprensa + persistência ───────────────────────────────────
let { rt, storage, careerId, profile: p0 } = await bootCareer('reputation-526b');
try {
  const A = await act.loadActionModules(rt);
  await act.completeOnboarding(rt, A, p0, { side: 'direita', style: 'equilibrado', name: 'Teste' });
  let profile = await rt.localGame.entities.PlayerProfile.get(p0.id);
  const pr = await act.ensurePartner(rt, A, profile, (rows) => rows[0]);
  profile = await rt.localGame.entities.PlayerProfile.get(p0.id);
  const cands = (await act.registrationCandidates(rt, A, profile)).filter((t) => ['Bronze', 'Silver'].includes(t.tier));
  for (const t of cands) { const r = await act.tryRegister(rt, A, profile, t, { id: pr.partnership.partner_bot_id || pr.partnership.athlete_b_id, name: 'P' }); if (r.ok) break; }

  // Avança dia a dia até surgir entrevista; responde escolhendo a resposta de
  // maior reputação declarada (escolha do jogador, não valor novo).
  const chooseAnswer = (q) => [...q.answers].sort((a, b) => (b.effects?.reputation || 0) - (a.effects?.reputation || 0))[0];
  let answered = null; let beforeRep = 0;
  for (let day = 0; day < 40 && !answered; day += 1) {
    profile = await rt.localGame.entities.PlayerProfile.get(p0.id);
    beforeRep = Number(profile.reputation) || 0;
    const r = await act.answerPendingInterviews(rt, A, profile, { chooseAnswer, max: 1 });
    if (r.answered.length) { answered = r.answered[0]; break; }
    const adv = await rt.calendar.advanceCareerDays(profile, 1);
    if (adv.blockedBy?.id) await A.calendarSystem.resolveDecision(adv.blockedBy.id, 'skip').catch(() => null);
  }
  await check('entrevista respondida pelo fluxo real de Press', () => assert.ok(answered, 'nenhuma entrevista disponível em 40 dias'));
  const afterRep = Number((await rt.localGame.entities.PlayerProfile.get(p0.id)).reputation) || 0;
  await check('reputação aumentou exatamente o efeito declarado nas respostas', () => {
    const declared = Number(answered.effects.reputation) || 0;
    assert.ok(declared > 0, 'respostas escolhidas sem efeito de reputação');
    assert.equal(afterRep, Math.min(100, beforeRep + declared));
  });
  await check('sem evento (dia comum) → reputação não muda', async () => {
    const p = await rt.localGame.entities.PlayerProfile.get(p0.id);
    const adv = await rt.calendar.advanceCareerDays(p, 1);
    if (adv.blockedBy?.id) await A.calendarSystem.resolveDecision(adv.blockedBy.id, 'skip').catch(() => null);
    assert.equal(Number((await rt.localGame.entities.PlayerProfile.get(p0.id)).reputation) || 0, afterRep);
  });
  rt = await reloadCareer(rt, storage, careerId);
  await check('persiste: destroy runtime → reload → mesmo valor', async () => {
    assert.equal(Number((await rt.localGame.entities.PlayerProfile.get(p0.id)).reputation) || 0, afterRep);
  });
  await check('consumidores leem o MESMO campo (loja e estágio de patrocínio)', async () => {
    const store = await rt.load('/src/lib/storeCatalog.js');
    const econ = await rt.load('/src/lib/sportsEconomyV26.js');
    const p = await rt.localGame.entities.PlayerProfile.get(p0.id);
    const raro = store.normalizeShopItem({ rarity: 'raro', name: 'raro' });
    assert.equal(store.getShopItemAccess(p, raro).reputation, afterRep);
    assert.ok(['beginner', 'regional', 'professional', 'international', 'elite'].includes(econ.getCareerEconomyStage(p)));
  });
} finally {
  await rt.close();
}
finish();
