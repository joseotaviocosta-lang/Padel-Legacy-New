// Playthrough 4.8, Parte G — o selo "Recomendado" precisa parar de ser
// decorativo: valida que buildFirstPartnershipOffers escolhe `recommended`
// pelo MAIOR score real entre os selecionados (nunca por posição fixa), e
// que um candidato velho/OVR muito baixo/iniciante jamais consegue vencer
// candidatos jovens coerentes na corrida pela recomendação -- porque nem
// sequer entra na vitrine.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { buildFirstPartnershipOffers } = await vite.ssrLoadModule('/src/lib/partnerOfferRules.js');
  const { FIRST_PARTNERSHIP_CATEGORY } = await vite.ssrLoadModule('/src/lib/firstPartnershipScoring.js');

  const player16 = {
    id: 'test-day1', sport_name: 'Novo Atleta', country: 'Brasil', level: 'Iniciante', career_level: 1, xp: 0,
    coins: 100, career_date: '2026-01-01', birth_date: '2010-01-01',
    serve: 10, forehand: 10, backhand: 10, volley: 10, bandeja: 10, smash: 10,
    defense: 10, agility: 10, strategy: 10, emotional_control: 10,
    court_side: 'direita', play_style: 'Equilibrado', partner_chemistry: 50,
  };

  // Réplica do exemplo real reportado (Parte A): 4 candidatos incoerentes,
  // todos velhos/OVR baixo/iniciante -- nenhum pode aparecer, nenhum pode
  // ser recomendado.
  const incoherentPool = [
    { id: 'tiago', name: 'Tiago Monteiro', age: 28, overall: 7, overall_rating: 7, level: 'Iniciante', career_status: 'ativo' },
    { id: 'nuno', name: 'Nuno Fernandes', age: 36, overall: 8, overall_rating: 8, level: 'Iniciante', career_status: 'ativo' },
    { id: 'andrea', name: 'Andrea Conti', age: 27, overall: 10, overall_rating: 10, level: 'Iniciante', career_status: 'ativo' },
    { id: 'alvaro', name: 'Álvaro Ramos', age: 35, overall: 5, overall_rating: 5, level: 'Iniciante', career_status: 'ativo' },
  ];
  const incoherentOffers = buildFirstPartnershipOffers(player16, incoherentPool);
  assert.equal(incoherentOffers.length, 0, 'pool 100% incoerente (o bug original) não deveria gerar nenhuma proposta de primeira dupla');

  // Pool misto: os 4 incoerentes + candidatos coerentes -- o recomendado
  // tem que vir de um candidato coerente, nunca de um dos 4 incoerentes.
  const mixedPool = [
    ...incoherentPool,
    { id: 'coerente1', name: 'Jovem Coerente 1', age: 18, overall: 12, overall_rating: 12, potential: 34, preferred_side: 'left', tactical_role: 'coringa', career_status: 'ativo' },
    { id: 'coerente2', name: 'Jovem Coerente 2', age: 20, overall: 16, overall_rating: 16, potential: 38, preferred_side: 'right', tactical_role: 'finalizador', career_status: 'ativo' },
    { id: 'mentor1', name: 'Mentor Coerente', age: 31, overall: 22, overall_rating: 22, potential: 23, preferred_side: 'left', tactical_role: 'defensor', career_status: 'ativo' },
  ];
  const mixedOffers = buildFirstPartnershipOffers(player16, mixedPool);
  assert.ok(mixedOffers.length > 0, 'pool misto deveria gerar propostas a partir dos candidatos coerentes');
  assert.ok(mixedOffers.every((offer) => !incoherentPool.some((bad) => bad.id === offer.candidate_player_id)), 'nenhum dos 4 candidatos incoerentes originais pode aparecer na vitrine final');

  const recommended = mixedOffers.find((offer) => offer.recommended);
  assert.ok(recommended, 'exatamente uma proposta deveria estar marcada como recomendada');
  assert.ok(!incoherentPool.some((bad) => bad.id === recommended.candidate_player_id), 'o recomendado nunca pode ser um dos candidatos incoerentes (velho + OVR muito baixo + iniciante)');
  assert.ok(recommended.first_partnership_category === FIRST_PARTNERSHIP_CATEGORY.YOUNG_PROJECT || recommended.first_partnership_category === FIRST_PARTNERSHIP_CATEGORY.VETERAN_MENTOR, `recomendado deveria ter categoria coerente, obtido ${recommended.first_partnership_category}`);

  // O recomendado precisa ter o maior recommendation_score real entre as
  // propostas geradas (nunca só "primeira posição do array").
  const maxScore = Math.max(...mixedOffers.map((offer) => offer.recommendation_score));
  assert.equal(recommended.recommendation_score, maxScore, 'o recomendado precisa ter o maior score real entre as propostas, não uma posição fixa');
  assert.equal(mixedOffers.filter((offer) => offer.recommended).length, 1, 'só uma proposta pode estar marcada como recomendada');

  console.log('test-first-partnership-ranking: PASS');
} finally {
  await vite.close();
}
