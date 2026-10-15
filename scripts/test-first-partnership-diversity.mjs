// Playthrough 4.8, Parte D — distribuição das 4 primeiras opções: 2 jovens
// projeto, 1 jovem mais forte, 1 veterano mentor (quando o pool permite);
// nunca 4 perfis quase idênticos.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { selectFirstPartnershipCandidates, classifyFirstPartnershipCandidate, FIRST_PARTNERSHIP_CATEGORY } = await vite.ssrLoadModule('/src/lib/firstPartnershipScoring.js');

  const player16 = {
    id: 'test-day1', sport_name: 'Novo Atleta', country: 'Brasil', level: 'Iniciante', career_level: 1, xp: 0,
    coins: 100, career_date: '2026-01-01', birth_date: '2010-01-01',
    serve: 10, forehand: 10, backhand: 10, volley: 10, bandeja: 10, smash: 10,
    defense: 10, agility: 10, strategy: 10, emotional_control: 10,
    court_side: 'direita', play_style: 'Equilibrado', partner_chemistry: 50,
  };

  // Pool balanceado: vários jovens projeto de força variada, alguns
  // veteranos mentores, alguns "normais", nenhum POOR (populações reais
  // têm ruído, mas este teste isola só a lógica de distribuição).
  const pool = [
    { id: 'yp1', name: 'Jovem 1', age: 18, overall: 9, overall_rating: 9, potential: 30, preferred_side: 'left', tactical_role: 'coringa', career_status: 'ativo' },
    { id: 'yp2', name: 'Jovem 2', age: 19, overall: 14, overall_rating: 14, potential: 33, preferred_side: 'right', tactical_role: 'finalizador', career_status: 'ativo' },
    { id: 'yp3', name: 'Jovem 3', age: 20, overall: 11, overall_rating: 11, potential: 25, preferred_side: 'left', tactical_role: 'controlador', career_status: 'ativo' },
    { id: 'yp4', name: 'Jovem 4', age: 21, overall: 16, overall_rating: 16, potential: 36, preferred_side: 'right', tactical_role: 'pressionador', career_status: 'ativo' },
    { id: 'vm1', name: 'Veterano 1', age: 30, overall: 22, overall_rating: 22, potential: 24, preferred_side: 'left', tactical_role: 'finalizador', career_status: 'ativo' },
    { id: 'vm2', name: 'Veterano 2', age: 33, overall: 20, overall_rating: 20, potential: 21, preferred_side: 'right', tactical_role: 'defensor', career_status: 'ativo' },
    { id: 'normal1', name: 'Normal 1', age: 24, overall: 12, overall_rating: 12, potential: 15, career_status: 'ativo' },
  ];

  const picks = selectFirstPartnershipCandidates(player16, pool, 4);
  assert.equal(picks.length, 4, 'com pool balanceado, a vitrine deveria ter as 4 opções completas');

  const categories = picks.map((item) => item.category);
  const youngCount = categories.filter((c) => c === FIRST_PARTNERSHIP_CATEGORY.YOUNG_PROJECT).length;
  const veteranCount = categories.filter((c) => c === FIRST_PARTNERSHIP_CATEGORY.VETERAN_MENTOR).length;
  assert.ok(youngCount >= 2, `esperava ao menos 2 jovens projeto na vitrine, obtido ${youngCount}`);
  assert.ok(veteranCount >= 1, `esperava ao menos 1 veterano mentor na vitrine (pool permite), obtido ${veteranCount}`);
  assert.ok(!categories.every((c) => c === FIRST_PARTNERSHIP_CATEGORY.POOR_FIRST_PARTNER), 'nunca todos POOR_FIRST_PARTNER');

  // Nunca 4 perfis "quase idênticos": ids únicos e não são todos a mesma idade.
  const ids = picks.map((item) => item.candidate.id);
  assert.equal(new Set(ids).size, 4, 'os 4 candidatos escolhidos precisam ser distintos');
  const ages = picks.map((item) => item.candidate.age);
  assert.ok(new Set(ages).size > 1, 'os 4 candidatos não podem ter todos a mesma idade (falta de diversidade)');

  console.log('test-first-partnership-diversity: PASS');
} finally {
  await vite.close();
}
