import { LiveMatchAnalytics } from './LiveMatchAnalytics.js';
import { PatternChangeDetector } from './PatternChangeDetector.js';
import { CoachSuggestionEngine } from './CoachSuggestionEngine.js';
import { normalizeLiveCoachSettings,LIVE_COACH_LIMITS,suggestionFrequencyMultiplier } from './LiveCoachSettings.js';

export function createLiveCoachState({coach=null,settings,initialPlan}) {
  return {coach,settings:normalizeLiveCoachSettings(settings),initialPlan,analytics:null,observations:[],suggestions:[],decisions:[],adjustments:[],pendingSuggestion:null,lastSuggestionByPattern:{},suggestionsBySet:{},errors:[]};
}

const levelOf=coach=>Number(coach?.level)||({basico:1,regional:2,nacional:3,elite:4,lendario:5}[String(coach?.tier||'').toLowerCase()]||1);

export class LiveCoachObserver {
  observe(liveCoach,input,{safeWindow=false}={}) {
    const next=JSON.parse(JSON.stringify(liveCoach));
    try {
      const analytics=new LiveMatchAnalytics(next.analytics);
      analytics.ingest(input);next.analytics=analytics.snapshot();
      if(input.finished||!next.coach||!next.settings.liveCoachEnabled||next.settings.suggestionFrequency==='disabled'||!safeWindow)return next;
      if(next.settings.suggestionFrequency==='sets_only'&&input.scoreBefore.setsA===input.scoreAfter.setsA&&input.scoreBefore.setsB===input.scoreAfter.setsB)return next;
      const patterns=new PatternChangeDetector().detect(analytics,{teamId:'A',coachLevel:levelOf(next.coach),initialPlan:next.initialPlan,currentPoint:input.pointNumber});
      if(!patterns.length)return next;
      const pattern=patterns[0],last=next.lastSuggestionByPattern[pattern.patternId]??-999;
      const minGap=Math.ceil(LIVE_COACH_LIMITS.minimumGamesBetweenSimilarSuggestions*4*suggestionFrequencyMultiplier(next.settings.suggestionFrequency));
      const count=next.suggestionsBySet[input.setNumber]||0;
      if(input.pointNumber-last<minGap||count>=LIVE_COACH_LIMITS.maximumSuggestionsPerSet)return next;
      const suggestion=new CoachSuggestionEngine().generate(pattern,{coach:next.coach,pointNumber:input.pointNumber,setNumber:input.setNumber,gameNumber:input.gameNumber});
      next.observations.push({...pattern,type:'coach_observation'});next.suggestions.push(suggestion);next.pendingSuggestion=suggestion;next.lastSuggestionByPattern[pattern.patternId]=input.pointNumber;next.suggestionsBySet[input.setNumber]=count+1;return next;
    } catch(error) { next.errors.push({pointNumber:input.pointNumber,message:error.message});return next; }
  }
}
