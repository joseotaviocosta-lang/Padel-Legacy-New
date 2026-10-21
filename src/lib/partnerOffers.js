import { localGame } from '@/api/localGameClient.js';
import { formPartnerContract } from '@/game-core/partnerLifecycle.js';
export { partnerOfferId, compatibilityLabel, buildInitialPartnerOffers, validatePartnerOfferAcceptance } from './partnerOfferRules.js';
import { partnerOfferId, buildInitialPartnerOffers, buildFirstPartnershipOffers, validatePartnerOfferAcceptance } from './partnerOfferRules.js';
import { BOTS_BY_DIFFICULTY } from './bots.js';
import { getAvailablePartners } from './career.js';
import { listRetiredPartnerOriginIds, excludeRetiredPartnerTemplates } from './partnerAthlete.js';
import { fnv1aHash } from './hashUtils.js';

export const PARTNER_OFFERS_ROUTE = '/partners?view=offers';
export const PARTNER_REJECTION_COOLDOWN_DAYS = 14;
const acceptanceLocks = new Map();
const useful = value => value !== undefined && value !== null && value !== '';

function hash(text) {
  return fnv1aHash(String(text || ''));
}
function monthKeyOf(date) { return String(date || '').slice(0, 7); }
const addDaysStr = (date, days) => { const value = new Date(`${date}T12:00:00`); value.setDate(value.getDate() + days); return value.toISOString().slice(0, 10); };


export async function listPartnerOffers(profileId) {
  return localGame.entities.PartnerOffer.filter({ profile_id: profileId }, '-created_date', 100);
}

async function createOfferMessage(profile, offer) {
  const candidate = offer.candidate_snapshot;
  const existing = await localGame.entities.CareerMessage.filter({ profile_id: profile.id, related_entity_id: offer.id }, null, 2).catch(() => []);
  if (existing.length) return existing[0];
  // Polish editorial (docs/NOTIFICATION_EDITORIAL_POLISH.md, item 21): esta é
  // a mesma "voz" de proposta de dupla usada por createProposalMessage
  // (partnershipSystem.js) — antes o corpo aqui era mais seco/burocrático.
  return localGame.entities.CareerMessage.create({
    profile_id: profile.id, message_type: 'proposta_parceria', sender_name: candidate.name,
    sender_type: 'atleta', title: `Proposta de parceria de ${candidate.name}`,
    content: `${candidate.name} quer formar dupla com você. Compare lado, nível e compatibilidade na área de Parceiros.`,
    related_entity_type: 'partner_offer', related_entity_id: offer.id, related_entity_name: candidate.name,
    status: 'decisao_pendente', priority: offer.recommended ? 'alta' : 'normal', career_date: profile.career_date,
    expires_career_date: offer.expires_career_date,
    actions: [{ id: 'view_offer', label: 'Analisar na área de Parceiros', type: 'view_partner_offer', payload: { offerId: offer.id } }],
    metadata: { offer_id: offer.id, route: `/partners?view=offers&offer=${encodeURIComponent(offer.id)}` },
    destination: { type: 'PARTNER_OFFER', route: '/partners', params: { view: 'offers', offer: offer.id } },
    is_read: false, is_new: true,
  });
}

// Bug real (QA): o lote inicial de propostas (seed da tela de Duplas) virava
// notificação — uma antes mesmo do jogador entrar na tela, e o resto do lote
// de uma vez ao interagir. O tutorial já obriga o jogador a ir a Duplas e
// comparar; notificar cada uma delas é redundante e gera "estouro" de
// AÇÃO NECESSÁRIA. `buildInitialPartnerOffers` já marca cada oferta do lote
// com `source: 'initial-partner-offer'` — usamos esse marcador já existente
// como fonte canônica de "é seed?" (nenhum campo novo/paralelo). Propostas
// dinâmicas (processSpontaneousPartnerMarket, source diferente) continuam
// notificando normalmente, uma por proposta, no momento da criação.
export function isSeedPartnerOffer(offer) {
  return offer?.source === 'initial-partner-offer';
}

// Playthrough 4.8, Parte C — a busca da PRIMEIRA parceria amplia o campo
// além do que getAvailablePartners normalmente libera (só o(s) tier(s) até
// o nível de XP do jogador — pra um jogador novo, xp=0, isso é só
// 'iniciante'). Sem isso, nenhum candidato "veterano mentor" plausível
// (OVR claramente acima do iniciante comum) jamais apareceria pra um
// atleta que ainda não jogou partida nenhuma — o próprio arquétipo pedido
// na Parte A ficaria inatingível. Escopado só a este ponto de entrada
// (nunca ensureFutureTournaments/getAvailablePartners em si, usados em
// todo o resto do jogo) — mescla só com o tier 'amador' (nunca
// competitivo+, fora do alcance narrativo de uma busca inicial), sem
// duplicar quem já veio no pool padrão.
function widenedFirstPartnershipPool(baseCandidates) {
  const seen = new Set((baseCandidates || []).map((candidate) => candidate?.id).filter(Boolean));
  const extra = (BOTS_BY_DIFFICULTY.amador || []).filter((candidate) => candidate?.id && !seen.has(candidate.id));
  return [...(baseCandidates || []), ...extra];
}

export function getRecentRejectionCooldowns(offers = [], currentDate) {
  return new Set((offers || [])
    .filter((offer) => offer?.status === 'rejected'
      && offer?.rejection_cooldown_until
      && String(offer.rejection_cooldown_until) >= String(currentDate))
    .map((offer) => offer.candidate_player_id)
    .filter(Boolean));
}

// 5.26-C, Bloco D — o catálogo não sabe quem já se aposentou. (Movido de
// PartnerHub.jsx na LOCAL-8F para que o lote inicial possa nascer fora da
// tela, no momento em que a identidade do atleta fica completa.)
export async function getFirstPartnershipCandidates(profile) {
  return excludeRetiredPartnerTemplates(getAvailablePartners(profile), await listRetiredPartnerOriginIds());
}

// LOCAL-8F (8D-05) — o lote inicial é uma INICIALIZAÇÃO de carreira, não um
// efeito de abrir Duplas. Ele nasce quando a identidade do atleta fica
// completa (lado + estilo, Missions.jsx) e, de forma idempotente, na
// ativação da carreira (SaveFoundationBootstrap). A tela só consulta.
export function isReadyForInitialPartnerOffers(profile) {
  return Boolean(profile?.id && !profile.partner_id && profile.court_side && profile.play_style);
}

/**
 * LOCAL-8F — nova leva de propostas para quem esgotou o lote inicial sem
 * formar dupla, chamada pelo tick diário (postSeparationMarket) nas janelas
 * do calendário. Mesmo pool e mesma seleção do lote inicial (o estreante não
 * é aceito pelos atletas do mundo), sem repetir candidato já proposto.
 */
export async function buildRenewedFirstPartnershipOffers(profile, excludeIds = new Set()) {
  const pool = widenedFirstPartnershipPool(await getFirstPartnershipCandidates(profile)).filter((candidate) => !excludeIds.has(candidate.id));
  return buildFirstPartnershipOffers(profile, pool);
}

const initialOfferLocks = new Map();

export async function ensureInitialPartnerOffers(profile, candidates) {
  if (!profile?.id) return [];
  // Duas chamadas simultâneas (ex.: tela + ativação) compartilham a mesma
  // operação — antes a segunda tentava criar o mesmo id e lançava erro.
  if (initialOfferLocks.has(profile.id)) return initialOfferLocks.get(profile.id);
  const operation = (async () => {
    const existing = await listPartnerOffers(profile.id).catch(() => []);
    if (profile.partner_id) return existing;
    // O lote inicial existe uma única vez por carreira. Antes, recusar todas
    // as propostas e reabrir a tela gerava um lote novo no mesmo dia, sem
    // limite. A renovação agora é do calendário: o tick diário sem dupla
    // (postSeparationMarket) abre janelas a partir da recusa do lote.
    if (existing.some((offer) => isSeedPartnerOffer(offer))) return existing;
    const activePending = existing.filter((offer) => offer?.status === 'pending' || offer?.status === 'accepted');
    if (activePending.length) return existing;
    const pool = candidates || await getFirstPartnershipCandidates(profile);
    const coolingDownIds = getRecentRejectionCooldowns(existing, profile.career_date);
    const built = buildFirstPartnershipOffers(profile, widenedFirstPartnershipPool(pool).filter((candidate) => !coolingDownIds.has(candidate.id)));
    for (const offer of built) {
      const saved = await localGame.entities.PartnerOffer.upsert(offer.id, offer);
      if (!isSeedPartnerOffer(saved)) await createOfferMessage(profile, saved);
    }
    return listPartnerOffers(profile.id);
  })().finally(() => initialOfferLocks.delete(profile.id));
  initialOfferLocks.set(profile.id, operation);
  return operation;
}

async function resolveOfferMessages(profileId, offerId, actionId) {
  const messages = await localGame.entities.CareerMessage.filter({ profile_id: profileId, related_entity_id: offerId }, null, 20).catch(() => []);
  await Promise.all(messages.map(message => localGame.entities.CareerMessage.update(message.id, { status: 'resolvida', chosen_action_id: actionId, is_new: false, actions: [] })));
}

export async function acceptPartnerOffer(profile, offer) {
  if (acceptanceLocks.has(profile.id)) return acceptanceLocks.get(profile.id);
  const operation = (async () => {
    const [freshRows, offers, active] = await Promise.all([
      localGame.entities.PartnerOffer.filter({ id: offer.id }, null, 1), listPartnerOffers(profile.id),
      localGame.entities.Partnership.filter({ profile_id: profile.id, status: 'ativa' }, null, 1),
    ]);
    const fresh = freshRows[0] || offer;
    const validation = validatePartnerOfferAcceptance(profile, fresh, offers, active[0]);
    if (!validation.ok) throw Object.assign(new Error(validation.message), { code: validation.code });
    const terms = fresh.contract || {};
    const result = await formPartnerContract(profile, fresh.candidate_snapshot, { durationDays: terms.durationDays, prizeSplit: terms.prizeSplit });
    await localGame.entities.PartnerOffer.update(fresh.id, { status: 'accepted', partnership_id: result.partnership.id, resolved_career_date: profile.career_date });
    await Promise.all((offers || []).filter(item => item.id !== fresh.id && item.status === 'pending').map(item => localGame.entities.PartnerOffer.update(item.id, { status: 'withdrawn', resolved_career_date: profile.career_date })));
    await Promise.all([resolveOfferMessages(profile.id, fresh.id, 'accept'), ...(offers || []).filter(item => item.id !== fresh.id).map(item => resolveOfferMessages(profile.id, item.id, 'withdrawn'))]);
    return result;
  })().finally(() => acceptanceLocks.delete(profile.id));
  acceptanceLocks.set(profile.id, operation);
  return operation;
}

export async function rejectPartnerOffer(profile, offer) {
  const rows = await localGame.entities.PartnerOffer.filter({ id: offer.id }, null, 1);
  const fresh = rows[0] || offer;
  if (fresh.status !== 'pending') return fresh;
  const cooldownUntil = addDaysStr(profile.career_date, PARTNER_REJECTION_COOLDOWN_DAYS);
  const updated = await localGame.entities.PartnerOffer.update(fresh.id, {
    status: 'rejected',
    resolved_career_date: profile.career_date,
    rejected_career_date: profile.career_date,
    rejection_cooldown_until: cooldownUntil,
  });
  await resolveOfferMessages(profile.id, fresh.id, 'decline');
  return updated;
}

// Fase 15 (docs/FASE_15_CIRCUITO_VIVO.md, Parte 14/15/16/45): auditoria
// confirmou que NENHUM mecanismo gerava proposta espontânea depois da
// oferta inicial — ensureInitialPartnerOffers se recusa a rodar de novo
// (guarda dupla: existing.length || profile.partner_id). Esta função é o
// gerador CONTÍNUO que faltava, gatilhado uma vez por mês (mesmo padrão
// idempotente de aiPartnershipLifecycle.js: campo no profile marca o mês
// já processado), com chance BAIXA (Parte 45: 1-4 propostas relevantes
// por TEMPORADA, não por mês) — sorteio determinístico via hash(seed),
// nunca Math.random (Parte 38). Funciona com OU sem parceiro atual: com
// parceiro, a proposta fica disponível mas nunca troca a dupla sozinha
// (validatePartnerOfferAcceptance já bloqueia aceitar com parceria ativa
// diferente — Parte 15: "receber proposta NÃO quebra a dupla atual").
const FREE_AGENT_MONTHLY_CHANCE = 22; // ~1000 chance efetiva
const PAIRED_MONTHLY_CHANCE = 9;

export async function processSpontaneousPartnerMarket(profile, previousDate, currentDate) {
  if (!profile?.id) return profile;
  const month = monthKeyOf(currentDate);
  if (monthKeyOf(previousDate) === month) return profile; // só processa na virada do mês
  if (profile.last_spontaneous_offer_month === month) return profile; // idempotente

  const isFreeAgent = !profile.partner_id;
  const chance = isFreeAgent ? FREE_AGENT_MONTHLY_CHANCE : PAIRED_MONTHLY_CHANCE;
  const roll = hash(`${profile.id}:${month}:spontaneous-partner-offer`) % 100;
  const marked = { last_spontaneous_offer_month: month };
  if (roll >= chance) {
    return localGame.entities.PlayerProfile.update(profile.id, marked);
  }

  const candidates = await localGame.entities.AthleteProfile.filter({ market_status: 'livre' }, '-overall_rating', 40).catch(() => []);
  if (!candidates.length) return localGame.entities.PlayerProfile.update(profile.id, marked);

  const existingOffers = await listPartnerOffers(profile.id).catch(() => []);
  const expired = existingOffers.filter((item) => item.status === 'pending' && item.expires_career_date && item.expires_career_date < currentDate);
  if (expired.length) {
    await Promise.all(expired.map((item) => localGame.entities.PartnerOffer.update(item.id, { status: 'expired', resolved_career_date: currentDate })));
  }
  const cooledDownIds = getRecentRejectionCooldowns(existingOffers, currentDate);
  const alreadyOfferedIds = new Set(existingOffers.filter((item) => item.status === 'pending' && (!item.expires_career_date || item.expires_career_date >= currentDate)).map((item) => item.candidate_player_id));
  const pool = candidates.filter((candidate) => !alreadyOfferedIds.has(candidate.id) && !cooledDownIds.has(candidate.id));
  const built = buildInitialPartnerOffers(profile, pool, 1);
  if (!built.length) return localGame.entities.PlayerProfile.update(profile.id, marked);

  const offer = { ...built[0], id: `${partnerOfferId(profile.id, built[0].candidate_player_id)}-${month}`, created_career_date: currentDate, source: isFreeAgent ? 'spontaneous-market-offer' : 'spontaneous-market-offer-while-paired', expires_career_date: addDaysStr(currentDate, 10), offer_month: month };
  const saved = await localGame.entities.PartnerOffer.create(offer);
  await createOfferMessage(profile, saved);

  return localGame.entities.PlayerProfile.update(profile.id, marked);
}

export function offerCandidate(offer) { return offer?.candidate_snapshot || null; }
export function compactOffer(offer) {
  return Object.fromEntries(Object.entries(offer || {}).filter(([, value]) => useful(value)));
}
