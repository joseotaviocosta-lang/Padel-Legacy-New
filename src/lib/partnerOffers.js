import { localGame } from '@/api/localGameClient.js';
import { formPartnerContract } from '@/game-core/partnerLifecycle.js';
export { partnerOfferId, compatibilityLabel, buildInitialPartnerOffers, validatePartnerOfferAcceptance } from './partnerOfferRules.js';
import { partnerOfferId, buildInitialPartnerOffers, validatePartnerOfferAcceptance } from './partnerOfferRules.js';

export const PARTNER_OFFERS_ROUTE = '/partners?view=offers';
const acceptanceLocks = new Map();
const useful = value => value !== undefined && value !== null && value !== '';

function hash(text) {
  let value = 2166136261;
  for (const char of String(text || '')) {
    value ^= char.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
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

export async function ensureInitialPartnerOffers(profile, candidates) {
  const existing = await listPartnerOffers(profile.id).catch(() => []);
  if (existing.length || profile.partner_id) return existing;
  const built = buildInitialPartnerOffers(profile, candidates);
  const created = [];
  for (const offer of built) {
    const duplicate = await localGame.entities.PartnerOffer.filter({ profile_id: profile.id, candidate_player_id: offer.candidate_player_id }, null, 1).catch(() => []);
    const saved = duplicate[0] || await localGame.entities.PartnerOffer.create(offer);
    created.push(saved);
    await createOfferMessage(profile, saved);
  }
  return created;
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
  const updated = await localGame.entities.PartnerOffer.update(fresh.id, { status: 'rejected', resolved_career_date: profile.career_date });
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
  const alreadyOfferedIds = new Set(existingOffers.filter((item) => item.status === 'pending').map((item) => item.candidate_player_id));
  const pool = candidates.filter((candidate) => !alreadyOfferedIds.has(candidate.id));
  const built = buildInitialPartnerOffers(profile, pool, 1);
  if (!built.length) return localGame.entities.PlayerProfile.update(profile.id, marked);

  const offer = { ...built[0], source: isFreeAgent ? 'spontaneous-market-offer' : 'spontaneous-market-offer-while-paired', expires_career_date: addDaysStr(currentDate, 10) };
  const saved = await localGame.entities.PartnerOffer.create(offer);
  await createOfferMessage(profile, saved);

  // Fase 15 (Parte 7/16): quando o jogador já está em dupla, a proposta
  // espontânea TAMBÉM alimenta o interesse de renovação do parceiro atual
  // (fator real "recebeu interesse de atleta melhor ranqueado" — Parte 7),
  // marcado na própria Partnership ativa, nunca um contador novo solto.
  if (!isFreeAgent) {
    const active = await localGame.entities.Partnership.filter({ profile_id: profile.id, status: 'ativa' }, null, 1).catch(() => []);
    if (active[0]) {
      await localGame.entities.Partnership.update(active[0].id, { partner_saw_better_opportunity: { name: saved.candidate_snapshot?.name, world_rank: saved.candidate_snapshot?.world_rank || null, career_date: currentDate } });
    }
  }

  return localGame.entities.PlayerProfile.update(profile.id, marked);
}

export function offerCandidate(offer) { return offer?.candidate_snapshot || null; }
export function compactOffer(offer) {
  return Object.fromEntries(Object.entries(offer || {}).filter(([, value]) => useful(value)));
}
