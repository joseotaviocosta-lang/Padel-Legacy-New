import { getTournamentChoiceProfile } from '@/lib/circuitCatalog.js';
import { evaluateTournamentEntry, resolveEntryRank } from './EntryManager.js';

export const CAREER_STRATEGIES = Object.freeze({
  MONEY: 'money', RANKING: 'ranking', PRESTIGE: 'prestige', EXPERIENCE: 'experience', BALANCED: 'balanced',
});

const WEIGHTS = Object.freeze({
  money: { net: .55, points: .12, prestige: .08, title: .15, fatigue: .10 },
  ranking: { net: .08, points: .52, prestige: .12, title: .18, fatigue: .10 },
  prestige: { net: .05, points: .18, prestige: .52, title: .15, fatigue: .10 },
  experience: { net: .08, points: .16, prestige: .08, title: .50, fatigue: .18 },
  balanced: { net: .20, points: .25, prestige: .20, title: .25, fatigue: .10 },
});

export function evaluateTournamentChoice(tournament, athlete = {}, context = {}) {
  // Fase 1A (achado #16): evaluateTournamentEntry já resolve o rank via
  // resolveEntryRank internamente, então passar `athlete` bruto funciona
  // para qualquer chamador (WorldTourLifecycle usa `.ranking`, o jogador
  // usa `.rank`/`.teamRank`). O que faltava era este `||` disperso e mais
  // estreito abaixo, que alimentava o perfil de escolha (título/prestígio)
  // com rank 0 sempre que o campo de origem não era `rank`/`teamRank` —
  // trocado pelo mesmo resolvedor canônico para não haver duas fontes de
  // verdade sobre "qual é o rank deste atleta aqui".
  // Playthrough 5.3, Parte D — `context.aiFieldContext` (true só quando
  // WorldTourLifecycle.js chama pra montar o campo de fundo) troca pra
  // getAiQualifyingLimit (densidade populacional, não multiplicador
  // universal). Chamadas do jogador (Tournaments.jsx, weeklyCareerReview.js
  // — recomendação do treinador) não passam a flag, então continuam com a
  // rede larga de sempre — nunca perdem opção de inscrição/progressão.
  const entry = evaluateTournamentEntry(tournament, athlete, { aiFieldContext: Boolean(context.aiFieldContext) });
  const profile = getTournamentChoiceProfile(tournament, resolveEntryRank(athlete));
  const energy = Number(athlete.energy ?? 100);
  const travelLoad = tournament?.world_region && context.currentRegion && tournament.world_region !== context.currentRegion ? 7 : 2;
  const duration = Math.max(3, Number(tournament?.end_date && tournament?.start_date ?
    (new Date(tournament.end_date) - new Date(tournament.start_date)) / 86400000 + 1 : 5));
  const fatigueIncrease = Math.round(Math.min(35, duration * 1.6 + travelLoad + Math.max(0, 60 - energy) * .12));
  const semifinalChance = Math.min(95, Math.round(profile.titleChance * 1.5 + 8));
  const finalChance = Math.min(88, Math.round(profile.titleChance * 1.23 + 4));
  return { tournament, entry, ...profile, semifinalChance, finalChance, fatigueIncrease };
}

// Playthrough 5.18-H, Parte C — TAXONOMIA DE "NÃO JOGOU".
//
// Até aqui os DOIS ramos de `rest` devolviam a MESMA frase ("Recuperação
// oferece melhor valor para a carreira"), de modo que "nenhum evento elegível
// nesta semana" era indistinguível de "a dupla preferiu descansar". A 5.18-G
// mediu 98,5% das semanas ociosas da elite caindo em CHOOSE_NONE — um número
// inútil como diagnóstico justamente porque não separava essas causas.
//
// `reasonCode` é metadata de diagnóstico no valor de retorno: não muda
// nenhuma decisão, não persiste nada, e nenhum chamador existente precisa
// mudar (todos leem `decision`/`tournament`/`options`).
export const CHOOSE_NONE_REASONS = Object.freeze({
  NO_EVENTS: 'NO_EVENTS',
  NO_ELIGIBLE_EVENT: 'NO_ELIGIBLE_EVENT',
  REST_POLICY: 'REST_POLICY',
  OTHER: 'OTHER',
});

// Gancho de diagnóstico, só para teste/dev: null em produção (custo zero).
// Existe porque a 5.18-G provou que reconstruir uma decisão de fora produz
// deriva — o registro tem de nascer no instante da decisão.
let choiceObserver = null;
export function setChoiceObserver(fn) {
  choiceObserver = typeof fn === 'function' ? fn : null;
}

export function chooseTournament(events = [], athlete = {}, context = {}) {
  const strategy = context.strategy || athlete.careerStrategy || CAREER_STRATEGIES.BALANCED;
  const weights = WEIGHTS[strategy] || WEIGHTS.balanced;
  const evaluated = events.map((event) => evaluateTournamentChoice(event, athlete, context));
  const options = evaluated
    .filter((option) => option.entry.eligible)
    .map((option) => ({ ...option, score: scoreOption(option, weights) }))
    .sort((a, b) => b.score - a.score);

  const restScore = Math.max(0, 80 - Number(athlete.energy ?? 100)) * 1.4 + Number(context.injuryRisk || 0);
  const restWins = restScore > (options[0]?.score || 0) && context.allowRest !== false;
  let result;
  if (!events.length) {
    result = { decision: 'rest', reasonCode: CHOOSE_NONE_REASONS.NO_EVENTS, reason: 'Nenhum torneio no calendário desta semana.', options, restScore };
  } else if (!options.length) {
    result = { decision: 'rest', reasonCode: CHOOSE_NONE_REASONS.NO_ELIGIBLE_EVENT, reason: 'Nenhum torneio elegível nesta semana.', options, restScore };
  } else if (restWins) {
    result = { decision: 'rest', reasonCode: CHOOSE_NONE_REASONS.REST_POLICY, reason: 'Recuperação oferece melhor valor para a carreira.', options, restScore };
  } else {
    result = { decision: 'play', tournament: options[0].tournament, analysis: options[0], options, restScore };
  }
  if (typeof choiceObserver === 'function') {
    choiceObserver({
      decision: result.decision,
      reasonCode: result.reasonCode || null,
      restScore,
      energy: Number(athlete.energy ?? 100),
      injuryRisk: Number(context.injuryRisk || 0),
      entryRank: resolveEntryRank(athlete),
      overall: Number(athlete.overall_rating || athlete.overall || 0) || null,
      chosenTournamentId: result.tournament?.id || null,
      eventsOffered: events.length,
      eligibleCount: options.length,
      bestScore: options[0]?.score ?? null,
      availableEvents: evaluated.map((o) => ({
        tournamentId: o.tournament?.id,
        tier: o.tournament?.tier,
        eligible: Boolean(o.entry?.eligible),
        eligibilityReason: o.entry?.reason || null,
        entryPath: o.entry?.path || null,
        overqualified: Boolean(o.entry?.overqualified),
        expectedPoints: o.expectedPoints,
        prestige: o.prestige,
        titleChance: o.titleChance,
        fatigueIncrease: o.fatigueIncrease,
        finalChoiceScore: o.entry?.eligible ? scoreOption(o, weights) : null,
      })),
    });
  }
  return result;
}

function scoreOption(option, weights) {
  const normalizedNet = Math.max(0, Math.min(100, 50 + option.expectedNet / 150));
  const normalizedPoints = Math.max(0, Math.min(100, option.expectedPoints / 8));
  return Math.round(
    normalizedNet * weights.net + normalizedPoints * weights.points + option.prestige * weights.prestige +
    option.titleChance * weights.title - option.fatigueIncrease * weights.fatigue
  );
}
