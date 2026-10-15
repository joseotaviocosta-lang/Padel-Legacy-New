import { localGame } from '@/api/localGameClient.js';
import { upsertCareerMessage } from '@/lib/careerCommunications.js';
import { getActivePartnership } from '@/lib/partnershipSystem.js';

import { buildInitialPartnerOffers } from '@/lib/partnerOfferRules.js';

// Playthrough 5.17, Parte F — MERCADO PROATIVO APÓS SEPARAÇÃO.
//
// Playtest: a parceria acabou, o jogador ficou sem dupla e NENHUMA proposta
// apareceu — ele foi obrigado a procurar manualmente.
//
// Causa medida: `ensureInitialPartnerOffers` é o único gerador de propostas
// e só roda quando o jogador ABRE o PartnerHub (PartnerHub.jsx:122). Além
// disso é "inicial": se já houve oferta alguma vez, ele se recusa a rodar de
// novo. Ou seja, depois de uma separação o mundo simplesmente não procurava
// ninguém — a busca manual não era uma opção, era o único caminho.
//
// Esta autoridade roda no tick diário, junto com o resto do ciclo de
// parceria. Ela NÃO substitui a busca manual, que continua disponível.
//
// Comportamento (escopo pedido na Parte F):
//   - primeira janela logo após a separação (3 dias);
//   - novas janelas a cada 7 dias enquanto seguir sem dupla;
//   - 2 a 4 candidatos coerentes por janela;
//   - dedupe por candidato (nunca a mesma dupla proposta duas vezes);
//   - candidato não pode estar comprometido em outra parceria ativa;
//   - persistente (PartnerOffer + CareerMessage com id estável).

export const POST_SEPARATION_FIRST_WINDOW_DAYS = 3;
export const POST_SEPARATION_INTERVAL_DAYS = 7;
const MIN_CANDIDATES = 2;
const MAX_CANDIDATES = 4;

const entities = /** @type {any} */ (localGame.entities);

function daysBetween(from, to) {
  const a = new Date(`${String(from).slice(0, 10)}T00:00:00Z`);
  const b = new Date(`${String(to).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b - a) / 86400000);
}

export function postSeparationWindowIndex(separationDate, currentDate) {
  const elapsed = daysBetween(separationDate, currentDate);
  if (elapsed === null || elapsed < POST_SEPARATION_FIRST_WINDOW_DAYS) return null;
  return Math.floor((elapsed - POST_SEPARATION_FIRST_WINDOW_DAYS) / POST_SEPARATION_INTERVAL_DAYS);
}

/**
 * Um candidato só é proponível se estiver REALMENTE livre. Sem isto, o jogo
 * ofereceria duplas já comprometidas e a aceitação quebraria uma parceria de
 * IA pelas costas.
 */
export function isCandidateAvailable(candidate, activePartnerIds) {
  if (!candidate?.id) return false;
  if (candidate.career_status === 'aposentado' || candidate.retired) return false;
  if (candidate.ai_partner_id) return false;
  return !activePartnerIds.has(candidate.id);
}

/**
 * Data da separação mais recente do jogador, lida do histórico persistido —
 * nunca de estado de sessão, para sobreviver a reload.
 */
export async function findLastSeparationDate(profileId) {
  const rows = await entities.Partnership.filter({ profile_id: profileId }).catch(() => []);
  const ended = (rows || [])
    .filter((row) => row && row.status !== 'ativa' && (row.ended_career_date || row.contract_end_date))
    .map((row) => String(row.ended_career_date || row.contract_end_date).slice(0, 10))
    .sort();
  return ended.length ? ended[ended.length - 1] : null;
}

export async function ensurePostSeparationPartnerMarket(profile, currentDate) {
  if (!profile?.id || !currentDate) return { created: 0, reason: 'invalid-input' };
  if (profile.partner_id) return { created: 0, reason: 'has-partner' };

  const active = await getActivePartnership(profile.id).catch(() => null);
  if (active) return { created: 0, reason: 'has-partnership' };

  const separationDate = await findLastSeparationDate(profile.id);
  if (!separationDate) return { created: 0, reason: 'never-separated' };

  const windowIndex = postSeparationWindowIndex(separationDate, currentDate);
  if (windowIndex === null) return { created: 0, reason: 'too-soon', separationDate };

  // Idempotência: uma janela = uma leva de propostas, mesmo que o dia seja
  // reprocessado.
  const windowKey = `post-separation:${separationDate}:w${windowIndex}`;
  const existingForWindow = await entities.PartnerOffer
    .filter({ profile_id: profile.id, market_window: windowKey }).catch(() => []);
  if (existingForWindow?.length) {
    return { created: 0, reason: 'window-already-served', windowKey };
  }

  // Parte F — o candidato precisa ser AthleteProfile REAL e persistente (a
  // regra da 5.12), não o catálogo estático de bots.
  //
  // Medido: `getAvailablePartners` (lib/career.js:325) devolveu 0 candidatos
  // neste cenário — ele lê `BOTS_BY_DIFFICULTY`, filtrado por nível de XP, e
  // não enxerga a população do mundo. Como ~894 dos ~1000 atletas já estão
  // pareados, os únicos parceiros plausíveis são os atletas livres do
  // próprio mundo, que é de onde este mercado passa a tirar suas propostas.
  const [worldAthletes, allPartnerships, previousOffers] = await Promise.all([
    entities.AthleteProfile.list('-world_ranking_points', 5000).catch(() => []),
    entities.Partnership.list('-created_date', 2000).catch(() => []),
    entities.PartnerOffer.filter({ profile_id: profile.id }).catch(() => []),
  ]);
  const candidatesRaw = worldAthletes || [];

  const activePartnerIds = new Set();
  for (const row of allPartnerships || []) {
    if (row?.status !== 'ativa') continue;
    if (row.athlete_a_id) activePartnerIds.add(row.athlete_a_id);
    if (row.athlete_b_id) activePartnerIds.add(row.athlete_b_id);
    if (row.partner_bot_id) activePartnerIds.add(row.partner_bot_id);
  }
  // Dedupe entre janelas: quem já foi proposto não volta.
  const alreadyOffered = new Set((previousOffers || []).map((o) => o.candidate_player_id).filter(Boolean));

  const free = (candidatesRaw || [])
    .filter((candidate) => isCandidateAvailable(candidate, activePartnerIds))
    .filter((candidate) => !alreadyOffered.has(candidate.id));
  if (!free.length) return { created: 0, reason: 'no-candidates', windowKey };

  // Proximidade de ranking antes de pontuar: sem isto, avaliaríamos mil
  // atletas por janela e ofereceríamos sempre os mesmos nomes do topo, que
  // `calculatePartnershipInterest` recusaria de qualquer forma.
  const playerRank = Number(profile.world_ranking ?? profile.ranking_position) || 9999;
  const pool = [...free]
    .sort((a, b) => {
      const ra = Math.abs((Number(a.ranking_position) || 9999) - playerRank);
      const rb = Math.abs((Number(b.ranking_position) || 9999) - playerRank);
      return ra - rb;
    })
    .slice(0, 60);

  // Reaproveita a MESMA seleção/termos das ofertas existentes — nada de uma
  // segunda régua de compatibilidade (Parte Q: não inventar segunda escala).
  const built = buildInitialPartnerOffers({ ...profile, career_date: currentDate }, pool, MAX_CANDIDATES)
    .slice(0, MAX_CANDIDATES);
  if (built.length < MIN_CANDIDATES && built.length === 0) {
    return { created: 0, reason: 'no-viable-offer', windowKey };
  }

  const created = [];
  for (const offer of built) {
    const saved = await entities.PartnerOffer.upsert(offer.id, {
      ...offer,
      source: 'post-separation-market',
      market_window: windowKey,
      created_career_date: currentDate,
    }).catch(() => null);
    if (saved) created.push(saved);
  }

  if (created.length) {
    const names = created
      .map((offer) => offer.candidate_snapshot?.name || offer.candidate_snapshot?.sport_name)
      .filter(Boolean);
    await upsertCareerMessage(profile.id, `partner-market-window:${windowKey}`, {
      sender_name: 'Assessoria de carreira',
      sender_type: 'empresario',
      title: windowIndex === 0 ? 'Contatos para nova dupla' : 'Novos contatos para dupla',
      content: names.length
        ? `Conversamos com ${names.length} atleta(s) disponíveis: ${names.join(', ')}. Avalie as condições quando quiser.`
        : 'Novos contatos disponíveis para formar dupla.',
      status: 'nao_lida',
      priority: 'normal',
      message_type: 'partner_market_window',
      career_date: currentDate,
      actions: [{ id: 'open_partner_hub', label: 'Ver propostas', type: 'view_partnership', payload: {} }],
      destination: { type: 'PARTNER_OFFER', route: '/partners', params: { view: 'offers' } },
    });
  }

  return { created: created.length, windowKey, windowIndex, separationDate, offers: created };
}
