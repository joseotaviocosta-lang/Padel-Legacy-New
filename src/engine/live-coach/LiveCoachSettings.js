export const LIVE_COACH_LIMITS = Object.freeze({ minimumPointsBeforeSuggestion:4,minimumGamesBetweenSimilarSuggestions:2,maximumSuggestionsPerSet:3,maximumAutomaticAlertsPerGame:1 });
export const DEFAULT_LIVE_COACH_SETTINGS = Object.freeze({ liveCoachEnabled:true,suggestionFrequency:'normal',allowMinorAutoAdjustments:false,showLiveMetrics:true,showConfidence:true,pauseOnImportantSuggestion:true });
export const normalizeLiveCoachSettings = (value={}) => ({...DEFAULT_LIVE_COACH_SETTINGS,...value,liveCoachEnabled:value.liveCoachEnabled!==false,allowMinorAutoAdjustments:Boolean(value.allowMinorAutoAdjustments)});
export const suggestionFrequencyMultiplier = value => ({minimal:1.5,normal:1,frequent:.75,sets_only:1,disabled:Infinity}[value] ?? 1);
