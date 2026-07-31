import React, { useMemo, useState, useEffect } from 'react';
import { Users, Search, Heart, Swords, Handshake, GraduationCap, Zap, TrendingUp, MessageCircle, X, RefreshCw, Trophy } from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import { getPlayerRelationships, getRelationshipEffects, interactSocially, checkSpecialRelationshipEvents, generateRelationshipInterview } from '@/lib/relationships';
import { ensurePlayerRelationships } from '@/game-core/relationshipLifecycle';
import { PageHeader, FilterPills, EmptyStateCard, LoadingScreen } from '@/components/padel/ui';
import RelationshipCard from '@/components/relationships/RelationshipCard';
import InteractionPanel from '@/components/relationships/InteractionPanel';

export default function Relationships() {
  const [profile, setProfile] = useState(null);
  const [relationships, setRelationships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [interviewQuote, setInterviewQuote] = useState('');

  useEffect(() => { load(); }, []);

  async function load(forceSeed = true) {
    setLoading(true);
    try {
      const p = await localGame.entities.PlayerProfile.list('-created_date', 1);
      if (p?.[0]) {
        setProfile(p[0]);
        if (forceSeed) await ensurePlayerRelationships(p[0]);
        setRelationships((await getPlayerRelationships(p[0].id)) || []);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function handleSeed() {
    if (!profile) return;
    setSeeding(true);
    await ensurePlayerRelationships(profile);
    setRelationships((await getPlayerRelationships(profile.id)) || []);
    setSeeding(false);
  }

  async function handleInteract(actionId) {
    if (!selected || !profile) return;
    await interactSocially(profile.id, selected.target_athlete_id, selected.target_name, actionId);
    const updated = await getPlayerRelationships(profile.id);
    setRelationships(updated || []);
    const updatedRel = (updated || []).find(r => r.id === selected.id);
    if (updatedRel) setSelected(updatedRel);
  }

  const filtered = useMemo(() => relationships.filter(r => {
    if (activeFilter !== 'all' && r.relationship_type !== activeFilter) return false;
    return !search || (r.target_name || '').toLowerCase().includes(search.toLowerCase());
  }).sort((a, b) => Math.abs(Number(b.score) || 0) - Math.abs(Number(a.score) || 0)), [relationships, activeFilter, search]);

  const effects = useMemo(() => getRelationshipEffects(relationships), [relationships]);
  const specialEvents = useMemo(() => checkSpecialRelationshipEvents(relationships), [relationships]);
  const rivals = relationships.filter(r => ['rival', 'inimigo'].includes(r.relationship_type)).length;
  const allies = relationships.filter(r => ['amigo', 'parceiro', 'mentor'].includes(r.relationship_type)).length;
  const chemistry = relationships.length ? Math.round(relationships.reduce((sum, r) => sum + (Number(r.chemistry) || 0), 0) / relationships.length) : 0;

  const filters = [
    { id: 'all', label: 'Todos' }, { id: 'amigo', label: 'Amigos' }, { id: 'rival', label: 'Rivais' },
    { id: 'parceiro', label: 'Parceiros' }, { id: 'inimigo', label: 'Inimigos' }, { id: 'respeito', label: 'Respeito' }, { id: 'mentor', label: 'Mentores' },
  ];

  if (loading) return <LoadingScreen />;

  return (
    <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto space-y-5 animate-fade-in">
      <PageHeader icon={Users} title="Relacionamentos" subtitle="Amizades, rivalidades e reputação no circuito" accent="primary" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <EffectStat icon={Users} label="Contatos" value={relationships.length} color="text-primary" />
        <EffectStat icon={Heart} label="Aliados" value={allies} color="text-green-400" />
        <EffectStat icon={Swords} label="Rivais" value={rivals} color="text-orange-400" />
        <EffectStat icon={Handshake} label="Química média" value={chemistry} color="text-cyan-400" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <EffectStat icon={Heart} label="Bônus moral" value={`+${effects.moraleBonus}`} color="text-pink-400" />
        <EffectStat icon={Zap} label="Performance" value={`+${effects.performanceBonus}`} color="text-primary" />
        <EffectStat icon={TrendingUp} label="Patrocínio" value={`+${effects.sponsorBonus}`} color="text-amber-400" />
        <EffectStat icon={Trophy} label="Química" value={`+${effects.chemistryBonus}`} color="text-cyan-400" />
      </div>

      {specialEvents.length > 0 && <div className="glass rounded-2xl p-3 border border-primary/30 bg-primary/5">
        <p className="text-[10px] uppercase tracking-wide text-primary font-bold mb-2">Eventos especiais</p>
        <div className="space-y-1.5">{specialEvents.slice(0, 4).map((ev, i) => <div key={`${ev.type}-${i}`} className="flex items-start gap-2"><span className="text-primary">◆</span><div><p className="text-xs font-bold">{ev.title}</p><p className="text-[10px] text-muted-foreground">{ev.description}</p><p className="text-[9px] text-primary">{ev.effect}</p></div></div>)}</div>
      </div>}

      <div className="flex gap-2">
        <div className="glass rounded-2xl p-3 flex items-center gap-2 flex-1"><Search className="h-4 w-4 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar atleta..." className="flex-1 bg-transparent text-sm outline-none" /></div>
        <button onClick={handleSeed} disabled={seeding} className="glass rounded-2xl px-4 flex items-center gap-2 text-xs font-bold hover:bg-secondary/60 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${seeding ? 'animate-spin' : ''}`} /> Sincronizar</button>
      </div>

      <FilterPills filters={filters} activeFilter={activeFilter} onFilterChange={setActiveFilter} />
      {filtered.length === 0 ? <EmptyStateCard icon={Users} title="Sem relacionamentos" message="Use Sincronizar para conhecer atletas do circuito ou jogue partidas para criar novas histórias." /> : <div className="grid sm:grid-cols-2 gap-3 animate-stagger">{filtered.map(rel => <RelationshipCard key={rel.id || rel.target_athlete_id} relationship={rel} onClick={() => { setSelected(rel); setInterviewQuote(''); }} />)}</div>}

      {selected && <><div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={() => setSelected(null)} /><div className="fixed bottom-0 inset-x-0 z-50 md:absolute md:bottom-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-lg p-4"><div className="glass-premium rounded-3xl p-4 max-h-[80vh] overflow-y-auto scrollbar-none animate-slide-up"><div className="flex items-center justify-between mb-3"><div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Relacionamento</p><h2 className="text-lg font-black">{selected.target_name}</h2></div><button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-secondary/60"><X className="h-5 w-5" /></button></div><InteractionPanel relationship={selected} onInteract={handleInteract} onClose={() => setSelected(null)} /><div className="glass rounded-2xl p-3 mt-3"><div className="flex items-center justify-between mb-2"><p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold flex items-center gap-1.5"><MessageCircle className="h-3 w-3" /> Entrevista</p><button onClick={() => setInterviewQuote(generateRelationshipInterview(selected, 'neutral'))} className="text-[10px] font-bold text-primary">Gerar frase</button></div>{interviewQuote ? <p className="text-xs italic">“{interviewQuote}”</p> : <p className="text-[10px] text-muted-foreground">Gere uma declaração sobre este atleta.</p>}</div>{(selected.history || []).length > 0 && <div className="glass rounded-2xl p-3 mt-3"><p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mb-2">Histórico</p><div className="space-y-1.5 max-h-40 overflow-y-auto">{[...(selected.history || [])].reverse().map((h, i) => <div key={i} className="flex gap-2 text-[10px]"><span className={h.score_change > 0 ? 'text-green-400' : h.score_change < 0 ? 'text-red-400' : 'text-muted-foreground'}>{h.score_change > 0 ? '+' : ''}{h.score_change}</span><div><p>{h.description}</p><p className="text-muted-foreground">{h.date}</p></div></div>)}</div></div>}</div></div></>}
    </div>
  );
}

function EffectStat({ icon: Icon, label, value, color }) {
  return <div className="glass rounded-xl p-2.5"><Icon className={`h-4 w-4 ${color} mb-1`} /><p className={`text-lg font-black tabular-nums ${color}`}>{value}</p><p className="text-[8px] text-muted-foreground uppercase tracking-wide">{label}</p></div>;
}
