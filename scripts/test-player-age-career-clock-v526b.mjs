// Playthrough 5.26-B — idade do jogador pela DATA DA CARREIRA (com limite de
// aniversário), nunca pelo relógio do sistema. Antes, sponsors.js usava
// `new Date()` e o atleta nascido em 2010 tinha "16 anos" para sempre.
import { makeSuite, bootModules, assert } from './lib/v526bTestKit.mjs';

const { check, finish } = makeSuite('test-player-age-career-clock-v526b');
const m = await bootModules();
const RealDate = Date;
try {
  const padel = await m.load('/src/lib/padel.js');
  const sponsors = await m.load('/src/lib/sponsors.js');
  // Patrocinador Prata real do catálogo com idade mínima 18 (Garmin: 18–38).
  const garmin = sponsors.SPONSOR_CATALOG.find((s) => s.id === 'garmin' || s.name === 'Garmin');
  const base = { birth_date: '2010-01-01', xp: 50000, fan_appeal: 100, titles: [], career_level: 30, tournaments_played: 5 };
  const ageAt = (date) => padel.calculateAge({ ...base, career_date: date });
  const canSignAt = (date) => sponsors.canSign(garmin, { ...base, career_date: date });

  // Relógio do sistema propositalmente em 2040: o resultado não pode depender dele.
  globalThis.Date = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super('2040-06-15T12:00:00Z'); } static now() { return new RealDate('2040-06-15T12:00:00Z').getTime(); } };

  await check('início da carreira (2026-01-01): 16 anos', () => assert.equal(ageAt('2026-01-01'), 16));
  await check('+365 dias (2027-01-01): 17 anos', () => assert.equal(ageAt('2027-01-01'), 17));
  await check('+730 dias (2028-01-01): 18 anos', () => assert.equal(ageAt('2028-01-01'), 18));
  await check('véspera do aniversário (2027-12-31): ainda 17', () => assert.equal(ageAt('2027-12-31'), 17));
  await check('aniversário no meio do ano respeita o dia exato', () => {
    const p = { birth_date: '2010-07-20' };
    assert.equal(padel.calculateAge({ ...p, career_date: '2028-07-19' }), 17);
    assert.equal(padel.calculateAge({ ...p, career_date: '2028-07-20' }), 18);
  });
  await check('patrocínio (sponsors.js) usa a idade da carreira: Garmin (18+) recusa aos 17', () => {
    const r = canSignAt('2027-12-31');
    assert.equal(r.ok, false); assert.match(r.reason, /faixa etária/);
  });
  await check('… e aceita aos 18 (2028-01-01), com o relógio do sistema em 2040', () => assert.deepEqual(canSignAt('2028-01-01'), { ok: true }));
  await check('faixa etária do catálogo inalterada (Garmin 18–38)', () => { assert.equal(garmin.min_age, 18); assert.equal(garmin.max_age, 38); });
} finally {
  globalThis.Date = RealDate;
  await m.close();
}
finish();
