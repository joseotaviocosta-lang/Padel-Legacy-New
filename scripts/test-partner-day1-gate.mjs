import assert from 'node:assert/strict';

// Hotfix — "nenhum parceiro disponível no início de carreira nova"
// (calculatePartnershipInterest zerava 65% do peso da fórmula pra
// reputation=0/ranking_position ausente, achado no dia 1 de carreira real
// criada por `ensureMyProfile`, src/lib/padel.js). Cobre exatamente o
// cenário do bug reportado + as regressões que a correção (`noviceEase`,
// src/players/teamCompatibility.js) não pode reabrir: fricção elite
// intacta e progressão ao longo da carreira continuando gradual.
const { createServer } = await import('vite');
const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const { calculatePartnershipInterest, PARTNERSHIP_INTEREST_THRESHOLDS } = await vite.ssrLoadModule('/src/players/teamCompatibility.js');
  const { getAvailablePartners } = await vite.ssrLoadModule('/src/lib/career.js');

  // Perfil exatamente como `ensureMyProfile` cria uma carreira nova —
  // reputation/ranking_position nunca são setados ali (ficam undefined).
  const day1Profile = {
    id: 'test-day1', sport_name: 'Novo Atleta', country: 'Brasil', level: 'Iniciante', career_level: 1, xp: 0,
    coins: 100, career_date: '2026-01-01', birth_date: '2010-01-01',
    serve: 10, forehand: 10, backhand: 10, volley: 10, bandeja: 10, smash: 10,
    defense: 10, agility: 10, strategy: 10, emotional_control: 10,
    court_side: 'direita', play_style: 'Equilibrado', partner_chemistry: 50,
  };

  // 1. Jogador novo consegue parceiro no dia 1 — o cenário do bug.
  const available = getAvailablePartners(day1Profile);
  assert.ok(available.length > 0, 'jogador de dia 1 deveria ter pelo menos um candidato de dupla disponível (Iniciante, OVR 1-24)');
  assert.ok(available.every(bot => Number(bot.overall_rating ?? bot.overall) <= 24), 'no dia 1 só o tier Iniciante deveria estar no pool (getAvailablePartners já filtra por XP)');

  const weakBot = { id: 'weak', name: 'Bot fraco', overall: 20, overall_rating: 20, level: 'Iniciante', preferred_side: 'left', tactical_role: 'coringa' };
  const weakInterest = calculatePartnershipInterest(day1Profile, weakBot);
  assert.ok(weakInterest.available, 'bot Iniciante (OVR 20) deveria estar disponível pra um jogador de dia 1, sem espera artificial');
  assert.equal(weakInterest.friction, false, 'bot claramente fraco não deveria exigir "condições mais exigentes" de um jogador novo');

  // 2. Regressão — elite (real ou bot forte) continua com a fricção correta.
  const eliteReal = { id: 'elite-real', name: 'Real de elite', overall: 96, overall_rating: 96, world_rank: 1, level: 'Lenda', preferred_side: 'left', tactical_role: 'finalizador' };
  const eliteInterest = calculatePartnershipInterest(day1Profile, eliteReal);
  assert.equal(eliteInterest.available, false, 'real de elite não deveria ficar disponível pra um jogador de dia 1 (achado #31/#32 da Fase 5.1 não pode reabrir)');
  assert.ok(eliteInterest.score < PARTNERSHIP_INTEREST_THRESHOLDS.low, 'score de um real de elite contra dia 1 deveria continuar bem abaixo do limiar "low"');

  const eliteBot = { id: 'elite-bot', name: 'Bot Lenda', overall: 90, overall_rating: 90, level: 'Lenda', preferred_side: 'left', tactical_role: 'finalizador' };
  const eliteBotInterest = calculatePartnershipInterest(day1Profile, eliteBot);
  assert.equal(eliteBotInterest.available, false, 'bot Lenda (OVR 90) não deveria ficar disponível pra um jogador de dia 1');

  // 3. Progressão — reputação/ranking crescentes continuam abrindo a lista gradualmente.
  const midCareerProfile = { ...day1Profile, reputation: 50, ranking_position: 200 };
  const midEliteInterest = calculatePartnershipInterest(midCareerProfile, eliteReal);
  assert.ok(midEliteInterest.score > eliteInterest.score, 'interesse de um real de elite deveria subir conforme reputação/ranking do jogador melhoram');

  const weakVsMid = calculatePartnershipInterest(midCareerProfile, weakBot);
  assert.ok(weakVsMid.score >= weakInterest.score, 'bot fraco não deveria ficar mais difícil conforme o jogador progride');

  console.log('partner-day1-gate: jogador de dia 1 tem parceiro disponível; elite continua gated; progressão intacta — OK');
} finally {
  await vite.close();
}
