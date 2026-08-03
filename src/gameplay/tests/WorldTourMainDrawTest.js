import { createMainDrawState, recordMainDrawResult, buildMainDrawBracketHistory } from '../worldTour/MainDrawManager.js';
export function runWorldTourMainDrawTest(){
 const rounds=['R32','R16','Quartas','Semifinal','Final'].map(label=>({label}));
 let state=createMainDrawState({tournament:{id:'test',start_date:'2028-02-01',main_draw_size:32},profile:{id:'p1',sport_name:'Teste'},partner:{name:'Parceiro'},teamRank:12,rounds});
 if(state.drawSize!==32||state.roundLabels.length!==5) throw new Error('Chave inválida');
 for(let i=0;i<5;i++) state=recordMainDrawResult(state,{won:true,teamA:'A',teamB:'B',winner:'A',score:'6-4 6-3'});
 if(!state.champion||buildMainDrawBracketHistory(state).length!==5) throw new Error('Título não registrado');
 return {ok:true,drawSize:state.drawSize,seed:state.playerSeed,status:state.status};
}
if(typeof window!=='undefined') window.PadelWorldTourMainDrawTest={run:runWorldTourMainDrawTest};
