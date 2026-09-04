// Fase 2.9, item 2/3/4 (achado #21) — escopo de PartnershipLegacy na
// dissolução BOT-BOT (aiPartnershipLifecycle.js), fora do caminho do
// jogador já coberto por test-career-partnership-history.mjs.
//
// Prova:
//   1. Dissolução bot-bot (nenhum dos dois é is_real): NÃO grava
//      PartnershipLegacy (item 2 — ~150 dissoluções/ano, ninguém lê esse
//      histórico, entraria no caminho quente do achado #18 sem necessidade).
//   2. Dissolução envolvendo um atleta real (is_real:true): grava
//      PartnershipLegacy (extensão opcional do item 2, margem narrativa
//      pra Fase 9).
//   3. TeamRanking da dupla é apagado em AMBOS os casos (item 4 — decisão
//      de comportamento uniforme, não depende de is_real).
//   4. A Partnership em si NUNCA é apagada na hora da dissolução (item 3 —
//      só marcada), em nenhum dos dois casos — a exclusão real é da poda
//      com carência (worldSimulationLifecycle.js), testada à parte abaixo.
//   5. pruneOldDissolvedPartnerships: NÃO remove uma dissolução recente
//      (dentro da carência de 24 meses), remove uma antiga.
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

function createMemoryStorage() {
  const files = new Map();
  return {
    isSupported: () => true, async initialize() {}, async ensureDirectory() { return true; },
    async writeText(p, c) { files.set(p, String(c)); },
    async readText(p) { if (!files.has(p)) { const e = new Error('no'); e.code = 'FILE_NOT_FOUND'; throw e; } return files.get(p); },
    async exists(p) { return files.has(p); }, async remove(p) { return files.delete(p); },
    async copy(s, d) { files.set(d, files.get(s)); return d; }, async rename(s, d) { files.set(d, files.get(s)); files.delete(s); return d; },
    async list() { return [...files.keys()]; }, async stat() { return { size: 0 }; }, getDataDirectoryDescription: () => 'memory',
  };
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { localGame } = await server.ssrLoadModule('/src/api/localGameClient.js');
  const { GameStorage } = await server.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await server.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await server.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await server.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { processAiPartnershipMarket } = await server.ssrLoadModule('/src/game-core/aiPartnershipLifecycle.js');
  const { simulateWorldDay } = await server.ssrLoadModule('/src/game-core/worldSimulationLifecycle.js');
  const { teamKey } = await server.ssrLoadModule('/src/lib/teamRanking.js');

  const careerManager = new CareerManager(new CareerRepository(new GameStorage(createMemoryStorage())));
  await careerManager.createCareer({ id: 'career-legacy-scope', name: 'QA Legacy Scope' });
  activeCareerAdapter.careerManager = careerManager;
  await activeCareerAdapter.getActiveCareer();

  async function makeAthlete(id, { isReal = false, retired = false, partnerId, name }) {
    return localGame.entities.AthleteProfile.create({
      id, name, ranking_position: 100, overall_rating: 65, form: 60, current_form: 60,
      is_real: isReal, retired,
      ai_partner_id: partnerId, ai_partner_name: null,
      ai_partnership_status: 'ativa', ai_partnership_start_date: '2025-01-01',
      ai_partnership_chemistry: 60, ai_partnership_protected: false,
      partnership_history_count: 0,
    });
  }

  async function makeCanonicalPartnership(id, athleteA, athleteB) {
    return localGame.entities.Partnership.create({
      id, partnership_type: 'npc', scope: 'world',
      athlete_a_id: athleteA, athlete_b_id: athleteB, athlete_ids: [athleteA, athleteB],
      athlete_a_name: athleteA, athlete_b_name: athleteB, partner_name: athleteB,
      started_career_date: '2025-01-01', scheduled_end_date: '2025-06-01', contract_end_date: '2025-06-01',
      contract_status: 'ativo', status: 'ativa', chemistry: 60, shared_matches: 10, shared_wins: 6,
      origin: 'world-partner-market',
    });
  }

  // ── Cenário 1: bot-bot (nenhum is_real) — retirementEnd força dissolução
  // determinística (sem depender do sorteio de seededChance). ─────────────
  await makeAthlete('bot-a1', { isReal: false, retired: true, partnerId: 'bot-b1', name: 'Bot A1' });
  await makeAthlete('bot-b1', { isReal: false, partnerId: 'bot-a1', name: 'Bot B1' });
  await makeCanonicalPartnership('partnership-ab', 'bot-a1', 'bot-b1');
  await localGame.entities.TeamRanking.create({ team_key: teamKey('bot-a1', 'bot-b1'), player1_id: 'bot-a1', player2_id: 'bot-b1', player1_name: 'Bot A1', player2_name: 'Bot B1', ranking_points: 300, titles: [] });

  const result1 = await processAiPartnershipMarket({ id: null }, '2025-01-15', '2025-02-15');
  gate('cenário 1 (bot-bot): a dissolução realmente aconteceu (dissolved >= 1)', result1.dissolved >= 1);
  const partnershipAfter1 = await localGame.entities.Partnership.get('partnership-ab');
  gate('item 3: Partnership bot-bot NÃO é apagada na hora — só marcada (status !== ativa, linha ainda existe)', partnershipAfter1 && partnershipAfter1.status !== 'ativa');
  const legacyForBotBot = await localGame.entities.PartnershipLegacy.filter({ original_partnership_id: 'partnership-ab' });
  gate('item 2: dissolução bot-bot NÃO grava PartnershipLegacy (nenhum dos dois é is_real)', legacyForBotBot.length === 0);
  const teamRankingAfter1 = await localGame.entities.TeamRanking.filter({ team_key: teamKey('bot-a1', 'bot-b1') });
  gate('item 4: TeamRanking da dupla bot-bot é apagado mesmo sem legado (decisão uniforme)', teamRankingAfter1.length === 0);

  // ── Cenário 2: um dos dois é is_real — deve gravar PartnershipLegacy ────
  await makeAthlete('real-a2', { isReal: true, retired: true, partnerId: 'bot-b2', name: 'Atleta Real A2' });
  await makeAthlete('bot-b2', { isReal: false, partnerId: 'real-a2', name: 'Bot B2' });
  await makeCanonicalPartnership('partnership-ab2', 'real-a2', 'bot-b2');
  await localGame.entities.TeamRanking.create({ team_key: teamKey('real-a2', 'bot-b2'), player1_id: 'real-a2', player2_id: 'bot-b2', player1_name: 'Atleta Real A2', player2_name: 'Bot B2', ranking_points: 500, titles: [] });

  const result2 = await processAiPartnershipMarket({ id: null }, '2025-02-15', '2025-03-15');
  gate('cenário 2 (envolve atleta real): a dissolução aconteceu', result2.dissolved >= 1);
  const legacyForReal = await localGame.entities.PartnershipLegacy.filter({ original_partnership_id: 'partnership-ab2' });
  gate('item 2 (extensão narrativa): dissolução envolvendo atleta real GRAVA PartnershipLegacy', legacyForReal.length === 1 && (legacyForReal[0].athlete_a_name === 'real-a2' || legacyForReal[0].athlete_b_name === 'bot-b2'));
  const teamRankingAfter2 = await localGame.entities.TeamRanking.filter({ team_key: teamKey('real-a2', 'bot-b2') });
  gate('item 4: TeamRanking da dupla com atleta real também é apagado', teamRankingAfter2.length === 0);
  const partnershipAfter2 = await localGame.entities.Partnership.get('partnership-ab2');
  gate('item 3: Partnership com atleta real também NÃO é apagada na hora — só marcada', partnershipAfter2 && partnershipAfter2.status !== 'ativa');

  // ── pruneOldDissolvedPartnerships: carência de 24 meses ─────────────────
  await localGame.entities.Partnership.update('partnership-ab', { ended_career_date: '2023-01-01' }); // > 24 meses antes de 2025-06-01
  await localGame.entities.Partnership.update('partnership-ab2', { ended_career_date: '2025-05-01' }); // recente, dentro da carência

  const profileForPrune = await localGame.entities.PlayerProfile.create({ id: 'qa-prune-profile', sport_name: 'QA Prune', career_date: '2025-05-01', coins: 1000 });
  await simulateWorldDay(profileForPrune, '2025-05-01', '2025-06-01'); // virada de mês — dispara pruneOldDissolvedPartnerships

  const oldStillThere = await localGame.entities.Partnership.get('partnership-ab').catch(() => null);
  gate('poda com carência: dissolução de 2023 (> 24 meses) É removida', !oldStillThere);
  const recentStillThere = await localGame.entities.Partnership.get('partnership-ab2').catch(() => null);
  gate('poda com carência: dissolução de 2025-05 (dentro dos 24 meses) NÃO é removida ainda', Boolean(recentStillThere));
  // A linha de legado da dupla removida continua existindo — histórico
  // (pra quem tinha legado) sobrevive à poda da linha viva, de propósito.
  const legacyStillThere = await localGame.entities.PartnershipLegacy.filter({ original_partnership_id: 'partnership-ab2' });
  gate('a poda da Partnership viva não afeta o PartnershipLegacy já gravado (histórico sobrevive)', legacyStillThere.length === 1);

  console.log(`\n${gates} gates executados, todos PASS — Fase 2.9, item 2/3/4: escopo de PartnershipLegacy (só jogador/atleta real), TeamRanking apagado uniformemente, Partnership nunca apagada na hora, poda com carência de 24 meses funciona.`);
} finally {
  await server.close();
}
