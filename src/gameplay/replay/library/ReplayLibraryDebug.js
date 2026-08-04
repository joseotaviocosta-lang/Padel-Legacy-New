import { replayLibrary } from './ReplayLibrary.js';
export const ReplayLibraryDebug={inspectIndex:()=>replayLibrary.readIndex(),findOrphans:()=>replayLibrary.findOrphans(),storage:(careerId)=>replayLibrary.storage(careerId),verify:async(careerId,replayId)=>{try{await replayLibrary.load(careerId,replayId);return {ok:true};}catch(error){return {ok:false,code:error.code,message:error.message};}}};
if(typeof window!=='undefined'&&import.meta.env?.DEV)window.PadelReplayLibraryDebug=ReplayLibraryDebug;
