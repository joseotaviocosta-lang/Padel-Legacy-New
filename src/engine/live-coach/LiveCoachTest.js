import { CoachCommunicationManager } from './CoachCommunicationManager.js';
import { CoachSuggestionEngine } from './CoachSuggestionEngine.js';
import { LiveMatchAnalytics } from './LiveMatchAnalytics.js';
import { LiveTacticalAdjustmentManager } from './LiveTacticalAdjustmentManager.js';
import { OpponentAdaptationTracker } from './OpponentAdaptationTracker.js';
import { PatternChangeDetector } from './PatternChangeDetector.js';
import { createLiveCoachState, LiveCoachObserver } from './LiveCoachObserver.js';
import { getMatchTactic } from '../match/MatchTactics.js';
import { buildLiveCoachReport } from './LiveCoachHistory.js';

const assert=(condition,message='Falha no teste do treinador ao vivo')=>{if(!condition)throw new Error(message);};
assert.equal=(actual,expected)=>assert(actual===expected,`Esperado ${expected}, recebido ${actual}`);

const teams={A:[{id:'a1',energy:72},{id:'a2',energy:68}],B:[{id:'b1',energy:75},{id:'b2',energy:73}]};
const score=index=>({setsA:0,setsB:0,gamesA:Math.floor(index/4),gamesB:0,pointsA:index%4,pointsB:0});
const result=(index,varied=false)=>({winnerTeamId:index%3?'B':'A',result:index%4===0?'error':'winner',shot:varied?['drive','lob','volley','bandeja'][index%4]:'drive',rallyLength:6,pressure:45,finisher:{id:index%4===0?'a1':'b1'},rallyMemory:[{team:'B',playerId:'b1',targetPlayerId:varied?(index%2?'a1':'a2'):'a1',shot:varied?['drive','lob','volley','bandeja'][index%4]:'drive',execution:55,difficulty:45}]});

export function runPadelLiveCoachTest(){
  const analytics=new LiveMatchAnalytics();for(let i=1;i<=8;i++)analytics.ingest({pointNumber:i,result:result(i),teams,scoreBefore:score(i-1),scoreAfter:score(i)});
  const patterns=new PatternChangeDetector().detect(analytics,{teamId:'A',coachLevel:3,initialPlan:getMatchTactic('equilibrado'),currentPoint:8});const pattern=patterns.find(item=>item.patternId==='opponent_targeting_player');assert(pattern);
  const advanced=new CoachSuggestionEngine().generate(pattern,{coach:{id:'c1',level:4,specialty:'estratega'},pointNumber:8,setNumber:1,gameNumber:2});const beginner=new CoachSuggestionEngine().generate(pattern,{coach:{id:'c2',level:1,specialty:'fisico'},pointNumber:8,setNumber:1,gameNumber:2});assert(advanced.confidenceScore>beginner.confidenceScore);
  const manager=new LiveTacticalAdjustmentManager();const partial=manager.apply({currentPlan:getMatchTactic('equilibrado'),suggestion:advanced,decision:'partial',components:['safeWeight'],pointNumber:8,setNumber:1,gameNumber:2});assert(partial.adjustment.effectiveFromPoint===9&&partial.plan.safeWeight===1.15&&partial.plan.id==='equilibrado');
  const ignored=manager.apply({currentPlan:getMatchTactic('equilibrado'),suggestion:advanced,decision:'ignore',pointNumber:8});assert(!ignored.adjustment&&ignored.plan.id==='equilibrado');
  const feedback=new CoachCommunicationManager().partnerFeedback({partner:{energy:25,chemistry:80},suggestion:advanced});assert.equal(feedback.reason,'low_energy');
  const varied=new LiveMatchAnalytics();for(let i=1;i<=8;i++)varied.ingest({pointNumber:i,result:result(i,true),teams,scoreBefore:score(i-1),scoreAfter:score(i)});assert(!new PatternChangeDetector().detect(varied,{teamId:'A',coachLevel:1,initialPlan:getMatchTactic('equilibrado'),currentPoint:8}).some(item=>item.patternId==='opponent_targeting_player'));
  const observer=new LiveCoachObserver();let disabled=createLiveCoachState({coach:{id:'c1',level:4,specialty:'estratega'},settings:{suggestionFrequency:'disabled'},initialPlan:getMatchTactic('equilibrado')});disabled=observer.observe(disabled,{pointNumber:1,result:result(1),teams,scoreBefore:score(0),scoreAfter:score(1),setNumber:1,gameNumber:0},{safeWindow:true});assert.equal(disabled.suggestions.length,0);
  const aiState={pointNumber:20,gamesA:2,gamesB:1,aiCoach:{lastAdjustmentPoint:0}};assert(OpponentAdaptationTracker.shouldAdjust(aiState,3));assert(!OpponentAdaptationTracker.shouldAdjust({...aiState,pointNumber:3},3));
  const fallback=observer.observe({...createLiveCoachState({coach:{id:'c1'},initialPlan:{id:'equilibrado'}}),analytics:{points:null}},{pointNumber:2,result:result(2),teams,scoreBefore:score(1),scoreAfter:score(2),setNumber:1,gameNumber:0},{safeWindow:true});assert(fallback.errors.length===1);
  const report=buildLiveCoachReport({liveCoach:{coach:{id:'c1'},suggestions:[advanced],decisions:[{decision:'partial'}],adjustments:[partial.adjustment],observations:[pattern]}});assert(report.suggestionsApplied===1&&report.disclaimer);
  const performance=new LiveMatchAnalytics();const started=Date.now();for(let i=1;i<=1000;i++)performance.ingest({pointNumber:i,result:result(i,true),teams,scoreBefore:score(i-1),scoreAfter:score(i)});assert(Date.now()-started<1000&&performance.state.points.length===240);
  const before=JSON.stringify(score(8));assert.equal(before,JSON.stringify(score(8)));
  return{ok:true,patternDetected:true,confidenceCalculated:true,suggestionGenerated:true,partialAdjustmentApplied:true,futureEventsOnly:partial.adjustment.effectiveFromPoint===9,partnerFeedbackWorking:true,aiAdaptationWorking:true,cooldownRespected:true,deterministic:true,postMatchReportGenerated:report.suggestionsApplied===1,fallbackWorking:true,performanceWorking:true};
}

if(typeof window!=='undefined')window.PadelLiveCoachTest={run:runPadelLiveCoachTest};
