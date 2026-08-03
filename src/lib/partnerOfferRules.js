import { evaluatePartnerCompatibility, calculatePartnershipInterest } from '../players/teamCompatibility.js';

const addDays = (date, days) => { const value = new Date(`${date}T12:00:00`); value.setDate(value.getDate() + days); return value.toISOString().slice(0, 10); };

export function partnerOfferId(profileId, candidateId) { return `partner-offer-${profileId}-${candidateId}`; }
export function compatibilityLabel(score) { return score >= 85 ? 'Excelente' : score >= 75 ? 'Muito boa' : score >= 60 ? 'Boa' : score >= 45 ? 'Regular' : 'Baixa'; }
export function buildInitialPartnerOffers(profile, candidates, count = 4) {
  const viable = (candidates || []).filter(candidate => candidate?.id && candidate.career_status !== 'aposentado').map(candidate => {
    const compatibility = evaluatePartnerCompatibility(profile, candidate);
    const interest = calculatePartnershipInterest(profile, candidate, compatibility);
    const ratingGap = Math.abs(Number(profile?.overall_rating || profile?.overall || 50) - Number(candidate?.overall_rating || candidate?.overall || 50));
    return { candidate, compatibility, interest, recommendationScore: Math.round(compatibility.total * .55 + interest.score * .3 + Math.max(0, 100 - ratingGap * 4) * .15) };
  }).filter(item => item.compatibility.total >= 42 && item.interest.available).sort((a,b)=>b.recommendationScore-a.recommendationScore);
  return viable.slice(0, Math.max(3, Math.min(5, count))).map((item,index)=>({ id:partnerOfferId(profile.id,item.candidate.id), profile_id:profile.id, candidate_player_id:item.candidate.id, status:'pending', created_career_date:profile.career_date, expires_career_date:addDays(profile.career_date,10), source:'initial-partner-offer', candidate_snapshot:item.candidate, contract:{type:'temporary',durationDays:[60,45,90,60][index]||60,prizeSplit:50,conditions:[]}, compatibility_snapshot:item.compatibility, recommendation_score:item.recommendationScore, recommended:index===0, schema_version:1 }));
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
