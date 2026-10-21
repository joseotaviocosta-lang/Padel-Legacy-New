import { localGame } from '@/api/localGameClient.js';
import { ensureTutorialMissionCatalog } from '@/lib/padel.js';
import { ensureWorldClubCatalog } from '@/lib/sportsEconomyV26.js';
import { seedMarket } from '@/lib/marketEngine.js';
import { ensureExpandedShopCatalog } from '@/lib/storeCatalog.js';
import { ensureInitialPartnerOffers, isReadyForInitialPartnerOffers } from '@/lib/partnerOffers.js';
import { ensureCoachMarketInitialized } from './coachLifecycle.js';
import { ensurePreSeasonExhibition } from '@/lib/career.js';

// LOCAL-8F — INICIALIZAÇÃO dos sistemas da carreira (ciclo de vida).
//
// Regra da fase: abrir uma tela não é o mecanismo que faz o mundo existir
// ou evoluir. Os catálogos abaixo eram criados na 1ª visita a cada tela
// (Objetivos, Clubes, Treinadores, Loja, Duplas), então o estado da carreira
// — e o avanço do dia seguinte — dependia de por onde o jogador tinha
// navegado. Agora todos nascem na ATIVAÇÃO da carreira
// (SaveFoundationBootstrap), de forma idempotente: numa carreira já
// inicializada, cada etapa é só leitura.
//
// Etapas independentes: a falha de uma não impede as outras (cada uma é
// reexecutada na próxima ativação).
const STEPS = [
  ['missions', () => ensureTutorialMissionCatalog()],
  // LOCAL-8G.1: a Pré-Temporada (única, 1ª temporada) existe antes de o
  // jogador abrir Torneios — a tela continua somente leitura.
  ['preSeason', (profile) => ensurePreSeasonExhibition(profile?.career_date || null)],
  ['clubs', () => ensureWorldClubCatalog(72)],
  ['coaches', (_profile, careerId) => ensureCoachMarketInitialized(careerId || null)],
  ['shop', async (profile) => { await seedMarket(profile?.career_date || null); await ensureExpandedShopCatalog(); }],
  ['partnerOffers', (profile) => (isReadyForInitialPartnerOffers(profile) ? ensureInitialPartnerOffers(profile) : null)],
];

const inFlight = new Map();

export async function ensureCareerSystemsInitialized({ careerId = null } = {}) {
  const key = careerId || 'active';
  if (inFlight.has(key)) return inFlight.get(key);
  const operation = (async () => {
    const profile = (await localGame.entities.PlayerProfile.list('-created_date', 1).catch(() => []))?.[0] || null;
    const results = {};
    for (const [name, run] of STEPS) {
      try {
        await run(profile, careerId);
        results[name] = 'ok';
      } catch (error) {
        results[name] = `erro: ${error?.message || error}`;
        console.warn(`[Inicialização da carreira] ${name}:`, error);
      }
    }
    return results;
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, operation);
  return operation;
}
