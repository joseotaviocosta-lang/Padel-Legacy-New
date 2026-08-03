import { localGame } from '@/api/localGameClient.js';
import { formPartnerContract } from '@/game-core/partnerLifecycle.js';
export { partnerOfferId, compatibilityLabel, buildInitialPartnerOffers, validatePartnerOfferAcceptance } from './partnerOfferRules.js';
import { partnerOfferId, buildInitialPartnerOffers, validatePartnerOfferAcceptance } from './partnerOfferRules.js';

export const PARTNER_OFFERS_ROUTE = '/partners?view=offers';
const acceptanceLocks = new Map();
const useful = value => value !== undefined && value !== null && value !== '';


export async function listPartnerOffers(profileId) {
  return localGame.entities.PartnerOffer.filter({ profile_id: profileId }, '-created_date', 100);
}

async function createOfferMessage(profile, offer) {
  const candidate = offer.candidate_snapshot;
  const existing = await localGame.entities.CareerMessage.filter({ profile_id: profile.id, related_entity_id: offer.id }, null, 2).catch(() => []);
  if (existing.length) return existing[0];
  return localGame.entities.CareerMessage.create({
    profile_id: profile.id, message_type: 'proposta_parceria', sender_name: candidate.name,
    sender_type: 'atleta', title: `Proposta de parceria de ${candidate.name}`,
    content: `${candidate.name} quer formar dupla. Analise compatibilidade, lados e condições na área de Parceiros.`,
    related_entity_type: 'partner_offer', related_entity_id: offer.id, related_entity_name: candidate.name,
    status: 'decisao_pendente', priority: offer.recommended ? 'alta' : 'normal', career_date: profile.career_date,
    expires_career_date: offer.expires_career_date,
    actions: [{ id: 'view_offer', label: 'Analisar na área de Parceiros', type: 'view_partner_offer', payload: { offerId: offer.id } }],
    metadata: { offer_id: offer.id }, is_new: true,
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

export function offerCandidate(offer) { return offer?.candidate_snapshot || null; }
export function compactOffer(offer) {
  return Object.fromEntries(Object.entries(offer || {}).filter(([, value]) => useful(value)));
}
