// Playthrough 4.8, Partes B/C — auditoria confirmou a causa exata das
// propostas incoerentes de primeira dupla (ex.: "Nuno Fernandes, 36 anos,
// OVR 8, Iniciante"): `generateFictionalAthletes` (players/athleteGenerator.js)
// sorteia `age` numa faixa uniforme de 18-37 TOTALMENTE independente do OVR
// gerado — não existe nenhuma correlação entre idade e nível no catálogo
// procedural. `buildInitialPartnerOffers` (partnerOfferRules.js), por sua
// vez, nunca lia `age`/`potential` em lugar nenhum do score — só
// compatibilidade de lado/estilo/OVR e "interesse" (reputação/ranking do
// JOGADOR, não coerência etária do candidato). O resultado: um veterano de
// 36 anos com OVR 8 (claramente NUNCA foi profissional, nem tem potencial
// de crescer) tinha a mesma chance de aparecer que um jovem de 18 anos com
// o mesmo OVR — narrativamente sem sentido pra a primeira dupla de um
// atleta de 16 anos.
//
// Este módulo é uma camada NOVA e ESCOPADA só pra primeira parceria
// (nunca aplicada às propostas espontâneas mensais de
// processSpontaneousPartnerMarket, que continuam com buildInitialPartnerOffers
// inalterado) — exatamente como pedido: "não aplique obrigatoriamente a
// mesma lógica para toda a carreira".
import { evaluatePartnerCompatibility, calculatePartnershipInterest } from '@/players/teamCompatibility.js';
import { getBalance527 } from '@/lib/balance527.js';

export const FIRST_PARTNERSHIP_CATEGORY = Object.freeze({
  YOUNG_PROJECT: 'YOUNG_PROJECT',
  VETERAN_MENTOR: 'VETERAN_MENTOR',
  NORMAL: 'NORMAL',
  POOR_FIRST_PARTNER: 'POOR_FIRST_PARTNER',
});

// Parte E / achado registrado — não existe nenhum campo de "experiência"/
// "carreira acumulada" persistido nos bots procedurais (auditado: nenhum
// consumidor em teamCompatibility.js/partnerOfferRules.js/PartnerHub.jsx
// lê `potential` ou qualquer coisa parecida com experiência hoje). Em vez
// de criar um sistema novo de experiência/carreira nesta fase (fora do
// pedido — "não crie um sistema gigantesco novo"), a classificação deriva
// um proxy só dela mesma: um candidato mais velho SÓ conta como
// "experiente" se o OVR dele também for claramente acima do iniciante
// comum — idade sozinha nunca implica experiência (essa é exatamente a
// falha que gerava o bug original).
function isClearlyVeteranStrength(overall) {
  // "OVR claramente superior a iniciante comum" — o centro da faixa
  // iniciante (1-24) fica em torno de 8-14; 18+ já é nitidamente acima.
  return overall >= 18;
}

export function classifyFirstPartnershipCandidate(candidate) {
  const age = Number(candidate?.age) || 20;
  const overall = Number(candidate?.overall_rating ?? candidate?.overall) || 0;
  const potential = Number(candidate?.potential ?? overall) || overall;
  const potentialGap = potential - overall;

  const isVeteranAge = age >= 27;
  const isYoungAge = age <= 22;
  const isPoorOverall = overall <= 12;
  // "Potencial alto/médio-alto" — margem de evolução real (gap pro OVR
  // atual) OU um potencial absoluto já respeitável, nunca os dois
  // exigidos ao mesmo tempo (um jovem de OVR baixo mas gap grande ainda é
  // um projeto válido; um jovem já com potencial alto sem gap grande
  // também).
  const meaningfulPotential = potentialGap >= 8 || potential >= 28;

  // Veterano mentor: idade + OVR que realmente justifica o rótulo — nunca
  // só idade (essa é a distinção central desta fase).
  if (isVeteranAge && isClearlyVeteranStrength(overall)) return FIRST_PARTNERSHIP_CATEGORY.VETERAN_MENTOR;
  // Candidato ruim pra PRIMEIRA dupla: velho e sem OVR que justifique —
  // "jogador velho + OVR muito baixo + iniciante" é exatamente a
  // combinação proibida pela Parte A.
  if (isVeteranAge && isPoorOverall) return FIRST_PARTNERSHIP_CATEGORY.POOR_FIRST_PARTNER;
  if (isYoungAge && (meaningfulPotential || overall >= 10)) return FIRST_PARTNERSHIP_CATEGORY.YOUNG_PROJECT;
  return FIRST_PARTNERSHIP_CATEGORY.NORMAL;
}

// Parte C — combina a classificação (idade/OVR/potencial, acima) com os
// sinais que já existiam e continuam válidos (compatibilidade de
// lado/estilo, "interesse" ligado a reputação/ranking do jogador). Nunca
// substitui compatibilidade/interesse — só adiciona a dimensão etária que
// faltava, com penalização forte (nunca leve) pra POOR_FIRST_PARTNER.
export function buildFirstPartnershipCandidateScore(profile, candidate) {
  const compatibility = evaluatePartnerCompatibility(profile, candidate);
  const interest = calculatePartnershipInterest(profile, candidate, compatibility);
  const category = classifyFirstPartnershipCandidate(candidate);
  // Playthrough 5.27-E (só presets -E): a 1ª dupla dura ~11 meses (proteção de
  // torneio comprometido) enquanto o novato evolui ~22→50; a recomendação mede
  // a distância contra o nível-alvo da competição de entrada e pesa mais a
  // força. Sem `competition` (presets anteriores) a fórmula é a de sempre.
  const entry = getBalance527().competition;
  const reference = entry?.firstPartnerTargetOvr ?? Number(profile?.overall_rating || profile?.overall || 50);
  const ratingWeight = entry?.firstPartnerRatingWeight ?? 0.2;
  const ratingGap = Math.abs(reference - Number(candidate?.overall_rating || candidate?.overall || 50));
  const baseScore = compatibility.total * 0.5 + interest.score * 0.3 + Math.max(0, 100 - ratingGap * 4) * ratingWeight;
  const categoryBonus = {
    [FIRST_PARTNERSHIP_CATEGORY.YOUNG_PROJECT]: 12,
    [FIRST_PARTNERSHIP_CATEGORY.VETERAN_MENTOR]: 8,
    [FIRST_PARTNERSHIP_CATEGORY.NORMAL]: 0,
    // Parte C — "forte penalização ou exclusão". A exclusão de fato
    // acontece em selectFirstPartnershipCandidates (nunca entra na
    // vitrine); o score aqui também cai bruscamente pra qualquer outro
    // consumidor que compare candidatos sem passar pelo filtro de
    // categoria.
    [FIRST_PARTNERSHIP_CATEGORY.POOR_FIRST_PARTNER]: -60,
  }[category] || 0;
  const score = Math.max(0, Math.min(100, Math.round(baseScore + categoryBonus)));
  return { candidate, category, score, compatibility, interest };
}

// Parte F — texto específico por categoria, nunca genérico.
export function firstPartnershipReasonText(category) {
  if (category === FIRST_PARTNERSHIP_CATEGORY.YOUNG_PROJECT) {
    return { title: 'Projeto de longo prazo', body: 'Jovem com boa margem de evolução e perfil compatível com sua carreira.' };
  }
  if (category === FIRST_PARTNERSHIP_CATEGORY.VETERAN_MENTOR) {
    return { title: 'Mentor experiente', body: 'Menor potencial de evolução, mas agrega leitura tática e experiência imediata.' };
  }
  return { title: 'Opção equilibrada', body: 'Perfil compatível com o início da sua carreira.' };
}

// Parte D — distribuição das 4 primeiras opções: 2 jovens projeto, 1 jovem
// mais forte (maior score entre os jovens restantes), 1 veterano mentor —
// com fallback que NUNCA reintroduz POOR_FIRST_PARTNER só pra completar
// quantidade (a exclusão de POOR_FIRST_PARTNER, acima, já garante isso:
// `scored` nunca contém esses candidatos desde o início).
export function selectFirstPartnershipCandidates(profile, pool, count = 4) {
  const scored = (pool || [])
    .filter((candidate) => candidate?.id && candidate.career_status !== 'aposentado')
    .map((candidate) => buildFirstPartnershipCandidateScore(profile, candidate))
    .filter((item) => (
      item.category !== FIRST_PARTNERSHIP_CATEGORY.POOR_FIRST_PARTNER
      && item.interest.available
      && item.compatibility.total >= 42
    ));

  const byCategory = (category) => scored
    .filter((item) => item.category === category)
    .sort((a, b) => b.score - a.score);

  const youngProjects = byCategory(FIRST_PARTNERSHIP_CATEGORY.YOUNG_PROJECT);
  const veteranMentors = byCategory(FIRST_PARTNERSHIP_CATEGORY.VETERAN_MENTOR);
  const normals = byCategory(FIRST_PARTNERSHIP_CATEGORY.NORMAL);
  const everythingSorted = [...scored].sort((a, b) => b.score - a.score);

  const picks = [];
  const usedIds = new Set();
  const takeFrom = (list, wanted) => {
    let remaining = wanted;
    for (const item of list) {
      if (picks.length >= count || remaining <= 0) break;
      if (usedIds.has(item.candidate.id)) continue;
      usedIds.add(item.candidate.id);
      picks.push(item);
      remaining -= 1;
    }
  };

  takeFrom(youngProjects, 2);
  takeFrom(veteranMentors, 1);
  takeFrom(youngProjects, 1); // "1 jovem mais forte" — próximo melhor score já ordenado.
  // Fallbacks (Parte D) — nunca recorre a POOR_FIRST_PARTNER, só amplia a
  // busca dentro do que já sobrou coerente.
  if (picks.length < count) takeFrom(youngProjects, count - picks.length);
  if (picks.length < count) takeFrom(veteranMentors, count - picks.length);
  if (picks.length < count) takeFrom(normals, count - picks.length);
  if (picks.length < count) takeFrom(everythingSorted, count - picks.length);

  return picks.slice(0, count);
}
