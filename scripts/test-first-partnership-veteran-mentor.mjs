// Playthrough 4.8, Parte N — caso obrigatório 4 (veterano mentor) +
// regressão: idade sozinha NUNCA deve bastar pra virar "mentor" (essa era
// exatamente a falha original -- Nuno Fernandes, 36 anos, OVR 8).
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { classifyFirstPartnershipCandidate, buildFirstPartnershipCandidateScore, firstPartnershipReasonText, FIRST_PARTNERSHIP_CATEGORY } = await vite.ssrLoadModule('/src/lib/firstPartnershipScoring.js');

  const player16 = {
    id: 'test-day1', sport_name: 'Novo Atleta', country: 'Brasil', level: 'Iniciante', career_level: 1, xp: 0,
    coins: 100, career_date: '2026-01-01', birth_date: '2010-01-01',
    serve: 10, forehand: 10, backhand: 10, volley: 10, bandeja: 10, smash: 10,
    defense: 10, agility: 10, strategy: 10, emotional_control: 10,
    court_side: 'direita', play_style: 'Equilibrado', partner_chemistry: 50,
  };

  // Caso 4: candidato 31 anos, OVR 45, experiência alta -> elegível como mentor.
  const case4 = { id: 'case4', name: 'Caso 4', age: 31, overall: 45, overall_rating: 45, potential: 46, level: 'Competitivo', preferred_side: 'left', tactical_role: 'finalizador', career_status: 'ativo' };
  assert.equal(classifyFirstPartnershipCandidate(case4), FIRST_PARTNERSHIP_CATEGORY.VETERAN_MENTOR, 'caso 4 (31a/OVR45/experiência alta) deveria classificar como VETERAN_MENTOR');
  const scored4 = buildFirstPartnershipCandidateScore(player16, case4);
  assert.ok(scored4.score > 0, 'veterano mentor legítimo deveria ter score positivo (bônus de categoria, não penalidade)');
  const reason4 = firstPartnershipReasonText(FIRST_PARTNERSHIP_CATEGORY.VETERAN_MENTOR);
  assert.ok(reason4.title && reason4.body, 'texto de justificativa do mentor precisa existir e não ser genérico');
  assert.ok(reason4.body.toLowerCase().includes('experiência') || reason4.body.toLowerCase().includes('tática'), 'texto do mentor deveria mencionar experiência/leitura tática, não ser genérico');

  // Regressão do bug original: idade alta sozinha (OVR baixo demais pra
  // justificar "mentor") NUNCA pode virar VETERAN_MENTOR.
  const oldButWeak = { id: 'old-weak', name: 'Nuno Fernandes', age: 36, overall: 8, overall_rating: 8, career_status: 'ativo' };
  assert.notEqual(classifyFirstPartnershipCandidate(oldButWeak), FIRST_PARTNERSHIP_CATEGORY.VETERAN_MENTOR, 'idade alta com OVR muito baixo nunca deveria virar VETERAN_MENTOR (bug original)');

  console.log('test-first-partnership-veteran-mentor: PASS');
} finally {
  await vite.close();
}
