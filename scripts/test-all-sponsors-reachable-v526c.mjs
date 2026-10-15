// Playthrough 5.26-C, Bloco B — nenhum patrocinador é conteúdo inalcançável.
// Para cada entrada de SPONSOR_CATALOG, existe um estado de carreira
// ALCANÇÁVEL em que ele (1) aparece no mercado mensal (estágio econômico que
// libera o tier + sorteio do mês), (2) tem categoria de slot válida e
// (3) passa no canSign. Os limites do jogo vêm do próprio jogo: idade inicial
// da carreira criada pelo onboarding real, RETIREMENT_AGE, apelo de fãs 0–100.
import { writeFileSync } from 'node:fs';
import { makeSuite, bootCareer, assert } from './lib/v526bTestKit.mjs';
import * as act from './lib/v526Actions.mjs';

const { check, finish } = makeSuite('test-all-sponsors-reachable-v526c');
const { rt, profile: p0 } = await bootCareer('sponsors-reachable-526c');
try {
  const A = await act.loadActionModules(rt);
  await act.completeOnboarding(rt, A, p0, { side: 'direita', style: 'equilibrado', name: 'Teste' });
  const S = A.sponsors;
  const M = A.sportsEconomy;
  const padel = rt.padel;
  const start = await rt.localGame.entities.PlayerProfile.get(p0.id);
  const startAge = padel.ageAtDate ? padel.ageAtDate(start.birth_date, start.career_date) : Number(start.career_date.slice(0, 4)) - Number(start.birth_date.slice(0, 4));
  const RET = padel.RETIREMENT_AGE;
  const addMonths = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 10); };
  const STAGE_FOR_TIER = { Bronze: 'beginner', Prata: 'regional', Ouro: 'professional' };
  const STAGE_PROFILE = {
    beginner: { career_level: 1, ranking_position: 2000, fan_appeal: 0 },
    regional: { career_level: 5, ranking_position: 900, fan_appeal: 10 },
    professional: { career_level: 12, ranking_position: 500, fan_appeal: 15 },
  };
  const rows = [];

  await check(`idade inicial real da carreira: ${startAge} anos; aposentadoria ${RET}`, () => assert.ok(startAge >= 15 && startAge < RET));
  for (const s of S.SPONSOR_CATALOG) {
    await check(`${s.id} (${s.tier}) é alcançável`, () => {
      // 1. Janela de idade cruza a carreira.
      const ageLo = Math.max(s.min_age || 16, startAge);
      const ageHi = Math.min(s.max_age || 40, RET);
      assert.ok(ageLo <= ageHi, `idade ${s.min_age}-${s.max_age} fora da carreira ${startAge}-${RET}`);
      // 2. Fãs dentro da escala; categoria válida.
      assert.ok((s.min_fan_appeal || 0) <= 100, 'apelo de fãs acima de 100');
      assert.ok(Object.prototype.hasOwnProperty.call(S.SPONSOR_SLOT_LIMITS, S.getSponsorCategory(s)), `categoria ${S.getSponsorCategory(s)}`);
      // 3. Estado no limiar: menor estágio que libera o tier + requisitos exatos.
      const stage = STAGE_FOR_TIER[s.tier] || 'beginner';
      const careerDate = addMonths(start.career_date, 12 * (ageLo - startAge));
      const profile = {
        ...start, ...STAGE_PROFILE[stage], career_date: careerDate,
        xp: s.min_xp || 0, tournaments_won: s.min_titles || 0,
        // Playthrough 5.27-B — o patrocínio agora exige prova de carreira
        // (torneios disputados). A alcançabilidade é a MESMA; só o gate mudou.
        tournaments_played: 5,
        fan_appeal: Math.max(STAGE_PROFILE[stage].fan_appeal, s.min_fan_appeal || 0),
      };
      assert.equal(M.getCareerEconomyStage(profile), stage, 'estágio econômico');
      assert.deepEqual(S.canSign(s, profile), { ok: true });
      // 4. Aparece no mercado em algum mês dos 24 seguintes.
      let firstMonth = null;
      for (let m = 0; m < 24 && firstMonth === null; m += 1) {
        const p = { ...profile, career_date: addMonths(careerDate, m) };
        if (M.getMonthlySponsorMarket(p, S.SPONSOR_CATALOG).sponsors.some((x) => x.id === s.id)) firstMonth = m;
      }
      assert.notEqual(firstMonth, null, 'nunca aparece no mercado em 24 meses');
      rows.push({ id: s.id, name: s.name, tier: s.tier, category: S.getSponsorCategory(s), requirements: { xp: s.min_xp || 0, titles: s.min_titles || 0, fans: s.min_fan_appeal || 0, age: [s.min_age, s.max_age] }, marketStage: stage, careerAgeWindow: [ageLo, ageHi], monthsToAppearAtThreshold: firstMonth, explicitAvailability: s.is_available ?? null });
    });
  }
  await check('classificação: nenhum CONTEÚDO INALCANÇÁVEL no catálogo', () => assert.equal(rows.length, S.SPONSOR_CATALOG.length));
  // Tabela de alcançabilidade (entrada do sponsors-eligibility.json).
  writeFileSync('reports/progression-clean-526c/sponsors-reachability.json', JSON.stringify(rows, null, 2));
} finally {
  await rt.close();
}
finish();
