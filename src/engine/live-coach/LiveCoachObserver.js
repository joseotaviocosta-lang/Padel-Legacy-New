import { LiveMatchAnalytics } from './LiveMatchAnalytics.js';
import { PatternChangeDetector } from './PatternChangeDetector.js';
import { CoachSuggestionEngine } from './CoachSuggestionEngine.js';
import { normalizeLiveCoachSettings, LIVE_COACH_LIMITS, suggestionFrequencyMultiplier } from './LiveCoachSettings.js';

export function createLiveCoachState({ coach = null, settings, initialPlan }) {
  return { coach, settings: normalizeLiveCoachSettings(settings), initialPlan, analytics: null, observations: [], suggestions: [], decisions: [], adjustments: [], pendingSuggestion: null, lastSuggestionByPattern: {}, lastSuggestionPatternId: null, suggestionsBySet: {}, errors: [] };
}

// As tiers reais do catálogo (src/lib/coaches.js: COACH_TIERS) são iniciante/
// regional/profissional/elite/lendario — "basico"/"nacional" nunca existiram
// nos dados e faziam iniciante e profissional caírem os dois no fallback `1`,
// tornando o treinador profissional indistinguível de um iniciante.
const levelOf = (coach) => Number(coach?.level) || ({ iniciante: 1, regional: 2, profissional: 3, elite: 4, lendario: 5 }[String(coach?.tier || '').toLowerCase()] || 1);

export class LiveCoachObserver {
  observe(liveCoach, input, { safeWindow = false } = {}) {
    const next = JSON.parse(JSON.stringify(liveCoach));
    try {
      const analytics = new LiveMatchAnalytics(next.analytics);
      analytics.ingest(input);
      next.analytics = analytics.snapshot();
      if (input.finished || !next.coach || !next.settings.liveCoachEnabled || next.settings.suggestionFrequency === 'disabled' || !safeWindow || next.pendingSuggestion) return next;
      if (input.pointNumber < LIVE_COACH_LIMITS.minimumPointsBeforeSuggestion) return next;
      if (next.settings.suggestionFrequency === 'sets_only' && input.scoreBefore.setsA === input.scoreAfter.setsA && input.scoreBefore.setsB === input.scoreAfter.setsB) return next;
      const coachLevel = levelOf(next.coach);
      const patterns = new PatternChangeDetector().detect(analytics, { teamId: 'A', coachLevel, initialPlan: next.initialPlan, currentPoint: input.pointNumber });
      const confidenceFloor = coachLevel >= 4 ? 0.5 : coachLevel >= 2 ? 0.56 : 0.62;
      const currentGame = analytics.state.games;
      const minGap = Math.ceil(LIVE_COACH_LIMITS.minimumGamesBetweenSimilarSuggestions * suggestionFrequencyMultiplier(next.settings.suggestionFrequency));
      const count = next.suggestionsBySet[input.setNumber] || 0;
      if (count >= LIVE_COACH_LIMITS.maximumSuggestionsPerSet) return next;
      // Repetir a MESMA categoria como sugestão consecutiva (item 13 do
      // hotfix) exige o dobro do cooldown normal — o problema pode ser
      // real e persistente (não vira raro demais), mas o treinador não
      // insiste na mesma frase assim que o cooldown mínimo libera.
      const requiredGap = (patternId) => (patternId === next.lastSuggestionPatternId ? minGap * 2 : minGap);
      const eligible = patterns.filter((candidate) => candidate.confidenceScore >= confidenceFloor && currentGame - (next.lastSuggestionByPattern[candidate.patternId] ?? -999) >= requiredGap(candidate.patternId));
      if (!eligible.length) return next;
      const pattern = eligible.find((candidate) => candidate.patternId !== next.lastSuggestionPatternId) || eligible[0];
      const suggestion = new CoachSuggestionEngine().generate(pattern, { coach: next.coach, pointNumber: input.pointNumber, setNumber: input.setNumber, gameNumber: currentGame });
      if (suggestion.confidenceScore < confidenceFloor) return next;
      suggestion.metricsBefore = analytics.summary('last_2_games', 'A');
      next.observations.push({ ...pattern, gameNumber: currentGame, type: 'coach_observation' });
      next.suggestions.push(suggestion);
      next.pendingSuggestion = suggestion;
      next.lastSuggestionByPattern[pattern.patternId] = currentGame;
      next.lastSuggestionPatternId = pattern.patternId;
      next.suggestionsBySet[input.setNumber] = count + 1;
      return next;
    } catch (error) {
      next.errors.push({ pointNumber: input.pointNumber, message: error.message });
      return next;
    }
  }
}
