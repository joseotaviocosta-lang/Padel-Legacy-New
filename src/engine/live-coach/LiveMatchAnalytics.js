const emptyShots=()=>({serve:0,drive:0,backhand:0,lob:0,volley:0,bandeja:0,smash:0,chiquita:0});
const average=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:0;
export class LiveMatchAnalytics {
  constructor(snapshot){this.state=snapshot||{points:[],shots:{A:emptyShots(),B:emptyShots()},players:{},sets:{},games:0};}
  ingest({pointNumber,result,teams,scoreBefore,scoreAfter}){
    const shots=result.rallyMemory||[]; for(const shot of shots){this.state.shots[shot.team][shot.shot]=(this.state.shots[shot.team][shot.shot]||0)+1;const row=this.state.players[shot.playerId]||(this.state.players[shot.playerId]={shots:0,targets:0,errors:0,winners:0});row.shots+=1;if(shot.targetPlayerId){const target=this.state.players[shot.targetPlayerId]||(this.state.players[shot.targetPlayerId]={shots:0,targets:0,errors:0,winners:0});target.targets+=1;}}
    const finisher=this.state.players[result.finisher?.id]||(this.state.players[result.finisher?.id]={shots:0,targets:0,errors:0,winners:0}); if(result.result==='error')finisher.errors+=1;else finisher.winners+=1;
    const energies=Object.fromEntries(Object.values(teams).flat().map(player=>[player.id,Math.round(player.energy*10)/10]));
    const point={pointNumber,winnerTeamId:result.winnerTeamId,result:result.result,shot:result.shot,rallyLength:result.rallyLength,pressure:result.pressure,forcedError:Boolean(result.forcedError),shots,energies,scoreBefore,scoreAfter};this.state.points.push(point);if(this.state.points.length>240)this.state.points.shift();
    if(scoreBefore.gamesA!==scoreAfter.gamesA||scoreBefore.gamesB!==scoreAfter.gamesB||scoreBefore.setsA!==scoreAfter.setsA||scoreBefore.setsB!==scoreAfter.setsB)this.state.games+=1;return point;
  }
  window(name){const count={last_3_points:3,last_5_points:5,last_game:Math.max(1,this.pointsSinceLastGame()),current_set:60,match:240}[name]||5;return this.state.points.slice(-count);}
  pointsSinceLastGame(){for(let i=this.state.points.length-1;i>=0;i--){const p=this.state.points[i];if(p.scoreBefore.gamesA!==p.scoreAfter.gamesA||p.scoreBefore.gamesB!==p.scoreAfter.gamesB)return this.state.points.length-1-i;}return this.state.points.length;}
  summary(name='last_5_points',team='A'){const points=this.window(name),opponent=team==='A'?'B':'A',shots=points.flatMap(p=>p.shots),teamShots=shots.filter(s=>s.team===team),opponentShots=shots.filter(s=>s.team===opponent);return{window:name,points:points.length,observedEvents:shots.length,pointsWon:points.filter(p=>p.winnerTeamId===team).length,pointsLost:points.filter(p=>p.winnerTeamId!==team).length,errors:points.filter(p=>p.result==='error'&&p.shots.at(-1)?.team===team).length,pressureErrors:points.filter(p=>p.result==='error'&&p.shots.at(-1)?.team===team&&p.pressure>=62).length,longRallies:points.filter(p=>p.rallyLength>=12).length,shots:teamShots,opponentShots,averageEnergy:average(points.flatMap(p=>Object.entries(p.energies).filter(([id])=>teamShots.some(s=>s.playerId===id)).map(([,v])=>v))),shotDistribution:Object.fromEntries(Object.keys(emptyShots()).map(type=>[type,teamShots.filter(s=>s.shot===type).length]))};}
  snapshot(){return JSON.parse(JSON.stringify(this.state));}
}
