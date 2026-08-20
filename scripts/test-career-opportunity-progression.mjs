// Fase 13 (docs/FASE_13_CAREER_DEPTH.md, Parte 5/17).
//
// "Auditar Treinadores/Patrocínios/Duplas/Torneios — subir no ranking deve
// melhorar oportunidades. Não alterar balanceamento sem necessidade."
//
// Auditoria (sem mudança de lógica — os 4 sistemas já respondem à
// progressão, cada um com sua própria fonte real):
// - Treinadores: buildCoachMarket usa getCareerEconomyStage pra limitar
//   QUANTOS treinadores aparecem (COACH_MARKET_STAGE_LIMITS, coaches.js) e
//   getCoachAvailability usa profile.level (demands.min_level) pra decidir
//   QUAIS ficam disponíveis.
// - Patrocínios: getMonthlySponsorMarket (sportsEconomyV26.js) usa a MESMA
//   getCareerEconomyStage pra limitar tier máximo (STAGE_MARKET_LIMITS).
// - Duplas: getAvailablePartners (career.js) libera tiers de bot conforme
//   profile.xp/level sobe (BOT_DIFFICULTIES) — correlacionado com rank já
//   que level e rank sobem juntos como consequência do mesmo jogo.
// - Torneios: evaluateTournamentEntry (EntryManager.js) já gateia
//   diretamente por ranking (min_ranking do torneio vs rank do atleta).
//
// Este teste PROVA essas 4 conexões com o pipeline real — nenhuma mudança
// de balanceamento, só evidência de que a seta "subir → mais oportunidade"
// já existe nos 4 sistemas (Parte 1 do briefing).
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });

try {
  // ── 1) Treinadores: mercado cresce com o estágio de carreira ────────────────
  const { buildCoachMarket } = await server.ssrLoadModule('/src/lib/coaches.js');
  const coachCatalog = [
    { id: 'c-iniciante', tier: 'iniciante', overall: 50, reputation: 50, monthly_cost: 500, demands: { min_level: 'Iniciante' } },
    { id: 'c-amador', tier: 'amador', overall: 60, reputation: 60, monthly_cost: 900, demands: { min_level: 'Amador' } },
    { id: 'c-competitivo', tier: 'competitivo', overall: 70, reputation: 70, monthly_cost: 1500, demands: { min_level: 'Competitivo' } },
    { id: 'c-avancado', tier: 'avancado', overall: 80, reputation: 80, monthly_cost: 2500, demands: { min_level: 'Avançado' } },
    { id: 'c-elite', tier: 'elite', overall: 92, reputation: 92, monthly_cost: 5000, demands: { min_level: 'Elite' } },
  ];
  const beginnerProfile = { id: 'p-op', level: 'Iniciante', xp: 0, coins: 999999, career_level: 1, ranking_position: 2000, reputation: 0 };
  const eliteProfile = { id: 'p-op', level: 'Elite', xp: 30000, coins: 999999, career_level: 38, ranking_position: 15, reputation: 70 };
  const beginnerMarket = buildCoachMarket(coachCatalog, beginnerProfile);
  const eliteMarket = buildCoachMarket(coachCatalog, eliteProfile);
  gate('Mercado de treinadores: cap de vagas cresce do estágio "beginner" para "elite" (COACH_MARKET_STAGE_LIMITS)', eliteMarket.cap > beginnerMarket.cap);
  gate('Mercado de treinadores: treinador tier "elite" (min_level Elite) fica bloqueado pro atleta iniciante', beginnerMarket.locked.some((i) => i.coach.id === 'c-elite'));
  gate('Mercado de treinadores: treinador tier "elite" fica disponível (curated) só quando o atleta já é nível Elite', eliteMarket.curated.some((i) => i.coach.id === 'c-elite'));
  gate('Mercado de treinadores: treinador tier "iniciante" continua disponível mesmo em estágio elite (nunca desaparece com a progressão)', eliteMarket.curated.some((i) => i.coach.id === 'c-iniciante'));

  // ── 2) Patrocínios: mercado gated por estágio (STAGE_MARKET_LIMITS) ─────────
  const { getMonthlySponsorMarket, getCareerEconomyStage } = await server.ssrLoadModule('/src/lib/sportsEconomyV26.js');
  const sponsorCatalog = [
    { id: 's-bronze', tier: 'Bronze', base_monthly_value: 100, base_sign_bonus: 200 },
    { id: 's-prata', tier: 'Prata', base_monthly_value: 500, base_sign_bonus: 1000 },
    { id: 's-ouro', tier: 'Ouro', base_monthly_value: 2000, base_sign_bonus: 4000 },
  ];
  const beginnerSponsors = getMonthlySponsorMarket(beginnerProfile, sponsorCatalog);
  const eliteSponsors = getMonthlySponsorMarket(eliteProfile, sponsorCatalog);
  gate('Mercado de patrocínio: perfil "beginner" nunca vê patrocinador tier Ouro (STAGE_MARKET_LIMITS.maxTierRank)', !beginnerSponsors.sponsors.some((s) => s.tier === 'Ouro'));
  gate('Mercado de patrocínio: perfil "elite" tem acesso a patrocinador tier Ouro', eliteSponsors.sponsors.some((s) => s.tier === 'Ouro'));
  gate('getCareerEconomyStage concorda entre os dois perfis de fixture (beginner/elite, mesma fonte que treinadores)', getCareerEconomyStage(beginnerProfile) === 'beginner' && getCareerEconomyStage(eliteProfile) === 'elite');

  // ── 3) Duplas: tiers de parceiro liberam conforme XP/nível sobe ─────────────
  const { getAvailablePartners, getLockedPartners } = await server.ssrLoadModule('/src/lib/career.js');
  const partnerProfileLow = { court_side: 'right', xp: 0 };
  const partnerProfileHigh = { court_side: 'right', xp: 50000 };
  const availableLow = getAvailablePartners(partnerProfileLow);
  const availableHigh = getAvailablePartners(partnerProfileHigh);
  const lockedLow = getLockedPartners(partnerProfileLow);
  gate('Duplas: o pool de parceiros disponíveis cresce conforme XP/nível sobe (mais tiers de bot liberados)', availableHigh.length > availableLow.length);
  gate('Duplas: existem parceiros ainda bloqueados no início da carreira (progressão real, não tudo liberado de cara)', lockedLow.length > 0);
  gate('Duplas: sem court_side definido, nenhum parceiro é oferecido (dado obrigatório do perfil)', getAvailablePartners({ xp: 50000 }).length === 0);

  // ── 4) Torneios: elegibilidade já gateada por ranking real ──────────────────
  const { evaluateTournamentEntry } = await server.ssrLoadModule('/src/gameplay/worldTour/EntryManager.js');
  const majorTournament = { tier: 'Elite', min_ranking: 50, qualifying_size: 32, country: 'BR' };
  const lowRankAthlete = { rank: 900 };
  const highRankAthlete = { rank: 30 };
  const lowResult = evaluateTournamentEntry(majorTournament, lowRankAthlete);
  const highResult = evaluateTournamentEntry(majorTournament, highRankAthlete);
  gate('Torneios: atleta com rank alto (#30, dentro do min_ranking) entra direto na chave principal', highResult.eligible && highResult.path === 'direct');
  gate('Torneios: atleta com rank ruim (#900) e sem wildcard/exempt fica inelegível ou restrito a qualifying (nunca chave principal de graça)', lowResult.path !== 'direct');

  console.log(`\n${gates} gates executados, todos PASS — Progressão de oportunidades (Fase 13, Parte 5): treinadores/patrocínios/duplas/torneios já respondem ao avanço de carreira, sem rebalanceamento.`);
} finally {
  await server.close();
}
