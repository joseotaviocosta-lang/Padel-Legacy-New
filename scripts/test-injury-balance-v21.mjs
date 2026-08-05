import assert from 'node:assert/strict';
import { TRAINING_INTENSITIES } from '../src/lib/trainingCatalog.js';
import { calculateInjuryRisk } from '../src/gameplay/worldTour/PhysicalConditionManager.js';

function hash(seed) { let h = 2166136261; for (const ch of String(seed)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rngFactory(seed) { let s = hash(seed) || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }
const clamp = (v, min=0, max=100) => Math.max(min, Math.min(max, Number(v)||0));

function trainingRisk({ intensityId, fatigue, energy, secondSession=false, staffMultiplier=1 }) {
  const intensity = TRAINING_INTENSITIES.find(x => x.id === intensityId);
  const energyAfter = Math.max(0, energy - intensity.energyCost * (secondSession ? 1.5 : 1));
  const fatigueRisk = fatigue <= 55 ? 0 : fatigue <= 75
    ? (fatigue - 55) * 0.00005
    : 0.001 + (fatigue - 75) * 0.00014;
  const lowEnergyRisk = energyAfter >= 30 ? 0 : (30 - energyAfter) * 0.00007;
  const secondSessionRisk = secondSession ? 0.0004 : 0;
  return Math.min(0.022, (intensity.injuryRisk + fatigueRisk + lowEnergyRisk + secondSessionRisk) * staffMultiplier);
}

const trainingCases = [
  { name:'leve-descansado', intensityId:'leve', fatigue:15, energy:90, expectedMax:0.001 },
  { name:'normal-descansado', intensityId:'moderado', fatigue:25, energy:85, expectedMax:0.0025 },
  { name:'intenso-descansado', intensityId:'intenso', fatigue:30, energy:90, expectedMax:0.006 },
  { name:'normal-fadiga-alta', intensityId:'moderado', fatigue:72, energy:55, expectedMin:0.002, expectedMax:0.006 },
  { name:'intenso-sobrecarga', intensityId:'intenso', fatigue:88, energy:35, secondSession:true, expectedMin:0.006, expectedMax:0.018 },
  { name:'intenso-sobrecarga-medico', intensityId:'intenso', fatigue:88, energy:35, secondSession:true, staffMultiplier:0.55, expectedMax:0.010 },
];

for (const c of trainingCases) {
  const risk = trainingRisk(c);
  if (c.expectedMin != null) assert(risk >= c.expectedMin, `${c.name}: risco ${risk} abaixo do mínimo`);
  if (c.expectedMax != null) assert(risk <= c.expectedMax, `${c.name}: risco ${risk} acima do máximo`);
  c.risk = risk;
}

const tournamentCases = [
  { name:'partida-normal', profile:{energy:72,fatigue:28,condition:75}, load:{energyCost:16}, expectedMax:0.004 },
  { name:'partida-cansado', profile:{energy:38,fatigue:63,condition:68}, load:{energyCost:20}, expectedMin:0.002, expectedMax:0.012 },
  { name:'partida-sobrecarga', profile:{energy:18,fatigue:88,condition:55}, load:{energyCost:25}, expectedMin:0.015, expectedMax:0.05 },
  { name:'partida-sobrecarga-medico', profile:{energy:18,fatigue:88,condition:55,medical_staff_ids:['physio_senior','doctor_sports']}, load:{energyCost:25}, expectedMax:0.035 },
];
for (const c of tournamentCases) {
  const risk = calculateInjuryRisk(c.profile, c.load, false);
  if (c.expectedMin != null) assert(risk >= c.expectedMin, `${c.name}: risco ${risk} abaixo do mínimo`);
  if (c.expectedMax != null) assert(risk <= c.expectedMax, `${c.name}: risco ${risk} acima do máximo`);
  c.risk = risk;
}

function simulateCareer({ seed, weeks=48*10, sessionsPerWeek, intenseShare, matchesPerSeason, disciplined=true, staffMultiplier=1 }) {
  const rng = rngFactory(seed);
  let fatigue=10, energy=100, injuries=0, trainingSessions=0, matches=0;
  for (let week=0; week<weeks; week++) {
    const sessions = Math.max(0, Math.round(sessionsPerWeek + (rng()-.5)));
    for (let i=0;i<sessions;i++) {
      let intensityId = rng()<intenseShare?'intenso':'moderado';
      if (disciplined && (fatigue>65 || energy<45)) intensityId='leve';
      const intensity=TRAINING_INTENSITIES.find(x=>x.id===intensityId);
      const second=i>0;
      const risk=trainingRisk({intensityId,fatigue,energy,secondSession:second,staffMultiplier});
      if(rng()<risk){injuries++; energy=20; fatigue=clamp(fatigue+12); break;}
      energy=clamp(energy-intensity.energyCost*(second?1.5:1));
      fatigue=clamp(fatigue+intensity.fatigueCost);
      trainingSessions++;
      energy=clamp(energy+8); fatigue=clamp(fatigue-3);
    }
    if (rng() < matchesPerSeason/48) {
      const load={energyCost:18};
      energy=clamp(energy-18); fatigue=clamp(fatigue+16); matches++;
      const risk=calculateInjuryRisk({energy,fatigue,condition:72,staff_injury_risk_multiplier:staffMultiplier},load,false);
      if(rng()<risk){injuries++; energy=20; fatigue=clamp(fatigue+12);}
    }
    const restDays=Math.max(1,7-sessions-(matchesPerSeason/48>rng()?1:0));
    energy=clamp(energy+restDays*18); fatigue=clamp(fatigue-restDays*7);
  }
  return {injuries,trainingSessions,matches,injuriesPerSeason:injuries/(weeks/48)};
}

const scenarios=[
  {name:'casual',sessionsPerWeek:2.5,intenseShare:.08,matchesPerSeason:18,disciplined:true,staffMultiplier:1},
  {name:'eficiente',sessionsPerWeek:4,intenseShare:.18,matchesPerSeason:24,disciplined:true,staffMultiplier:.82},
  {name:'agressivo',sessionsPerWeek:5,intenseShare:.42,matchesPerSeason:28,disciplined:true,staffMultiplier:.9},
  {name:'excesso',sessionsPerWeek:7,intenseShare:.7,matchesPerSeason:30,disciplined:false,staffMultiplier:1},
];
const summaries=[];
for(const scenario of scenarios){
  const runs=[];
  for(let i=0;i<80;i++) runs.push(simulateCareer({...scenario,seed:`${scenario.name}:${i}`}));
  const avg=key=>runs.reduce((a,b)=>a+b[key],0)/runs.length;
  summaries.push({...scenario,runs:runs.length,avgInjuries10Seasons:avg('injuries'),injuriesPerSeason:avg('injuriesPerSeason')});
}
const byName=Object.fromEntries(summaries.map(x=>[x.name,x]));
assert(byName.casual.injuriesPerSeason < 0.8, `casual excessivo: ${byName.casual.injuriesPerSeason}`);
assert(byName.eficiente.injuriesPerSeason < 1.1, `eficiente excessivo: ${byName.eficiente.injuriesPerSeason}`);
assert(byName.agressivo.injuriesPerSeason < 1.8, `agressivo excessivo: ${byName.agressivo.injuriesPerSeason}`);
assert(byName.excesso.injuriesPerSeason > byName.agressivo.injuriesPerSeason, 'excesso deve ser mais arriscado que agressivo');
assert(byName.excesso.injuriesPerSeason < 4.5, `excesso ainda exagerado: ${byName.excesso.injuriesPerSeason}`);

console.log(JSON.stringify({trainingCases,tournamentCases,summaries},null,2));
