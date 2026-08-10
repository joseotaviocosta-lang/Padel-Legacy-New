// Simulador de pacing por dificuldade de carreira. Roda milhares de
// carreiras sintéticas (mesmo motor/cenários de scripts/test-massive-careers-v32.mjs)
// uma vez por dificuldade (easy/normal/hard), aplicando os multiplicadores
// REAIS de src/gameplay/difficulty/difficultyConfig.js — não uma cópia
// re-adivinhada — para medir em quantas temporadas cada dificuldade atinge o
// "auge" de carreira (ver src/gameplay/difficulty/careerPeak.js).
//
// Uso: node scripts/test-career-difficulty-pace.mjs [--runs=100] [--seasons=16] [--output=reports/career-difficulty-pace.json]
import fs from 'node:fs';
import path from 'node:path';
import { buildInitialProfile } from '../src/lib/initialCareerProfiles.js';
import { TRAINING_FOCUSES, TRAINING_INTENSITIES, getTrainingWeights } from '../src/lib/trainingCatalog.js';
import { generateFictionalAthletes } from '../src/players/athleteGenerator.js';
import { evaluatePartnerCompatibility, calculatePartnershipInterest } from '../src/players/teamCompatibility.js';
import { ALLOWED_CAREER_DIFFICULTIES, getDifficultyModifier } from '../src/gameplay/difficulty/difficultyConfig.js';
import { detectPeakSeason } from '../src/gameplay/difficulty/careerPeak.js';

const args = Object.fromEntries(process.argv.slice(2).map(v => v.replace(/^--/, '').split('=')));
const runs = Math.max(1, Number(args.runs || 100));
const seasons = Math.max(1, Number(args.seasons || 16));
const outputFile = args.output || 'reports/career-difficulty-pace.json';
const WEEKS = 48;
const ATTRS = ['serve','forehand','backhand','volley','bandeja','smash','defense','agility','strategy','emotional_control'];
const MAX_XP = 100000;
const XP_CURVE = 1.85;

const clamp = (v,min=0,max=100)=>Math.max(min,Math.min(max,Number(v)||0));
const round = (v,d=2)=>Number(Number(v||0).toFixed(d));
function hash(seed){let h=2166136261;for(const ch of String(seed)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
function rngFactory(seed){let s=hash(seed)||1;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return(s>>>0)/4294967296;};}
function levelForXp(xp){if(xp>=MAX_XP)return 50;let low=1,high=50;while(low<high){const mid=Math.ceil((low+high)/2);const need=Math.round(MAX_XP*Math.pow((mid-1)/49,XP_CURVE));if(need<=xp)low=mid;else high=mid-1;}return low;}
function overall(p){return Math.round(ATTRS.reduce((s,k)=>s+clamp(p[k]),0)/ATTRS.length);}
function styleKey(p){const t=`${p.play_style||''} ${p.tactical_role||''}`.toLowerCase();if(/ofens|finaliz|pot[eê]ncia|agress/.test(t))return'offensive';if(/defens|contra/.test(t))return'defensive';if(/control|construtor|t[aá]tic/.test(t))return'control';return'balanced';}
const PREF={offensive:new Set(['smash','volley','bandeja','serve']),defensive:new Set(['defense','agility','backhand','emotional_control']),control:new Set(['strategy','forehand','backhand','volley']),balanced:new Set(ATTRS)};
function ceiling(p,k){const potential=clamp(p.potential??72,45,99);const base=47+potential*.48;const preferred=PREF[styleKey(p)].has(k);const initial=Number(p.initial_attributes?.[k]);const init=Number.isFinite(initial)?clamp((initial-10)*.18,-2,2):0;const spec=styleKey(p)==='balanced'?0:preferred?2.5:-1.5;return Math.round(clamp(base+spec+init,65,98));}
function avgCeiling(p){return ATTRS.reduce((s,k)=>s+ceiling(p,k),0)/ATTRS.length;}
function ageMult(age){return age<=18?1.34:age<=22?1.24:age<=26?1.06:age<=30?.86:age<=35?.68:.48;}
function dim(n){return n<=1?1:n===2?.82:n===3?.66:.5;}
function weighted(p,w){let a=0,b=0;for(const[k,v]of Object.entries(w)){a+=clamp(p[k])*v;b+=v;}return b?a/b:0;}

// Todas as fórmulas abaixo espelham scripts/test-massive-careers-v32.mjs; a
// única diferença é a multiplicação por getDifficultyModifier(difficultyId, ...)
// nos pontos exatos onde src/lib/trainingSystemV2.js, src/lib/career.js,
// src/game-core/*Lifecycle.js e src/lib/economy.js aplicam os mesmos multiplicadores
// no jogo real (ver plano de implementação para o mapeamento arquivo-a-arquivo).
function trainingPreview(p,t,intensityId,count,difficultyId){
  const i=TRAINING_INTENSITIES.find(x=>x.id===intensityId)||TRAINING_INTENSITIES[1];
  const w=getTrainingWeights(t);const current=weighted(p,w);
  const avgCeil=Object.entries(w).reduce((s,[k,v])=>s+ceiling(p,k)*v,0)/Object.values(w).reduce((a,b)=>a+b,0);
  const remaining=Math.max(0,avgCeil-current);const dev=remaining>=15?1:remaining>=8?.82:remaining>=4?.58:remaining>=1?.3:.08;
  const level=clamp(1.18-current*.0065,.42,1.12);const fatigue=clamp(1-p.fatigue*.006,.45,1);const pot=clamp(.9+p.potential/520,.92,1.11);
  const style=(()=>{const txt=`${p.play_style} ${p.tactical_role}`.toLowerCase();const ids=new Set();if(/ofens|finaliz/.test(txt))['court-net-control','court-aerials','court-finishing','physical-power'].forEach(x=>ids.add(x));if(/control|construtor/.test(txt))['court-groundstrokes','court-serve-return','mental-concentration','tactical-strategy'].forEach(x=>ids.add(x));if(/defens|contra/.test(txt))['court-defense-transition','physical-agility','mental-pressure'].forEach(x=>ids.add(x));return ids.has(t.id)?1.08:1;})();
  const staff=p.staffTraining||1;const coach=1+Math.min(.15,(p.coachQuality||0)*.0012);
  const difficultyTraining=getDifficultyModifier(difficultyId,'trainingGainMultiplier');
  const budget=Math.max(.03,t.baseGainBudget*i.gainMult*level*fatigue*pot*ageMult(p.age)*dev*dim(count+1)*style*staff*coach*difficultyTraining);
  const adjusted=Object.fromEntries(Object.entries(w).map(([k,v])=>[k,v*(1+Math.max(0,45-p[k])*.004)]));
  const tw=Object.values(adjusted).reduce((a,b)=>a+b,0);const gains=Object.fromEntries(Object.entries(adjusted).map(([k,v])=>[k,budget*v/tw]));
  const energyAfter=Math.max(0,p.energy-i.energyCost);
  const fr=p.fatigue<=55?0:p.fatigue<=75?(p.fatigue-55)*.00005:.001+(p.fatigue-75)*.00014;
  const er=energyAfter>=30?0:(30-energyAfter)*.00007;
  const risk=Math.min(.022,(i.injuryRisk+fr+er)*(p.injuryMult||1)*getDifficultyModifier(difficultyId,'injuryRiskMultiplier'));
  const fatigueCost=(i.fatigueCost+(t.fatigueExtra||0))*getDifficultyModifier(difficultyId,'fatigueGainMultiplier');
  const xp=Math.round(t.xp*getDifficultyModifier(difficultyId,'careerXpMultiplier'));
  return{gains,energy:i.energyCost,fatigue:fatigueCost,risk,xp,coins:t.coins};
}
function applyTraining(p,t,intensity,count,rng,difficultyId){
  const x=trainingPreview(p,t,intensity,count,difficultyId);if(p.energy<x.energy)return false;
  for(const[k,g]of Object.entries(x.gains)){p.progress[k]=(p.progress[k]||0)+g;while(p.progress[k]>=1&&p[k]<ceiling(p,k)){p[k]++;p.progress[k]-=1;}if(p[k]>=ceiling(p,k))p.progress[k]=Math.min(p.progress[k],.99);}
  p.energy-=x.energy;p.fatigue=clamp(p.fatigue+x.fatigue);p.xp+=x.xp;p.coins+=x.coins;p.trainings++;
  if(rng()<x.risk){p.injuries++;p.injuryWeeks+=1+Math.floor(rng()*2);p.energy=0;p.fatigue=clamp(p.fatigue+15);}
  return true;
}
function pointsAtRank(rank){const a=[[1,13000],[10,9130],[24,3110],[50,2050],[100,1200],[200,650],[350,340],[500,200],[750,65],[1000,1]];for(let i=0;i<a.length-1;i++){const[r1,p1]=a[i],[r2,p2]=a[i+1];if(rank>=r1&&rank<=r2){const t=(rank-r1)/(r2-r1);return Math.round(p1+(p2-p1)*t);}}return 1;}
function rankForPoints(points){if(points<=0)return 1001;for(let rank=1;rank<=1000;rank++)if(points>=pointsAtRank(rank))return rank;return 1000;}
function choosePartner(p,pool,rng,force=false){
  const candidates=pool.filter(x=>x.career_status==='ativo'&&x.id!==p.partner?.id&&Math.abs((x.overall||50)-overall(p))<=24);
  const scored=candidates.map(c=>{const comp=evaluatePartnerCompatibility(p,c);const interest=calculatePartnershipInterest(p,c,comp);return{c,comp,interest,score:comp.total*.7+interest.score*.3+(rng()-.5)*6};}).filter(x=>x.interest.available&&(force||x.interest.score>=20)).sort((a,b)=>b.score-a.score);
  const best=scored[0];if(!best)return false;
  if(!force&&p.partner){const cur=evaluatePartnerCompatibility(p,p.partner);if(best.score<cur.total+10)return false;}
  p.partner={...best.c,overall:Math.max(Number(best.c.overall)||45,Math.max(10,overall(p)-4+Math.round((rng()-.5)*8)))};
  p.partnerCompatibility=best.comp.total;p.chemistry=50;p.trust=55;p.morale=60;p.partnerChanges++;return true;
}
function selectTraining(p,strategy,counts,rng){
  const list=TRAINING_FOCUSES.filter(t=>!t.requiresPartner||p.partner);
  return list.map(t=>{const w=getTrainingWeights(t);let s=100-weighted(p,w);
    if(strategy==='aggressive'&&['court-finishing','court-aerials','physical-power','court-net-control'].includes(t.id))s+=20;
    if(strategy==='defensive'&&['court-defense-transition','physical-agility','mental-pressure'].includes(t.id))s+=20;
    if(strategy==='balanced'&&['court-groundstrokes','court-serve-return','tactical-strategy'].includes(t.id))s+=8;
    if(strategy==='chemistry'&&t.groupId==='tactical')s+=24;
    s-=(counts[t.id]||0)*11;return{t,s:s+(rng()-.5)*7};}).sort((a,b)=>b.s-a.s)[0].t;
}
// Mesmos 10 arquétipos de test-massive-careers-v32.mjs — já cobrem a
// variedade de perfis pedida (casual, eficiente, agressivo, defensivo,
// conservador, foco em competição, excesso de treino etc.).
const scenarios=[
  {id:'casual-right-control',label:'Casual direita controle',build:{handedness:'right',preferredSide:'direita',playStyle:'controle'},strategy:'balanced',sessions:3,events:12,potential:78,spend:.55},
  {id:'efficient-right-control',label:'Eficiente direita controle',build:{handedness:'right',preferredSide:'direita',playStyle:'controle'},strategy:'balanced',sessions:4,events:18,potential:85,spend:.7},
  {id:'lefty-right-offense',label:'Canhoto ofensivo direita',build:{handedness:'left',preferredSide:'direita',playStyle:'ofensivo'},strategy:'aggressive',sessions:5,events:22,potential:89,spend:.8},
  {id:'left-finisher',label:'Finalizador esquerda',build:{handedness:'right',preferredSide:'esquerda',playStyle:'finalizador'},strategy:'aggressive',sessions:5,events:24,potential:91,spend:.85},
  {id:'right-defensive',label:'Defensivo direita',build:{handedness:'right',preferredSide:'direita',playStyle:'defensivo'},strategy:'defensive',sessions:4,events:17,potential:83,spend:.65},
  {id:'versatile-balanced',label:'Versátil equilibrado',build:{handedness:'right',preferredSide:'versatil',playStyle:'equilibrado'},strategy:'balanced',sessions:4,events:19,potential:84,spend:.7},
  {id:'chemistry-focused',label:'Foco em dupla',build:{handedness:'right',preferredSide:'direita',playStyle:'construtor'},strategy:'chemistry',sessions:4,events:18,potential:82,spend:.7},
  {id:'economy-conservative',label:'Conservador financeiro',build:{handedness:'right',preferredSide:'direita',playStyle:'controle'},strategy:'balanced',sessions:3,events:14,potential:80,spend:.35},
  {id:'competition-heavy',label:'Foco em competição',build:{handedness:'left',preferredSide:'direita',playStyle:'ofensivo'},strategy:'aggressive',sessions:3,events:28,potential:88,spend:.8},
  {id:'overtraining',label:'Excesso de treino',build:{handedness:'right',preferredSide:'esquerda',playStyle:'finalizador'},strategy:'aggressive',sessions:7,events:18,potential:88,spend:.75},
];
const pool=generateFictionalAthletes({count:2200,seed:'career-difficulty-pace'});

function simulateDifficulty(difficultyId){
  const careers=[];
  const trainingXpMult=getDifficultyModifier(difficultyId,'careerXpMultiplier');
  const rankingMult=getDifficultyModifier(difficultyId,'rankingPointsMultiplier');
  const prizeMult=getDifficultyModifier(difficultyId,'prizeMultiplier');
  const costMult=getDifficultyModifier(difficultyId,'costMultiplier');
  const recoveryMult=getDifficultyModifier(difficultyId,'recoveryMultiplier');
  const fatigueMatchMult=getDifficultyModifier(difficultyId,'fatigueGainMultiplier');
  const coachAccessMult=getDifficultyModifier(difficultyId,'coachRequirementMultiplier');
  for(const scenario of scenarios){for(let run=0;run<runs;run++){
    const rng=rngFactory(`${difficultyId}:${scenario.id}:${run}`);
    const b=buildInitialProfile({...scenario.build,careerDifficultyId:difficultyId});
    const p={id:`${difficultyId}-${scenario.id}-${run}`,...b,...b.attributes,initial_attributes:{...b.attributes},age:16,potential:scenario.potential,
      energy:100,fatigue:0,xp:0,coins:1500,rankingPoints:0,rank:1001,reputation:1,progress:{},
      partner:null,partnerCompatibility:0,chemistry:50,trust:55,morale:60,partnerChanges:0,
      trainings:0,matches:0,wins:0,titles:0,injuries:0,injuryWeeks:0,
      coachQuality:0,staffTraining:1,injuryMult:1,monthlyCosts:0,seasonSnapshots:[],
      top500:null,top100:null,top20:null,top10:null,number1:null,bankruptMonths:0};
    p.avgCeiling=avgCeiling(p);
    choosePartner(p,pool,rng,true);
    for(let season=1;season<=seasons;season++){
      const startOv=overall(p),startCoins=p.coins,startRank=p.rank;
      let seasonMatches=0,seasonWins=0,seasonTraining=0,energySum=0,fatigueSum=0,samples=0;
      const coachThreshold=3500*coachAccessMult;
      if(season>=2&&p.coins>coachThreshold&&rng()<scenario.spend){p.coachQuality=Math.min(95,p.coachQuality+8+Math.floor(rng()*8));p.staffTraining=Math.min(1.18,p.staffTraining+.025);p.injuryMult=Math.max(.6,p.injuryMult-.04);p.coins-=500;}
      p.monthlyCosts=p.coachQuality>0?Math.round((250+Math.round(p.coachQuality*7))*costMult):0;
      for(let week=1;week<=WEEKS;week++){
        if(p.injuryWeeks>0){p.injuryWeeks--;p.energy=Math.min(100,p.energy+35);p.fatigue=Math.max(0,p.fatigue-15);continue;}
        const counts={};let target=Math.max(0,Math.round(scenario.sessions+(rng()-.5)*2));
        if(scenario.id!=='overtraining'&&(p.fatigue>70||p.energy<30))target=Math.min(target,2);
        for(let s=0;s<target;s++){
          const t=selectTraining(p,scenario.strategy,counts,rng);
          const intensity=scenario.id==='overtraining'?(rng()<.72?'intenso':'moderado'):(p.energy>65&&p.fatigue<30&&rng()<.2?'intenso':p.energy<35||p.fatigue>60?'leve':'moderado');
          if(applyTraining(p,t,intensity,counts[t.id]||0,rng,difficultyId)){counts[t.id]=(counts[t.id]||0)+1;seasonTraining++;}
        }
        const eventChance=scenario.events/WEEKS;let eventThisWeek=false;
        if(rng()<eventChance&&p.partner){
          eventThisWeek=true;const ov=overall(p);const stageBias=Math.min(18,Math.log10(Math.max(1,p.rankingPoints+1))*5);
          const opp=clamp(ov+(rng()-.5)*18+stageBias,25,97);
          const team=(ov+(p.partner.overall||50))/2+(p.partnerCompatibility-70)*.06+(p.chemistry-50)*.025+(p.trust-50)*.015;
          const winProb=1/(1+Math.exp(-(team-opp)/7.5));const won=rng()<winProb;
          seasonMatches++;p.matches++;if(won){seasonWins++;p.wins++;}
          const category=p.rank<=100?'premier':p.rank<=350?'challenger':'future';
          const base=category==='premier'?160:category==='challenger'?75:28;
          const points=Math.round((won?Math.round(base*(1.1+rng()*1.8)):Math.round(base*(.08+rng()*.35)))*rankingMult);
          p.rankingPoints=Math.max(0,p.rankingPoints+points);p.rank=rankForPoints(p.rankingPoints);
          const basePrize=category==='premier'?(won?2200:400):category==='challenger'?(won?900:180):(won?300:65);
          p.coins+=Math.round(basePrize*prizeMult);
          p.xp+=Math.round((won?140:70)*trainingXpMult);
          p.reputation+=won?1.2:.2;
          p.energy=Math.max(0,p.energy-14);p.fatigue=clamp(p.fatigue+9*fatigueMatchMult);
          p.chemistry=clamp(p.chemistry+(won?1:.35));p.trust=clamp(p.trust+(won?.6:-.2));p.morale=clamp(p.morale+(won?2:-1.5));
          if(won&&rng()<(category==='premier'?.025:category==='challenger'?.045:.07)){p.titles++;p.xp+=Math.round(500*trainingXpMult);p.coins+=Math.round((category==='premier'?6000:category==='challenger'?2200:700)*prizeMult);p.reputation+=4;}
        }
        p.xp+=Math.round((scenario.id==='casual-right-control'?30:55)*trainingXpMult);
        p.coins+=scenario.id==='economy-conservative'?20:35;
        const active=Math.min(7,target+(eventThisWeek?1:0));const rest=Math.max(0,7-active);
        p.energy=Math.min(100,p.energy+rest*22*recoveryMult);p.fatigue=Math.max(0,p.fatigue-rest*9*recoveryMult);
        const sponsorMonthly=80+Math.max(0,1000-p.rank)*.35+p.reputation*8;
        p.coins+=(sponsorMonthly-p.monthlyCosts)/4.345;
        if(p.coins<0){p.bankruptMonths++;p.coins=Math.max(-5000,p.coins);}
        energySum+=p.energy;fatigueSum+=p.fatigue;samples++;
        if(week===24&&(p.partnerCompatibility<62||p.trust<35||rng()<.03))choosePartner(p,pool,rng,false);
      }
      p.rankingPoints=Math.round(p.rankingPoints*.80);p.rank=rankForPoints(p.rankingPoints);p.age++;
      if(p.partner)p.partner.overall=Math.min(96,Math.max(p.partner.overall,overall(p)-5)+Math.round(rng()*2));
      if(season%2===0&&rng()<.22)choosePartner(p,pool,rng,false);
      const lvl=levelForXp(p.xp);
      if(!p.top500&&p.rank<=500)p.top500=season;if(!p.top100&&p.rank<=100)p.top100=season;if(!p.top20&&p.rank<=20)p.top20=season;if(!p.top10&&p.rank<=10)p.top10=season;if(!p.number1&&p.rank===1)p.number1=season;
      p.seasonSnapshots.push({season,age:p.age,overall:overall(p),ceiling:p.avgCeiling,overallGain:overall(p)-startOv,careerLevel:lvl,rank:p.rank,rankGain:startRank-p.rank,points:p.rankingPoints,coins:Math.round(p.coins),coinDelta:Math.round(p.coins-startCoins),matches:seasonMatches,wins:seasonWins,winRate:seasonMatches?seasonWins/seasonMatches:0,trainings:seasonTraining,avgEnergy:samples?energySum/samples:0,avgFatigue:samples?fatigueSum/samples:0,injuries:p.injuries,partnerChanges:p.partnerChanges,coachQuality:p.coachQuality});
    }
    const peakSeason=detectPeakSeason(p.seasonSnapshots);
    careers.push({...p,scenarioId:scenario.id,finalOverall:overall(p),careerLevel:levelForXp(p.xp),peakSeason});
  }}
  return careers;
}

function avg(rows,key){const v=rows.map(x=>Number(typeof key==='function'?key(x):x[key])).filter(Number.isFinite);return v.length?v.reduce((a,b)=>a+b,0)/v.length:0;}
function percentile(rows,key,p){const v=rows.map(x=>Number(typeof key==='function'?key(x):x[key])).filter(x=>Number.isFinite(x)&&x>0).sort((a,b)=>a-b);if(!v.length)return null;const idx=Math.min(v.length-1,Math.max(0,Math.round((p/100)*(v.length-1))));return v[idx];}
function median(rows,key){return percentile(rows,key,50);}

// Faixas-alvo de auge (mediana), com margem de outlier — ver plano de
// implementação §27/§28.
const PEAK_TARGETS={easy:{min:2,max:4,outlierLow:1,outlierHigh:6},normal:{min:5,max:7,outlierLow:3,outlierHigh:9},hard:{min:8,max:10,outlierLow:5,outlierHigh:12}};

const report={generatedAt:new Date().toISOString(),configuration:{runs,seasons,scenarios:scenarios.length,perDifficulty:runs*scenarios.length},byDifficulty:{},findings:[]};
for(const difficultyId of ALLOWED_CAREER_DIFFICULTIES){
  const careers=simulateDifficulty(difficultyId);
  const target=PEAK_TARGETS[difficultyId];
  const peakMedian=median(careers,'peakSeason');
  const peakP25=percentile(careers,'peakSeason',25);
  const peakP75=percentile(careers,'peakSeason',75);
  const neverPeaked=careers.filter(c=>!c.peakSeason).length;
  const outliersSlow=careers.filter(c=>c.peakSeason&&c.peakSeason>target.outlierHigh).length;
  const outliersFast=careers.filter(c=>c.peakSeason&&c.peakSeason<target.outlierLow).length;
  const bankruptRate=round(careers.filter(c=>c.bankruptMonths>0).length/careers.length*100,1);
  const stagnant=careers.filter(c=>!c.top500).length;
  const summary={
    difficultyId,
    careers:careers.length,
    peak:{median:peakMedian,p25:peakP25,p75:peakP75,neverPeakedRate:round(neverPeaked/careers.length*100,1)},
    top100Median:median(careers,'top100'),
    top20Median:median(careers,'top20'),
    top10Median:median(careers,'top10'),
    top500Median:median(careers,'top500'),
    finalOverall:round(avg(careers,'finalOverall'),1),
    overallCeilingRatio:round(avg(careers,c=>c.finalOverall/c.avgCeiling),3),
    coins:Math.round(avg(careers,'coins')),
    bankruptRate,
    stagnationRate:round(stagnant/careers.length*100,1),
    injuries:round(avg(careers,'injuries'),1),
    avgFatigue:round(avg(careers,c=>avg(c.seasonSnapshots,'avgFatigue')),1),
    outliers:{tooSlow:outliersSlow,tooFast:outliersFast,tooSlowPct:round(outliersSlow/careers.length*100,1),tooFastPct:round(outliersFast/careers.length*100,1)},
  };
  report.byDifficulty[difficultyId]=summary;
  if(peakMedian==null||peakMedian<target.min||peakMedian>target.max){
    report.findings.push({severity:'high',code:'PEAK_MEDIAN_OUT_OF_RANGE',difficultyId,value:peakMedian,target:`${target.min}-${target.max}`});
  }
  if(summary.outliers.tooSlowPct>15) report.findings.push({severity:'medium',code:'TOO_MANY_SLOW_OUTLIERS',difficultyId,value:summary.outliers.tooSlowPct});
  if(summary.outliers.tooFastPct>15) report.findings.push({severity:'medium',code:'TOO_MANY_FAST_OUTLIERS',difficultyId,value:summary.outliers.tooFastPct});
  if(bankruptRate>20) report.findings.push({severity:'high',code:'ECONOMY_BANKRUPTCY',difficultyId,value:bankruptRate});
  if(summary.injuries<=0) report.findings.push({severity:'high',code:'INJURIES_ELIMINATED',difficultyId,value:summary.injuries});
  if(summary.overallCeilingRatio>1.02) report.findings.push({severity:'high',code:'CEILING_EXCEEDED',difficultyId,value:summary.overallCeilingRatio});
}
// Comparação final (informativa, não é uma falha): hard pode receber um
// ajuste leve de treino/XP em relação ao jogo sem nenhum multiplicador
// (difficultyId=null) para corrigir o pacing atual, que hoje ultrapassa a
// meta de 8-10 temporadas — ver §46 do plano. O ajuste deve ser pequeno:
// sinalizamos apenas se a diferença for grande demais para ainda ser "o
// jogo atual, levemente refinado".
const neutralCareers=simulateDifficulty(null);
const hardCareers=simulateDifficulty('hard');
report.hardVsNeutral={
  hardPeakMedian:median(hardCareers,'peakSeason'),
  neutralPeakMedian:median(neutralCareers,'peakSeason'),
  hardFinalOverall:round(avg(hardCareers,'finalOverall'),1),
  neutralFinalOverall:round(avg(neutralCareers,'finalOverall'),1),
};
if(report.hardVsNeutral.neutralPeakMedian&&report.hardVsNeutral.hardPeakMedian&&report.hardVsNeutral.hardPeakMedian<report.hardVsNeutral.neutralPeakMedian*0.6){
  report.findings.push({severity:'high',code:'HARD_TOO_FAR_FROM_CURRENT_GAME',value:report.hardVsNeutral});
}

fs.mkdirSync(path.dirname(path.resolve(outputFile)),{recursive:true});
fs.writeFileSync(path.resolve(outputFile),JSON.stringify(report,null,2));
console.log(JSON.stringify({configuration:report.configuration,byDifficulty:report.byDifficulty,hardVsNeutral:report.hardVsNeutral,findings:report.findings},null,2));
if(report.findings.some(f=>f.severity==='high')) process.exitCode=1;
