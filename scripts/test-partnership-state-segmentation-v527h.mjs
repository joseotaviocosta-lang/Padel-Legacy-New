// Playthrough 5.27-H, Bloco D — partidas do 1º ano separadas em A (parceiro
// atual antes da decisão), B (renovação recusada, compromissos pendentes) e
// C (novo parceiro). Regra pura + cobertura total na matriz oficial.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { partnershipTimeline, stateOf, dayOfDate } from './lib/v527hMetrics.mjs';
import { csvRows, has, runs } from './lib/v527hTestKit.mjs';

const { check, finish } = makeSuite('test-partnership-state-segmentation-v527h');
try {
  await check('regra: A antes da recusa, B entre recusa e troca, C após a troca; sem recusa tudo A', () => {
    const fr = { refusalDay: 100, changeDay: 160 };
    assert.equal(stateOf(10, fr), 'A'); assert.equal(stateOf(100, fr), 'B'); assert.equal(stateOf(159, fr), 'B'); assert.equal(stateOf(160, fr), 'C');
    assert.equal(stateOf(300, null), 'A');
    assert.equal(stateOf(300, { refusalDay: 200, changeDay: null }), 'B');
  });
  await check('recusa = última decisão "não" de um contrato; recusa seguida de renovação não conta', () => {
    const r = { days: 365, partners: [{ day: 0 }, { day: 150 }], renewalDecisions: [
      { day: 40, partnershipId: 'p1', renew: false }, { day: 47, partnershipId: 'p1', renew: true },
      { day: 120, partnershipId: 'p2', renew: false, reason: 'market' }, { day: 127, partnershipId: 'p2', renew: false, reason: 'market' },
    ] };
    const t = partnershipTimeline(r);
    assert.equal(t.length, 1);
    assert.deepEqual([t[0].partnershipId, t[0].refusalDay, t[0].changeDay, t[0].limboDays], ['p2', 120, 150, 30]);
  });
  await check('matriz: toda partida do 1º ano de toda carreira cai em exatamente um estado', () => {
    const rs = runs();
    assert.ok(rs.length > 0, 'sem runs');
    for (const { file, env } of rs) {
      const r = env.result;
      assert.ok(Array.isArray(r.renewalDecisions), `${file}: renewalDecisions ausente (instrumentação 5.27-H)`);
      const fr = partnershipTimeline(r).find((x) => x.refusalDay < 365) || null;
      const y1 = r.matches.filter((m) => dayOfDate(r.startDate, m.date) < 365);
      const states = y1.map((m) => stateOf(dayOfDate(r.startDate, m.date), fr));
      assert.equal(states.filter((s) => ['A', 'B', 'C'].includes(s)).length, y1.length, file);
      if (!fr) assert.ok(states.every((s) => s === 'A'), file);
    }
  });
  await check('partnership-state.csv: A+B+C = partidas do 1º ano por preset/perfil, com OVR jogador/parceiro/dupla/adversário', () => {
    assert.ok(has('partnership-state.csv'));
    const rows = csvRows('partnership-state.csv');
    const rs = runs();
    for (const p of ['conservative-e', 'balanced-e', 'hardcore-e']) for (const pr of ['casual', 'normal', 'optimizer']) {
      const tot = rows.filter((x) => x.preset === p && x.profile === pr).reduce((s, x) => s + x.matches, 0);
      const want = rs.filter((x) => x.env.preset === p && x.env.profile === pr).reduce((s, x) => s + x.env.result.matches.filter((m) => dayOfDate(x.env.result.startDate, m.date) < 365).length, 0);
      assert.equal(tot, want, `${p}/${pr}`);
    }
    for (const x of rows.filter((r) => r.matches > 0)) for (const k of ['playerOvr', 'partnerOvr', 'teamOvr', 'opponentOvr']) assert.ok(x[k] != null, `${x.preset}/${x.profile}/${x.state} ${k}`);
  });
} catch (e) { console.error(e); process.exitCode = 1; }
finish();
