import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Eye, Film, Heart, Search, Trash2 } from 'lucide-react';
import { useCareer } from '@/careers/useCareer.js';
import { replayLibrary } from '@/gameplay/replay/library/ReplayLibrary.js';
import ReplayPanel from '@/components/matches/ReplayPanel';
import '@/gameplay/replay/library/ReplayCareerIntegrationTest.js';
import '@/gameplay/replay/library/ReplayLibraryDebug.js';

export default function ReplayLibraryPage(){
  const {activeCareer}=useCareer(); const careerId=activeCareer?.career_id; const [items,setItems]=useState([]); const [total,setTotal]=useState(0); const [search,setSearch]=useState(''); const [sort,setSort]=useState('newest'); const [selected,setSelected]=useState(null); const [error,setError]=useState('');
  const refresh=async()=>{if(!careerId)return;const result=await replayLibrary.list(careerId,{search,sort,limit:50});setItems(result.items);setTotal(result.total);};
  useEffect(()=>{refresh().catch(()=>setError('Não foi possível abrir a biblioteca.'));},[careerId,search,sort]);
  async function watch(item){try{setError('');setSelected({item,replay:await replayLibrary.load(careerId,item.replay_id)});}catch(e){setError(e.message);}}
  async function download(item){try{const data=await replayLibrary.export(careerId,item.replay_id);const url=URL.createObjectURL(new Blob([data],{type:'application/json'}));const anchor=document.createElement('a');anchor.href=url;anchor.download=`${item.replay_id}.padel-replay.json`;anchor.click();URL.revokeObjectURL(url);}catch(e){setError(e.message);}}
  return <div className="px-4 md:px-8 py-6 max-w-6xl mx-auto space-y-5">
    <div className="flex items-center justify-between"><div><h1 className="text-2xl font-black flex items-center gap-2"><Film className="text-primary"/>Biblioteca de Replays</h1><p className="text-sm text-muted-foreground">{total} replays desta carreira</p></div><Link to="/matches" className="text-sm text-primary">Voltar às partidas</Link></div>
    <div className="glass rounded-xl p-3 flex gap-2"><label className="flex flex-1 items-center gap-2"><Search className="h-4 w-4"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar torneio, atleta ou placar" className="bg-transparent flex-1 outline-none text-sm"/></label><select value={sort} onChange={e=>setSort(e.target.value)} className="bg-secondary rounded-lg px-2 text-sm"><option value="newest">Mais recentes</option><option value="oldest">Mais antigos</option><option value="importance">Mais importantes</option></select></div>
    {error&&<div className="rounded-xl bg-destructive/10 text-destructive p-3 text-sm">{error}</div>}
    {selected?<div className="space-y-3"><ReplayPanel replay={selected.replay}/><button onClick={()=>setSelected(null)} className="w-full rounded-xl bg-secondary py-2 text-sm font-bold">Fechar replay</button></div>:<div className="grid md:grid-cols-2 gap-3">{items.map(item=><article key={`${item.career_id}-${item.replay_id}`} className="glass rounded-2xl p-4 space-y-3"><div className="flex justify-between gap-3"><div><p className="font-bold">{item.tournament_name}</p><p className="text-xs text-muted-foreground">{item.played_at} · {item.score||'placar indisponível'} · {item.highlight_count} destaques</p></div>{item.is_historical&&<span className="text-[10px] text-amber-400">HISTÓRICO</span>}</div><p className="text-xs">{item.team_a?.names?.join(' & ')} × {item.team_b?.names?.join(' & ')}</p><div className="flex gap-2"><button onClick={()=>watch(item)} className="flex-1 rounded-lg bg-primary text-primary-foreground py-2 text-xs font-bold flex justify-center gap-1"><Eye className="h-3.5 w-3.5"/>Assistir</button><button aria-label="Favoritar" onClick={()=>replayLibrary.favorite(careerId,item.replay_id,!item.is_favorite).then(refresh)} className="rounded-lg bg-secondary p-2"><Heart className={`h-4 w-4 ${item.is_favorite?'fill-red-500 text-red-500':''}`}/></button><button aria-label="Exportar" onClick={()=>download(item)} className="rounded-lg bg-secondary p-2"><Download className="h-4 w-4"/></button><button aria-label="Excluir" onClick={()=>confirm('Excluir este replay? A partida continuará salva.')&&replayLibrary.remove(careerId,item.replay_id).then(refresh)} className="rounded-lg bg-secondary p-2"><Trash2 className="h-4 w-4"/></button></div></article>)}</div>}
    {!selected&&!items.length&&!error&&<div className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">Nenhum replay salvo para esta carreira.</div>}
  </div>;
}
