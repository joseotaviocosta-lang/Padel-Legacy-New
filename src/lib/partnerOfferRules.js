import { evaluatePartnerCompatibility, calculatePartnershipInterest } from '../players/teamCompatibility.js';
import { getSuggestedPartnerTerms } from '../game-core/partnerLifecycle.js';
import { selectFirstPartnershipCandidates, firstPartnershipReasonText } from './firstPartnershipScoring.js';

const addDays = (date, days) => { const value = new Date(`${date}T12:00:00`); value.setDate(value.getDate() + days); return value.toISOString().slice(0, 10); };

export function partnerOfferId(profileId, candidateId) { return `partner-offer-${profileId}-${candidateId}`; }
export function compatibilityLabel(score) { return score >= 85 ? 'Excelente' : score >= 75 ? 'Muito boa' : score >= 60 ? 'Boa' : score >= 45 ? 'Regular' : 'Baixa'; }

// Extraído de buildInitialPartnerOffers pra ser reaproveitado também por
// buildFirstPartnershipOffers (Playthrough 4.8) — mesma forma de
// registro/termos de contrato pros dois caminhos, só a SELEÇÃO de
// candidatos (antes desta linha) diverge entre eles.
function toPartnerOfferRecord(profile, item, index, extra = {}) {
  return {
    id: partnerOfferId(profile.id, item.candidate.id), profile_id: profile.id, candidate_player_id: item.candidate.id,
    status: 'pending', created_career_date: profile.career_date, expires_career_date: addDays(profile.career_date, 10),
    source: 'initial-partner-offer', candidate_snapshot: item.candidate,
    contract: {
      type: 'temporary', ...getSuggestedPartnerTerms(profile, item.candidate),
      conditions: item.interest.friction ? ['Interesse ainda moderado — condições mais exigentes até sua reputação ou ranking subirem.'] : [],
    },
    compatibility_snapshot: item.compatibility,
    recommendation_score: item.recommendationScore ?? item.score,
    recommended: index === 0,
    schema_version: 1,
    ...extra,
  };
}

export function buildInitialPartnerOffers(profile, candidates, count = 4) {
  const viable = (candidates || []).filter(candidate => candidate?.id && candidate.career_status !== 'aposentado').map(candidate => {
    const compatibility = evaluatePartnerCompatibility(profile, candidate);
    const interest = calculatePartnershipInterest(profile, candidate, compatibility);
    const ratingGap = Math.abs(Number(profile?.overall_rating || profile?.overall || 50) - Number(candidate?.overall_rating || candidate?.overall || 50));
    return { candidate, compatibility, interest, recommendationScore: Math.round(compatibility.total * .55 + interest.score * .3 + Math.max(0, 100 - ratingGap * 4) * .15) };
  }).filter(item => item.compatibility.total >= 42 && item.interest.available).sort((a,b)=>b.recommendationScore-a.recommendationScore);
  // Fase 5.1, item 2 — antes, os termos eram fixos por posição no array
  // ([60,45,90,60][index]/prizeSplit:50), o mesmo pra qualquer candidato
  // (achado da Fase 5: um dos 3 caminhos de contratação que ignorava o
  // gap de nível). Agora usa getSuggestedPartnerTerms (mesma função já
  // usada no onboarding, partnerLifecycle.js) — termos endurecem sozinhos
  // conforme o gap de overall cresce, sem precisar de um ramo separado
  // pra faixa de "fricção": um candidato de gap pequeno já cai perto do
  // padrão (60 dias/50%); um de gap grande (tipicamente também mais caro
  // em `interest.score`) já sai com prazo mais curto e split pior.
  return viable.slice(0, Math.max(3, Math.min(5, count))).map((item, index) => toPartnerOfferRecord(profile, item, index));
}

// Playthrough 4.8, Partes C/D/F — caminho ESCOPADO só pra primeira
// parceria da carreira (nunca usado pelas propostas espontâneas mensais,
// que continuam em buildInitialPartnerOffers/count:1 inalterado). Usa
// selectFirstPartnershipCandidates (firstPartnershipScoring.js) em vez do
// simples sort por recommendationScore — filtra POOR_FIRST_PARTNER e
// garante diversidade (jovens projeto + veterano mentor) na vitrine.
export function buildFirstPartnershipOffers(profile, candidates, count = 4) {
  const picks = selectFirstPartnershipCandidates(profile, candidates, Math.max(3, Math.min(5, count)));
  const bestIndex = picks.reduce((bestIdx, item, idx, arr) => (item.score > arr[bestIdx].score ? idx : bestIdx), 0);
  return picks.map((item, index) => {
    const reason = firstPartnershipReasonText(item.category);
    return toPartnerOfferRecord(profile, item, index, {
      first_partnership_category: item.category,
      first_partnership_reason: reason,
      // Parte G — "recomendado" é o maior score REAL entre os escolhidos,
      // nunca simplesmente a posição 0 da lista (que aqui já reflete a
      // ordem de seleção por diversidade, não só por score).
      recommended: index === bestIndex,
    });
  });
}
export function validatePartnerOfferAcceptance(profile, offer, currentOffers = [], activePartnership = null) {
  if (!offer) return {ok:false,code:'OFFER_NOT_FOUND',message:'A proposta não existe.'};
  if (offer.status !== 'pending') return {ok:false,code:'OFFER_NOT_PENDING',message:'Esta proposta já foi resolvida.'};
  if (offer.expires_career_date && profile.career_date > offer.expires_career_date) return {ok:false,code:'OFFER_EXPIRED',message:'Esta proposta expirou.'};
  if (!offer.candidate_snapshot?.id) return {ok:false,code:'CANDIDATE_NOT_FOUND',message:'O candidato não está mais disponível.'};
  if (activePartnership && activePartnership.partner_bot_id !== offer.candidate_player_id) return {ok:false,code:'ACTIVE_PARTNERSHIP',message:'Você já possui uma dupla ativa.'};
  if (currentOffers.find(item=>item.status==='accepted'&&item.id!==offer.id)) return {ok:false,code:'OTHER_OFFER_ACCEPTED',message:'Outra proposta já foi aceita.'};
  return {ok:true};
}
