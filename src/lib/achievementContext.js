// Fase 12 (docs/ACHIEVEMENTS_2_0.md, Parte C): um único ponto que busca todo
// dado assíncrono que o motor de conquistas precisa, uma vez por chamada de
// sync — nunca um `if` espalhado por componente, nunca uma consulta por
// conquista avaliada. Mesmo formato que `context.worldRank` já usava antes
// desta fase, só que reunido num só lugar.
import { localGame } from '@/api/localGameClient.js';
import { resolveActiveCoach } from '@/game-core/coachLifecycle.js';
import { calculateAffinity } from '@/lib/coaches.js';

// Partida OFICIAL de torneio (Parte C/6/7): a raiz do bug corrigido no
// Tutorial 4.0 — profile.matches_played/wins só contam treino
// (game-core/progression.js). A fonte real e já persistida é a própria
// linha de Match criada na finalização oficial (TournamentModal.jsx):
// competition_type:'tournament', is_official:true, result:'vitória'|
// 'derrota'. Computado sob demanda — nenhum contador novo persistido.
async function fetchOfficialMatchStats(profileId) {
  const matches = await localGame.entities.Match.filter({ profile_id: profileId, competition_type: 'tournament', is_official: true }).catch(() => []);
  const played = matches.length;
  const won = matches.filter((m) => m.result === 'vitória').length;
  const lost = matches.filter((m) => m.result === 'derrota').length;
  // opponent_rank só existe em partidas registradas depois da Fase 12
  // (Parte C — novo campo ao lado da própria escrita de Match em
  // TournamentModal.jsx); partidas antigas simplesmente não contam aqui,
  // sem quebrar nada.
  const beatTop10 = matches.some((m) => m.result === 'vitória' && Number(m.opponent_rank) > 0 && Number(m.opponent_rank) <= 10);
  const beatRank1 = matches.some((m) => m.result === 'vitória' && Number(m.opponent_rank) === 1);
  return { played, won, lost, beatTop10, beatRank1 };
}

// Ganhos de carreira (Parte 19/E): NUNCA profile.coins (saldo — sobe e
// desce). Fonte real: soma das FinancialTransaction já persistidas com
// type:'income' (prêmios de torneio, patrocínio, bônus de temporada —
// já escritas em vários pontos reais: tournamentLifecycle.js,
// seasonLifecycle.js, partnerLifecycle.js, etc.).
async function fetchCareerEarnings(profileId) {
  const transactions = await localGame.entities.FinancialTransaction.filter({ profile_id: profileId, type: 'income' }).catch(() => []);
  return transactions.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
}

async function fetchInventoryStats(profileId) {
  const [inventory, shopItems] = await Promise.all([
    localGame.entities.PlayerInventory.filter({ profile_id: profileId }).catch(() => []),
    localGame.entities.ShopItem.list().catch(() => []),
  ]);
  const itemById = new Map(shopItems.map((item) => [item.id, item]));
  const owned = inventory.filter((row) => Number(row.quantity) > 0);
  const categories = new Set();
  const rarities = new Set();
  let legendary = 0;
  let mythic = 0;
  let exclusive = 0;
  for (const row of owned) {
    const item = itemById.get(row.item_id);
    if (!item) continue;
    if (item.category) categories.add(item.category);
    if (item.rarity) rarities.add(item.rarity);
    if (item.rarity === 'lendario' || item.rarity === 'lendário') legendary += 1;
    if (item.rarity === 'mitico' || item.rarity === 'mítico') mythic += 1;
    if (item.is_exclusive) exclusive += 1;
  }
  const totalCategoriesInCatalog = new Set(shopItems.map((item) => item.category).filter(Boolean)).size;
  return { totalOwned: owned.length, categories: categories.size, rarities: rarities.size, legendary, mythic, exclusive, totalCategoriesInCatalog };
}

async function fetchTrainingCenter(profileId) {
  const rows = await localGame.entities.TrainingCenter.filter({ profile_id: profileId }).catch(() => []);
  return rows[0] || null;
}

async function fetchSponsorContracts(profileId) {
  const rows = await localGame.entities.PlayerContract.filter({ profile_id: profileId, is_active: true }).catch(() => []);
  return { active: rows.length };
}

async function fetchPropertyCount(profileId) {
  const rows = await localGame.entities.PlayerProperty.filter({ profile_id: profileId }).catch(() => []);
  return rows.length;
}

async function fetchInvestmentCount(profileId) {
  const rows = await localGame.entities.PlayerInvestment.filter({ profile_id: profileId }).catch(() => []);
  return rows.length;
}

async function fetchCoachContext(profile) {
  const { coach } = await resolveActiveCoach(profile).catch(() => ({ coach: null }));
  if (!coach) return { coach: null, affinity: 0 };
  return { coach, affinity: calculateAffinity(coach, profile) };
}

/**
 * Monta todo o `context` assíncrono que o motor de conquistas precisa, numa
 * única chamada. Chamado ao lado de syncPlayerAchievements — nunca dentro
 * de Match Engine/calendário/ranking.
 */
export async function buildAchievementContext(profile, { worldRank = null } = {}) {
  if (!profile?.id) return { worldRank };
  const [officialMatches, careerEarnings, inventory, trainingCenter, sponsorContracts, coachContext, propertyCount, investmentCount] = await Promise.all([
    fetchOfficialMatchStats(profile.id),
    fetchCareerEarnings(profile.id),
    fetchInventoryStats(profile.id),
    fetchTrainingCenter(profile.id),
    fetchSponsorContracts(profile.id),
    fetchCoachContext(profile),
    fetchPropertyCount(profile.id),
    fetchInvestmentCount(profile.id),
  ]);
  return {
    worldRank, officialMatches, careerEarnings, inventory, trainingCenter, sponsorContracts,
    coach: coachContext.coach, coachAffinity: coachContext.affinity, propertyCount, investmentCount,
  };
}
