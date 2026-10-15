// Playthrough 5.26-B — reparo de semeadura (saveFoundation) idempotente.
// Mesma entrada do jogo real (WorldTourLifecycle.js): verify → ensure só se !ok.
//   repair(save saudável)              → 0 criações, 0 escritas
//   repair(mundo evoluído legitimamente) → 0 criações, 0 escritas
//   repair(falta 1 atleta real)        → cria exatamente 1; o próximo cria 0
//   repair(real aposentado e podado)   → não ressuscita
import { makeSuite, bootCareer, reloadCareer, assert } from './lib/v526bTestKit.mjs';

const { check, finish } = makeSuite('test-athlete-repair-idempotency-v526b');
let { rt, storage, careerId } = await bootCareer('repair-idempotency-526b');
try {
  const E = () => rt.localGame.entities;
  const sf = () => rt.saveFoundation;
  const stats = async () => (await rt.load('/src/gameplay/repositories/CareerEntityRepository.js')).careerWriteStats;
  const count = async (name) => ((await E()[name].list(null, 100000)) || []).length;
  const registry = (await rt.load('/src/players/realAthleteRegistry.js'));
  const repair = async () => {
    const s = await stats(); const writesBefore = s.count;
    const athletesBefore = await count('AthleteProfile'); const teamsBefore = await count('TeamRanking');
    const v = await sf().verifySaveFoundation();
    if (!v.ok) await sf().ensureWorldSeed2025();
    return { ok: v.ok, missing: v.missingRealAthletes, unseeded: v.unseededConfirmedPairs, created: (await count('AthleteProfile')) - athletesBefore, teamsCreated: (await count('TeamRanking')) - teamsBefore, writes: s.count - writesBefore };
  };

  await check('save saudável: verify ok, 0 criações, 0 escritas', async () => {
    const r = await repair();
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.created, 0); assert.equal(r.teamsCreated, 0); assert.equal(r.writes, 0);
  });

  // Evolução LEGÍTIMA do mundo: atleta real cai para fora do top 500 e par
  // confirmado se desfaz no mercado da IA. Era exatamente o que disparava o
  // reparo e a recriação do atleta (congelamento anual).
  const pair = registry.getConfirmedRealPairs()[0];
  const athletes = await E().AthleteProfile.list(null, 100000);
  const rowA = athletes.find((a) => a.bot_id === pair.a); const rowB = athletes.find((a) => a.bot_id === pair.b);
  await E().AthleteProfile.update(rowA.id, { world_ranking_points: 0, ranking_points: 0, rank_points: 0, ranking_position: 1200, ai_partner_id: null, ai_partnership_status: 'encerrada' });
  await E().AthleteProfile.update(rowB.id, { ai_partner_id: null, ai_partnership_status: 'sem_parceiro' });
  await check('mundo evoluído (real fora do top 500 + par desfeito): 0 criações, 0 escritas', async () => {
    const r = await repair();
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.created, 0); assert.equal(r.writes, 0);
    const after = await E().AthleteProfile.get(rowA.id);
    assert.equal(after.ai_partner_id, null, 'reparo re-pareou à força um par desfeito pelo mercado');
  });

  // Falta 1 atleta real de verdade (sem legado).
  const victim = registry.getRealAthleteRegistry().find((a) => a.bot_id !== pair.a && a.bot_id !== pair.b);
  const victimRow = athletes.find((a) => a.bot_id === victim.bot_id);
  await E().AthleteProfile.delete(victimRow.id);
  await check('falta 1 atleta real: verify acusa exatamente esse atleta', async () => {
    const v = await sf().verifySaveFoundation();
    assert.equal(v.ok, false); assert.deepEqual(v.missingRealAthletes, [victim.bot_id]);
  });
  await check('falta 1: o reparo cria exatamente 1', async () => {
    const athletesBefore = await count('AthleteProfile');
    await sf().ensureWorldSeed2025();
    assert.equal((await count('AthleteProfile')) - athletesBefore, 1);
    const recreated = (await E().AthleteProfile.list(null, 100000)).filter((a) => a.bot_id === victim.bot_id);
    assert.equal(recreated.length, 1, 'duplicado');
  });
  await check('segundo reparo: 0 criações, 0 escritas', async () => {
    const r = await repair();
    assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.created, 0); assert.equal(r.writes, 0);
  });

  // Real aposentado e podado da coleção viva: conhecido pelo legado.
  const retired = registry.getRealAthleteRegistry().find((a) => ![pair.a, pair.b, victim.bot_id].includes(a.bot_id));
  const retiredRow = (await E().AthleteProfile.list(null, 100000)).find((a) => a.bot_id === retired.bot_id);
  await E().AthleteCareerLegacy.create({ athlete_id: retiredRow.id, name: retiredRow.name, retirement_date: '2026-01-01' });
  await E().AthleteProfile.delete(retiredRow.id);
  await check('real aposentado e podado: não é ressuscitado (0 criações)', async () => {
    const r = await repair();
    assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.created, 0);
  });

  // Semeadura INTERROMPIDA (Playthrough 4.5A): os dois membros de um par
  // confirmado sem nenhum pareamento → continua sendo detectada e reparada.
  const list2 = await E().AthleteProfile.list(null, 100000);
  const pair2 = registry.getConfirmedRealPairs().slice(1).find((p) => [p.a, p.b].every((b) => list2.some((a) => a.bot_id === b)));
  for (const bot of [pair2.a, pair2.b]) { const row = list2.find((a) => a.bot_id === bot); await E().AthleteProfile.update(row.id, { ai_partner_id: null, ai_partnership_status: null }); }
  await check('semeadura interrompida (par sem nenhum pareamento) ainda é detectada e reparada', async () => {
    const v = await sf().verifySaveFoundation();
    assert.equal(v.ok, false); assert.ok(v.unseededConfirmedPairs.includes(`${pair2.a}+${pair2.b}`));
    await sf().ensureWorldSeed2025();
    const v2 = await sf().verifySaveFoundation();
    assert.equal(v2.ok, true, JSON.stringify(v2));
    const rows = (await E().AthleteProfile.list(null, 100000)).filter((a) => [pair2.a, pair2.b].includes(a.bot_id));
    assert.ok(rows.every((r) => r.ai_partner_id), 'par não foi re-semeado');
  });

  // Save/reload: o estado reparado persiste e continua saudável.
  rt = await reloadCareer(rt, storage, careerId);
  await check('após save/reload: verify ok e reparo segue com 0 criações/escritas', async () => {
    const r = await repair();
    assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.created, 0); assert.equal(r.writes, 0);
  });
} finally {
  await rt.close();
}
finish();
