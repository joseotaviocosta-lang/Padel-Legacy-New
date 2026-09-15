import { normalizeAthlete, normalizeCourtSide, toLegacyCourtSide } from './athleteSchema.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const nameOf = athlete => athlete?.sport_name || athlete?.name || 'Atleta';
const ratingOf = athlete => {
  const direct = Number(athlete?.overall_rating ?? athlete?.overall);
  if (Number.isFinite(direct) && direct > 0) return clamp(direct, 1, 100);
  const values = ['serve', 'forehand', 'backhand', 'volley', 'lob', 'smash', 'bandeja', 'speed', 'stamina', 'tactics', 'positioning']
    .map(key => Number(athlete?.[key] ?? athlete?.attributes?.[key])).filter(Number.isFinite);
  return values.length ? clamp(values.reduce((sum, value) => sum + value, 0) / values.length, 1, 100) : 50;
};

function assignmentPenalty(raw, assignedSide) {
  const athlete = normalizeAthlete(raw, { sourceType: raw?.source_type || 'career' });
  const preferred = normalizeCourtSide(athlete.preferred_side);
  if (preferred === 'flex' || preferred === assignedSide) return 0;
  const experience = clamp(athlete.side_experience?.[assignedSide], 0, 100) / 100;
  return clamp(Math.round(24 * (1 - athlete.side_flexibility) * (1 - experience * 0.55)), 3, 24);
}

export function resolveTeamCourtSides(playerA, playerB, { preservePlayerA = true } = {}) {
  const options = [
    { a: 'right', b: 'left' },
    { a: 'left', b: 'right' },
  ].map(option => ({ ...option, penaltyA: assignmentPenalty(playerA, option.a), penaltyB: assignmentPenalty(playerB, option.b) }))
    .map(option => ({ ...option, totalPenalty: option.penaltyA + option.penaltyB }));
  options.sort((x, y) => x.totalPenalty - y.totalPenalty || (preservePlayerA && x.a === normalizeCourtSide(playerA?.court_side ?? playerA?.preferred_side) ? -1 : 1));
  const best = options[0];
  const samePreference = normalizeCourtSide(playerA?.court_side ?? playerA?.preferred_side) === normalizeCourtSide(playerB?.preferred_side ?? playerB?.position)
    && normalizeCourtSide(playerA?.court_side ?? playerA?.preferred_side) !== 'flex';
  return {
    assignments: { playerA: best.a, playerB: best.b },
    legacyAssignments: { playerA: toLegacyCourtSide(best.a), playerB: toLegacyCourtSide(best.b) },
    penalties: { playerA: best.penaltyA, playerB: best.penaltyB, total: best.totalPenalty },
    naturalFit: best.totalPenalty === 0,
    samePreference,
    explanation: best.totalPenalty === 0
      ? `${nameOf(playerA)} e ${nameOf(playerB)} ocupam lados naturais complementares.`
      : `${best.penaltyA >= best.penaltyB ? nameOf(playerA) : nameOf(playerB)} fará adaptação de lado; penalidade tática estimada em ${best.totalPenalty} pontos.`,
  };
}

export function evaluatePartnerCompatibility(player, partner) {
  const side = resolveTeamCourtSides(player, partner);
  const playerOverall = ratingOf(player);
  const partnerOverall = ratingOf(partner);
  const level = clamp(100 - Math.abs(playerOverall - partnerOverall) * 2, 25, 100);
  const roleA = player?.tactical_role || player?.role || 'coringa';
  const roleB = partner?.tactical_role || partner?.role || 'coringa';
  const complementaryRoles = new Set(['controlador:finalizador', 'construtor:pressionador', 'defensor:finalizador', 'defensor:pressionador']);
  const roleKey = [roleA, roleB].sort().join(':');
  const style = complementaryRoles.has(roleKey) ? 94 : roleA === roleB ? 62 : 80;
  const sideScore = clamp(100 - side.penalties.total * 3, 25, 100);
  const handA = player?.handedness || player?.dominant_hand;
  const handB = partner?.handedness || partner?.dominant_hand;
  const centerForehands = (side.assignments.playerA === 'right' && handA === 'left') || (side.assignments.playerB === 'right' && handB === 'left');
  const handedness = centerForehands ? 90 : handA && handB && handA !== handB ? 84 : 76;
  const total = Math.round(sideScore * 0.34 + level * 0.25 + style * 0.29 + handedness * 0.12);
  return {
    total, sideResolution: side,
    breakdown: { position: sideScore, style, role: style, handedness, level },
    strengths: [side.naturalFit ? 'Lados naturalmente complementares' : 'Adaptação viável com experiência', style >= 90 ? 'Funções táticas complementares' : 'Combinação tática viável', centerForehands ? 'Bons ângulos de forehand pelo centro' : null].filter(Boolean),
    warnings: [...(side.penalties.total > 0 ? [side.explanation] : []), ...(roleA === roleB && ['finalizador', 'controlador'].includes(roleA) ? [`Dois ${roleA === 'finalizador' ? 'finalizadores podem perder construção' : 'controladores podem perder definição'}.`] : [])],
  };
}

// Fase 5.1, item 2 (portão de parceria) — desenho de 3 faixas aprovado na
// Fase 5 (sem corte rígido único): abaixo de `low`, o candidato some da
// lista de ofertas/convite (não "não existe" — "fora de alcance ainda");
// entre `low` e `high`, aparece com termos mais duros
// (getSuggestedPartnerTerms, gap-based); a partir de `high`, termos
// normais. Calibrado por cálculo direto contra esta fórmula (perfis
// reais de carreira, não simulado): jogador novo (#1000, reputação~10)
// vs. candidato equivalente ≈36 (passa o `low`), vs. top 20-50 ≈23-24
// (fica abaixo — não deveria conseguir); jogador de meio de carreira
// (#200, reputação~50) vs. equivalente ≈66 (bem acima do `high`), vs.
// top 20-50 ≈53-55 (na fronteira — bate com "meta de meio de carreira,
// não escolha de menu"). Ponto de partida a confirmar por medição (item
// 2.6 da Fase 5), não valor final.
export const PARTNERSHIP_INTEREST_THRESHOLDS = Object.freeze({ low: 30, high: 55 });

export function calculatePartnershipInterest(profile, athlete, compatibility = evaluatePartnerCompatibility(profile, athlete)) {
  const careerRank = Math.max(1, Number(profile?.ranking_position) || 1500);
  const athleteRank = Math.max(1, Number(athlete?.world_rank ?? athlete?.ranking_position) || 500);
  const reputation = clamp(profile?.reputation, 0, 100);
  const rankingProgress = clamp((1500 - careerRank) / 15, 0, 100);
  const eliteDemand = clamp((120 - athleteRank) / 1.2, 0, 100);
  // Hotfix — em dia 1 de carreira nova, `ensureMyProfile` (src/lib/padel.js)
  // nunca seta `reputation`/`ranking_position` — os dois caem no fallback
  // (reputation=0, rankingProgress=0), zerando 65% do peso da fórmula pra
  // QUALQUER candidato, inclusive o bot mais fraco do catálogo (Iniciante,
  // OVR 1-24). A fricção da Fase 5.1 foi calibrada pra barrar acesso
  // precoce a candidatos FORTES (achado #31/#32: jogador de reputação zero
  // contratando o melhor atleta do jogo) — nunca deveria se aplicar a um
  // candidato já trivialmente fraco. `noviceEase` espelha `eliteDemand` na
  // direção oposta: dado pela força do CANDIDATO (OVR), não do jogador,
  // então nunca afeta reals (OVR 83-96) nem bots Avançado+ (OVR ≥55) — só
  // compensa quando o próprio candidato não exige prova nenhuma de
  // reputação/ranking pra ser um parceiro razoável.
  const partnerOverall = ratingOf(athlete);
  const noviceEase = clamp((42 - partnerOverall) * 1.6, 0, 40);
  const score = Math.round(clamp(compatibility.total * 0.35 + reputation * 0.3 + rankingProgress * 0.35 - eliteDemand * 0.15 + noviceEase, 3, 97));
  const level = score >= 75 ? 'alto' : score >= 50 ? 'médio' : score >= 25 ? 'baixo' : 'muito baixo';
  const friction = score < PARTNERSHIP_INTEREST_THRESHOLDS.high;
  return {
    // Fase 5.1, item 2 — antes, `available` só checava aposentadoria e
    // ignorava `score` inteiro (achado #31/#32): um jogador com
    // reputação zero via e contratava o melhor atleta do jogo. Agora o
    // score decide junto — abaixo de `low`, o candidato não aparece.
    // `friction` (novo) é a faixa intermediária: aparece, mas quem
    // monta a oferta/termos (partnerOfferRules.js, PartnerHub.jsx) sabe
    // que precisa usar termos mais duros em vez dos padrão.
    score, level, friction,
    available: athlete?.career_status !== 'aposentado' && score >= PARTNERSHIP_INTEREST_THRESHOLDS.low,
    reasons: [compatibility.total >= 70 ? 'Encaixe esportivo favorável' : 'Encaixe esportivo exige trabalho', reputation >= 55 ? 'Sua reputação inspira confiança' : 'Sua reputação ainda limita o interesse'],
    requirements: score < 50 ? ['Melhore ranking, reputação ou condições da proposta'] : [],
  };
}

export function applySideAdaptation(athlete, assignedSide, amount = 1) {
  const normalized = normalizeAthlete(athlete, { sourceType: athlete?.source_type || 'career' });
  const side = normalizeCourtSide(assignedSide);
  if (side === 'flex') return normalized;
  return { ...normalized, side_experience: { ...normalized.side_experience, [side]: clamp(normalized.side_experience[side] + amount, 0, 100) } };
}
