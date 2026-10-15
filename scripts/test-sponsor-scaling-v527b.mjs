// Playthrough 5.27-B, Bloco E — patrocínio inicial reduzido e escalonado, com
// prova de carreira. Não altera a arquitetura (catálogo/slots/negociação).
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { bootCareer } from './lib/v526bTestKit.mjs';

const { check, finish } = makeSuite('test-sponsor-scaling-v527b');
const { rt } = await bootCareer('sponsor-scaling-527b');
try {
  const Sponsors = await rt.load('/src/lib/sponsors.js');
  const Balance = await rt.load('/src/lib/balance527.js');
  const bronze = Sponsors.SPONSOR_CATALOG.find((s) => s.id === 'babolat');
  const profile = { id: 'p', sport_name: 'P', career_date: '2026-01-01', birth_date: '2005-01-01', fan_appeal: 60, xp: 2000, tournaments_won: 0, tournaments_played: 5, play_style: 'Equilibrado', level: 'Amador', court_side: 'direita' };

  await check('config define multiplicador de sponsor (candidatos 0.20/0.22/0.25)', () => {
    const m = Balance.getBalance527().sponsor.monthlyMultiplier;
    assert.ok(m > 0 && m < 0.5, `monthlyMultiplier=${m}`);
  });

  await check('oferta do Bronze é muito menor que o base do catálogo', () => {
    const offer = Sponsors.negotiateOffer(bronze, profile);
    assert.ok(offer.monthly_salary < bronze.base_monthly_value * 0.5, `${offer.monthly_salary} vs base ${bronze.base_monthly_value}`);
    assert.ok(offer.sign_bonus < bronze.base_sign_bonus * 0.5, `${offer.sign_bonus} vs base ${bronze.base_sign_bonus}`);
  });

  await check('sem prova de carreira (0 torneios) o patrocínio é bloqueado', () => {
    const check0 = Sponsors.canSign(bronze, { ...profile, tournaments_played: 0 });
    assert.equal(check0.ok, false);
    assert.match(check0.reason, /prova de carreira/i);
  });

  await check('com prova mínima e requisitos, o patrocínio é aceito', () => {
    const check1 = Sponsors.canSign(bronze, profile);
    assert.equal(check1.ok, true, check1.reason);
  });

  await check('elite (Head) continua exigindo títulos/XP/fãs altos (não facilitado)', () => {
    const head = Sponsors.SPONSOR_CATALOG.find((s) => s.id === 'head');
    const low = Sponsors.canSign(head, { ...profile, xp: 0, tournaments_won: 0, fan_appeal: 10 });
    assert.equal(low.ok, false);
  });
} finally {
  await rt.close();
}
finish();
