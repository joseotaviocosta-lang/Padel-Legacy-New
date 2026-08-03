import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Play, Plus, Trash2, Pencil, FlaskConical, UserRound, Archive } from 'lucide-react';
import { useCareer } from '@/careers/useCareer.js';

const positionLabel = (value) => value === 'esquerda' ? 'Esquerda' : value === 'direita' ? 'Direita' : 'A definir';
const styleLabel = (value = '') => !value || value === 'equilibrado' ? 'A definir' : value.charAt(0).toUpperCase() + value.slice(1);

export default function CareerManager() {
  const navigate = useNavigate();
  const { careers, loading, error: providerError, selectCareer, createCareer, renameCareer, duplicateCareer, archiveCareer, deleteCareer } = useCareer();
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const run = async (fn) => { try { setError(''); return await fn(); } catch (e) { setError(e.message || 'Operação não concluída.'); } };
  const create = () => run(async () => {
    setCreating(true);
    try {
      const number = careers.filter(c => !c.archived).length + 1;
      await createCareer({ saveName: `Nova Carreira ${number}`, playerName: 'Novo Atleta', careerType: 'normal' });
      navigate('/game/missions', { replace: true, state: { onboarding: true } });
    } finally { setCreating(false); }
  });
  const play = (id) => run(async () => { await selectCareer(id); navigate('/game'); });
  const rename = (career) => run(async () => { const name = window.prompt('Novo nome da carreira:', career.save_name); if (name?.trim()) await renameCareer(career.id, name); });
  const duplicate = (career) => run(() => duplicateCareer(career.id, { careerType: 'experiment' }));
  const archive = (career) => run(async () => { if (window.confirm(`Arquivar “${career.save_name}”?`)) await archiveCareer(career.id); });
  const remove = (career) => run(async () => { if (window.confirm(`Excluir definitivamente “${career.save_name}”?`)) await deleteCareer(career.id); });
  const visibleCareers = careers.filter((career) => !career.archived);

  return <div className="min-h-screen bg-background text-foreground p-4 md:p-8"><div className="max-w-5xl mx-auto">
    <header className="text-center mb-10"><p className="text-primary font-bold tracking-[0.25em] text-xs">PADEL LEGACY OFFLINE</p><h1 className="text-4xl md:text-6xl font-black tracking-tight mt-2">Construa seu legado</h1><p className="text-muted-foreground mt-3">Comece uma nova jornada ou continue de onde parou.</p></header>
    {(error || providerError) && <div className="mb-5 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">{error || providerError}</div>}
    <div className="grid md:grid-cols-2 gap-4 mb-8">
      <button onClick={create} disabled={creating || loading} className="glass rounded-2xl p-8 text-left border border-primary/30 hover:border-primary transition-colors disabled:opacity-60"><Plus className="h-10 w-10 text-primary mb-5"/><h2 className="text-2xl font-black">Nova Carreira</h2><p className="text-muted-foreground mt-2">Entre imediatamente no jogo e defina seu atleta pelo tutorial.</p></button>
      <div className="glass rounded-2xl p-8 border border-border/50"><Play className="h-10 w-10 text-primary mb-5"/><h2 className="text-2xl font-black">Continuar Carreira</h2><p className="text-muted-foreground mt-2">Selecione abaixo uma carreira existente.</p></div>
    </div>
    {loading ? <p>Carregando saves locais...</p> : visibleCareers.length === 0 ? <div className="glass rounded-2xl p-8 text-center"><UserRound className="h-10 w-10 text-primary mx-auto mb-3"/><p className="text-muted-foreground">Nenhuma carreira criada.</p></div> : <div className="grid md:grid-cols-2 gap-4">{visibleCareers.map((career) => <article key={career.id} className="glass rounded-2xl p-5 border border-border/50"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h2 className="text-xl font-bold">{career.save_name}</h2>{career.career_type === 'experiment' && <span className="text-xs rounded-full bg-primary/15 text-primary px-2 py-1 inline-flex items-center gap-1"><FlaskConical className="h-3 w-3"/> Experimento</span>}</div><p className="text-muted-foreground mt-1">{career.player_name} · {positionLabel(career.court_side)} · {styleLabel(career.play_style)}</p></div><button onClick={() => play(career.id)} className="rounded-xl bg-primary text-primary-foreground p-3" title="Jogar"><Play className="h-5 w-5"/></button></div><div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-border/40"><button onClick={() => play(career.id)} className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold"><Play className="h-4 w-4"/> Jogar</button><button onClick={() => duplicate(career)} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><Copy className="h-4 w-4"/> Duplicar</button><button onClick={() => rename(career)} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><Pencil className="h-4 w-4"/> Renomear</button><button onClick={() => archive(career)} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><Archive className="h-4 w-4"/> Arquivar</button><button onClick={() => remove(career)} className="inline-flex items-center gap-2 rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive"><Trash2 className="h-4 w-4"/></button></div></article>)}</div>}
  </div></div>;
}
