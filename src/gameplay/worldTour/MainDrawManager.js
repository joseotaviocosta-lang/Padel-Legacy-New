import { buildSeedings } from './EntryManager.js';

function hashString(value = '') { let h = 2166136261; for (let i=0;i<value.length;i+=1){h^=value.charCodeAt(i);h=Math.imul(h,16777619);} return Math.abs(h>>>0); }
function seededRandom(seed){let s=seed||1;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}

export function getDrawSize(tournament = {}, rounds = []) {
  const explicit = Number(tournament.main_draw_size || tournament.draw_size || 0);
  if (explicit > 0) return explicit;
  return Math.max(16, 2 ** Math.max(4, rounds.length));
}

export function createMainDrawState({ tournament, profile, partner, teamRank = 9999, rounds = [], opponentTeams = [] }) {
  const drawSize = getDrawSize(tournament, rounds);
  const player = { id:`player-${profile.id}`, name:`${profile.sport_name || profile.name || 'Jogador'} & ${partner?.name || 'Parceiro'}`, rank:Number(teamRank||9999), isPlayer:true };
  const filler = opponentTeams.map((team,index)=>({ id:team.id||`team-${index+1}`, name:team.name||`Dupla ${index+1}`, rank:Number(team.rank||teamRank+index+1), members:team.members||[], isPlayer:false }));
  while (filler.length < Math.max(rounds.length, drawSize-1)) filler.push({ id:`generated-${filler.length+1}`, name:`Dupla Mundial ${filler.length+1}`, rank:Number(teamRank||9999)+filler.length+20, members:[], isPlayer:false });
  const seeded = buildSeedings([player,...filler.slice(0,drawSize-1)], drawSize);
  const rng = seededRandom(hashString(`${tournament.id}-${profile.id}-${tournament.start_date}-main`));
  const opponents = seeded.filter(e=>!e.isPlayer).sort((a,b)=>(a.seed||999)-(b.seed||999)||rng()-.5).slice(0,rounds.length);
  const playerSeed = seeded.find(e=>e.isPlayer)?.seed || null;
  return { version:1,status:'in_progress',drawSize,currentRound:0,roundLabels:rounds.map(r=>r.label),entrants:seeded,opponents,results:[],playerSeed,champion:false,eliminated:false,createdAt:new Date().toISOString() };
}

export function recordMainDrawResult(state, result) {
  const idx=Number(state.currentRound||0); const next={...state,results:[...(state.results||[]),{...result,roundIndex:idx}]};
  if(!result.won) return {...next,status:'eliminated',eliminated:true,finishRound:idx,finishedAt:new Date().toISOString()};
  if(idx+1 >= (state.roundLabels||[]).length) return {...next,status:'champion',champion:true,finishRound:idx+1,finishedAt:new Date().toISOString()};
  return {...next,currentRound:idx+1};
}

export function getCurrentMainDrawOpponent(state){ return state?.opponents?.[Number(state.currentRound||0)]||null; }
export function buildMainDrawBracketHistory(state){ return (state?.results||[]).map((r,i)=>({round:state.roundLabels?.[i]||`Rodada ${i+1}`,matches:[{team_a:r.teamA,team_b:r.teamB,winner:r.winner,score:r.score||'—'}]})); }
export function getFinishLabel(state){ if(state?.champion)return 'Campeão'; const idx=Number(state?.finishRound||0); return state?.roundLabels?.[idx] ? `Eliminado em ${state.roundLabels[idx]}` : 'Participação'; }
