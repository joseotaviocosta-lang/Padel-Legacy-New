// Playthrough 4.8, Parte O — 100 carreiras novas: para cada uma, colhe as
// 4 propostas de primeira dupla via o MESMO caminho real que o jogo usa
// (buildFirstPartnershipOffers + pool ampliado iniciante+amador, igual a
// widenedFirstPartnershipPool em partnerOffers.js), e agrega
// idade/OVR/categoria. Determinístico (fnv1aHash), nunca Math.random.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { buildFirstPartnershipOffers } = await vite.ssrLoadModule('/src/lib/partnerOfferRules.js');
  const { FIRST_PARTNERSHIP_CATEGORY } = await vite.ssrLoadModule('/src/lib/firstPartnershipScoring.js');
  const { BOTS_BY_DIFFICULTY } = await vite.ssrLoadModule('/src/lib/bots.js');
  const { fnv1aHash } = await vite.ssrLoadModule('/src/lib/hashUtils.js');

  const widenedPool = [...BOTS_BY_DIFFICULTY.iniciante, ...(BOTS_BY_DIFFICULTY.amador || [])];
  assert.ok(widenedPool.length > 0, 'pré-condição: o catálogo real precisa ter candidatos iniciante/amador');

  const PLAY_STYLES = ['Equilibrado', 'Tático', 'Agressivo', 'Defensivo'];
  const COURT_SIDES = ['direita', 'esquerda', 'versatil'];

  const stats = { young: 0, veteran: 0, poor: 0, normal: 0, ages: [], overalls: [] };
  let totalOffers = 0;
  const careers = 100;

  for (let i = 0; i < careers; i += 1) {
    const seed = `first-partnership-100-careers:${i}`;
    const baseAttr = 8 + (fnv1aHash(seed) % 12); // 8..19, faixa plausível de jogador de 16 anos recém-criado.
    const player16 = {
      id: `career-${i}`, sport_name: `Atleta ${i}`, country: 'Brasil', level: 'Iniciante', career_level: 1, xp: 0,
      coins: 100, career_date: '2026-01-01', birth_date: '2010-01-01',
      serve: baseAttr, forehand: baseAttr, backhand: baseAttr, volley: baseAttr, bandeja: baseAttr, smash: baseAttr,
      defense: baseAttr, agility: baseAttr, strategy: baseAttr, emotional_control: baseAttr,
      court_side: COURT_SIDES[fnv1aHash(`${seed}:side`) % COURT_SIDES.length],
      play_style: PLAY_STYLES[fnv1aHash(`${seed}:style`) % PLAY_STYLES.length],
      partner_chemistry: 50,
    };

    const offers = buildFirstPartnershipOffers(player16, widenedPool);
    totalOffers += offers.length;
    for (const offer of offers) {
      const candidate = offer.candidate_snapshot;
      stats.ages.push(Number(candidate.age) || 0);
      stats.overalls.push(Number(candidate.overall_rating ?? candidate.overall) || 0);
      if (offer.first_partnership_category === FIRST_PARTNERSHIP_CATEGORY.YOUNG_PROJECT) stats.young += 1;
      else if (offer.first_partnership_category === FIRST_PARTNERSHIP_CATEGORY.VETERAN_MENTOR) stats.veteran += 1;
      else if (offer.first_partnership_category === FIRST_PARTNERSHIP_CATEGORY.POOR_FIRST_PARTNER) stats.poor += 1;
      else stats.normal += 1;
    }
  }

  const pct = (n) => totalOffers ? Math.round((n / totalOffers) * 1000) / 10 : 0;
  const avg = (arr) => arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : 0;

  console.log(`=== Playthrough 4.8, Parte O — resultado de ${careers} carreiras (${totalOffers} propostas no total) ===`);
  console.log(`YOUNG_PROJECT: ${stats.young} (${pct(stats.young)}%)`);
  console.log(`VETERAN_MENTOR: ${stats.veteran} (${pct(stats.veteran)}%)`);
  console.log(`NORMAL: ${stats.normal} (${pct(stats.normal)}%)`);
  console.log(`POOR_FIRST_PARTNER: ${stats.poor} (${pct(stats.poor)}%)`);
  console.log(`Idade média dos candidatos: ${avg(stats.ages)} (min ${Math.min(...stats.ages)}, max ${Math.max(...stats.ages)})`);
  console.log(`OVR médio dos candidatos: ${avg(stats.overalls)} (min ${Math.min(...stats.overalls)}, max ${Math.max(...stats.overalls)})`);

  assert.ok(totalOffers > 0, 'as 100 carreiras deveriam gerar propostas no total');
  assert.equal(stats.poor, 0, `POOR_FIRST_PARTNER deveria ser 0% na vitrine principal, obtido ${stats.poor} de ${totalOffers} (${pct(stats.poor)}%)`);
  assert.ok(pct(stats.young) >= 40, `esperava maioria de jovens projeto entre as propostas, obtido ${pct(stats.young)}%`);

  console.log('test-first-partnership-100-careers: PASS');
} finally {
  await vite.close();
}
