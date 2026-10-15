// Playthrough 4.8, Parte N — casos obrigatórios 2 e 3 (candidatos jovens
// projeto). Perfil de contexto: exatamente o "day1Profile" canônico já
// usado por test-partner-day1-gate.mjs (ensureMyProfile real: 16 anos,
// Iniciante, OVR baixo) — não inventa um novo fixture pra carreira nova.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { classifyFirstPartnershipCandidate, buildFirstPartnershipCandidateScore, FIRST_PARTNERSHIP_CATEGORY } = await vite.ssrLoadModule('/src/lib/firstPartnershipScoring.js');

  const player16 = {
    id: 'test-day1', sport_name: 'Novo Atleta', country: 'Brasil', level: 'Iniciante', career_level: 1, xp: 0,
    coins: 100, career_date: '2026-01-01', birth_date: '2010-01-01',
    serve: 10, forehand: 10, backhand: 10, volley: 10, bandeja: 10, smash: 10,
    defense: 10, agility: 10, strategy: 10, emotional_control: 10,
    court_side: 'direita', play_style: 'Equilibrado', partner_chemistry: 50,
  };

  // Caso 2: candidato 18 anos, OVR 8, potencial alto -> elegível (jovem projeto).
  const case2 = { id: 'case2', name: 'Caso 2', age: 18, overall: 8, overall_rating: 8, potential: 32, level: 'Iniciante', preferred_side: 'left', tactical_role: 'coringa', career_status: 'ativo' };
  assert.equal(classifyFirstPartnershipCandidate(case2), FIRST_PARTNERSHIP_CATEGORY.YOUNG_PROJECT, 'caso 2 (18a/OVR8/potencial alto) deveria classificar como YOUNG_PROJECT');
  const scored2 = buildFirstPartnershipCandidateScore(player16, case2);
  assert.ok(scored2.score > 0, 'caso 2 deveria ter score positivo (elegível, sem penalidade)');

  // Caso 3: candidato 20 anos, OVR 10, potencial médio-alto -> elegível (jovem projeto).
  const case3 = { id: 'case3', name: 'Caso 3', age: 20, overall: 10, overall_rating: 10, potential: 22, level: 'Iniciante', preferred_side: 'right', tactical_role: 'coringa', career_status: 'ativo' };
  assert.equal(classifyFirstPartnershipCandidate(case3), FIRST_PARTNERSHIP_CATEGORY.YOUNG_PROJECT, 'caso 3 (20a/OVR10/potencial médio-alto) deveria classificar como YOUNG_PROJECT');
  const scored3 = buildFirstPartnershipCandidateScore(player16, case3);
  assert.ok(scored3.score > 0, 'caso 3 deveria ter score positivo (elegível, sem penalidade)');

  // Regressão de desenho: jovem (idade <=22) mas sem OVR nem potencial
  // relevante (OVR muito baixo, sem gap de potencial) não deveria ganhar o
  // rótulo YOUNG_PROJECT só por ser jovem -- cai em NORMAL.
  const flatYoung = { id: 'flat-young', name: 'Jovem Neutro', age: 19, overall: 5, overall_rating: 5, potential: 6, career_status: 'ativo' };
  assert.equal(classifyFirstPartnershipCandidate(flatYoung), FIRST_PARTNERSHIP_CATEGORY.NORMAL, 'jovem sem potencial nem OVR relevante não deveria virar YOUNG_PROJECT automaticamente só pela idade');

  console.log('test-first-partnership-young-projects: PASS');
} finally {
  await vite.close();
}
