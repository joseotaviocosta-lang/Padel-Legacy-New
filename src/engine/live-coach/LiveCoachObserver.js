import { LiveMatchAnalytics } from './LiveMatchAnalytics.js';
import { PatternChangeDetector } from './PatternChangeDetector.js';
import { CoachSuggestionEngine } from './CoachSuggestionEngine.js';
import { normalizeLiveCoachSettings, LIVE_COACH_LIMITS, suggestionFrequencyMultiplier } from './LiveCoachSettings.js';

export function createLiveCoachState({ coach = null, settings, initialPlan }) {
  return { coach, settings: normalizeLiveCoachSettings(settings), initialPlan, analytics: null, observations: [], suggestions: [], decisions: [], adjustments: [], pendingSuggestion: null, lastSuggestionByPattern: {}, suggestionsBySet: {}, errors: [] };
}

const levelOf = (coach) => Number(coach?.level) || ({ basico: 1, regional: 2, nacional: 3, elite: 4, lendario: 5 }[String(coach?.tier || '').toLowerCase()] || 1);

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
      const pattern = patterns.find((candidate) => candidate.confidenceScore >= confidenceFloor);
      if (!pattern) return next;
      const currentGame = analytics.state.games;
      const lastGame = next.lastSuggestionByPattern[pattern.patternId] ?? -999;
      const minGap = Math.ceil(LIVE_COACH_LIMITS.minimumGamesBetweenSimilarSuggestions * suggestionFrequencyMultiplier(next.settings.suggestionFrequency));
      const count = next.suggestionsBySet[input.setNumber] || 0;
      if (currentGame - lastGame < minGap || count >= LIVE_COACH_LIMITS.maximumSuggestionsPerSet) return next;
      const suggestion = new CoachSuggestionEngine().generate(pattern, { coach: next.coach, pointNumber: input.pointNumber, setNumber: input.setNumber, gameNumber: currentGame });
      if (suggestion.confidenceScore < confidenceFloor) return next;
      suggestion.metricsBefore = analytics.summary('last_2_games', 'A');
      next.observations.push({ ...pattern, gameNumber: currentGame, type: 'coach_observation' });
      next.suggestions.push(suggestion);
      next.pendingSuggestion = suggestion;
      next.lastSuggestionByPattern[pattern.patternId] = currentGame;
      next.suggestionsBySet[input.setNumber] = count + 1;
      return next;
    } catch (error) {
      next.errors.push({ pointNumber: input.pointNumber, message: error.message });
      return next;
    }
  }
}
