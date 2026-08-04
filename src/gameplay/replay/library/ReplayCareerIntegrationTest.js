import { sampleReplay } from '../fixtures/sampleReplay.js';
import { ReplayLibrary } from './ReplayLibrary.js';
import { MemoryReplayBackend } from './ReplayLibraryBackend.js';
import { MatchViewPreferences } from './MatchViewPreferences.js';
import { createCareerReplayLinks, highlightReferences } from './ReplayCareerLinks.js';

const clone=(value)=>structuredClone(value);
export async function runReplayCareerIntegrationTest(){
  const backend=new MemoryReplayBackend();const library=new ReplayLibrary({backend});
  const preferences=new MatchViewPreferences({isSupported:()=>false});await preferences.save('career-a',{default_match_view_mode:'2d'});const defaultModePersisted=(await preferences.load('career-a')).default_match_view_mode==='2d';
  const first=clone(sampleReplay);first.replay_id='career-a-final';await library.save(first,{career_id:'career-a',tournament_name:'Crown Final',is_final:true,score:'6-4 6-3'},{force:true});
  const replaySaved=Boolean(await backend.exists('replays/career-a/career-a-final.json'));const listed=await library.list('career-a',{search:'crown'});const metadataIndexed=listed.total===1&&listed.items[0].highlight_ids.length>=0;const libraryFiltered=listed.items.length===1;
  const refs=highlightReferences(listed.items[0]);const highlightsPlayable=refs.every((item)=>item.replay_id==='career-a-final'&&item.end>=item.start);const journalLinked=createCareerReplayLinks(listed.items[0])?.journal?.to.includes('career-a-final');
  const second=clone(sampleReplay);second.replay_id='career-b-match';await library.save(second,{career_id:'career-b'},{force:true});const careersIsolated=(await library.list('career-a')).total===1&&(await library.list('career-b')).total===1;
  const cleanup=await library.cleanup('career-a',0);const storageLimitRespected=!cleanup.limitRespected&&cleanup.removed.length===0;
  await backend.write('replays/career-b/career-b-match.json','{"broken":true}');let corruptedReplayHandled=false;try{await library.load('career-b','career-b-match');}catch(error){corruptedReplayHandled=error.code==='CORRUPTED_REPLAY'&&(await library.list('career-a')).total===1;}
  const result={defaultModePersisted,replaySaved,metadataIndexed,libraryFiltered,highlightsPlayable,journalLinked,storageLimitRespected,corruptedReplayHandled,careersIsolated};return {ok:Object.values(result).every(Boolean),...result};
}
if(typeof window!=='undefined')window.PadelReplayCareerIntegrationTest={run:runReplayCareerIntegrationTest};
