import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Users, Search, SlidersHorizontal } from 'lucide-react';
import { ensureMyProfile } from '@/lib/padel';
import { localGame } from '@/api/localGameClient.js';
import { PageHeader, FilterPills } from '@/components/padel/ui';
import { PageSkeleton } from '@/components/design-system';
import { ensureAthleteProfiles, generateRelationships, getAthletes, PERSONALITIES } from '@/lib/athleteBehavior';
import AthleteCard from '@/components/athletes/AthleteCard';
import AthleteDetail from '@/components/athletes/AthleteDetail';
import { useCareer } from '@/careers/useCareer.js';
import { spectatorStore } from '@/gameplay/replay/spectator/SpectatorStore.js';

const PAGE_SIZE = 60;

const PHASE_FILTERS = [
  { id: 'all', label: 'Todas' },
  { id: 'Ascensão', label: 'Ascensão' },
  { id: 'Auge', label: 'Auge' },
  { id: 'Declínio', label: 'Declínio' },
  { id: 'Veterano', label: 'Veteranos' },
];

export default function Athletes() {
  const {activeCareer}=useCareer();
  const [followedPlayers,setFollowedPlayers]=useState(new Set());
  const [athletes, setAthletes] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [phaseFilter, setPhaseFilter] = useState('all');
  const [persFilter, setPersFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [styleFilter, setStyleFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('ranking');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  useEffect(() => {
    (async () => {
      try {
        const user = await localGame.auth.me();
        const p = await ensureMyProfile(user);
        setProfile(p);
        await ensureAthleteProfiles();
        await generateRelationships();
        const list = await getAthletes();
        setAthletes(list);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);
  useEffect(()=>{if(activeCareer?.career_id)spectatorStore.load(activeCareer.career_id).then((state)=>setFollowedPlayers(new Set(state.followed_player_ids)));},[activeCareer?.career_id]);
  async function toggleFollow(id){const next=await spectatorStore.toggle(activeCareer.career_id,'followed_player_ids',id);setFollowedPlayers(new Set(next.followed_player_ids));}

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [phaseFilter, persFilter, styleFilter, deferredSearch, sortBy]);

  const filtered = useMemo(() => athletes
    .filter(a => phaseFilter === 'all' || a.career_phase === phaseFilter)
    .filter(a => persFilter === 'all' || a.personality === persFilter)
    .filter(a => styleFilter === 'all' || a.play_style === styleFilter)
    .filter(a => !deferredSearch || `${a.name || ''} ${a.country || ''}`.toLowerCase().includes(deferredSearch))
    .sort((a, b) => {
      if (sortBy === 'form') return Number(b.form || b.current_form || 0) - Number(a.form || a.current_form || 0);
      if (sortBy === 'clutch') return Number(b.behavior_axes?.clutch || 0) - Number(a.behavior_axes?.clutch || 0);
      if (sortBy === 'overall') return Number(b.overall_rating || 0) - Number(a.overall_rating || 0);
      return Number(a.ranking_position || 9999) - Number(b.ranking_position || 9999);
    }), [athletes, phaseFilter, persFilter, styleFilter, deferredSearch, sortBy]);

  const PERS_FILTERS = [{ id: 'all', label: 'Todas' }, ...PERSONALITIES.map(p => ({ id: p.id, label: p.label }))];
  const STYLE_FILTERS = [
    { id: 'all', label: 'Todos os estilos' },
    { id: 'Agressivo', label: 'Agressivo' },
    { id: 'Defensivo', label: 'Defensivo' },
    { id: 'Equilibrado', label: 'Equilibrado' },
    { id: 'Tático', label: 'Tático' },
    { id: 'Potência', label: 'Potência' },
  ];

  if (loading) return <PageSkeleton variant="grid" rows={6} />;

  return (
    <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto space-y-6 animate-fade-in">
      <PageHeader icon={Users} title="Atletas do Circuito" subtitle="Personalidades, evolução e relacionamentos dos atletas IA" accent="primary" />

      <div className="glass rounded-2xl p-3 grid gap-3 md:grid-cols-[1fr_180px]">
        <label className="relative block">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar atleta ou país..." className="w-full rounded-xl border border-border bg-background/50 pl-9 pr-3 py-2 text-sm" />
        </label>
        <label className="relative block">
          <SlidersHorizontal className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="w-full rounded-xl border border-border bg-background/50 pl-9 pr-3 py-2 text-sm">
            <option value="ranking">Ordenar: ranking</option>
            <option value="overall">Ordenar: overall</option>
            <option value="form">Ordenar: melhor forma</option>
            <option value="clutch">Ordenar: decisões</option>
          </select>
        </label>
      </div>

      <FilterPills filters={PHASE_FILTERS} activeFilter={phaseFilter} onFilterChange={setPhaseFilter} />
      <FilterPills filters={PERS_FILTERS} activeFilter={persFilter} onFilterChange={setPersFilter} />
      <FilterPills filters={STYLE_FILTERS} activeFilter={styleFilter} onFilterChange={setStyleFilter} />

      {filtered.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center">
          <Users className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum atleta encontrado com esses filtros.</p>
        </div>
      ) : (
        <div className="render-window grid sm:grid-cols-2 lg:grid-cols-3 gap-3 animate-stagger">
          {filtered.slice(0, visibleCount).map(a => <AthleteCard key={a.id} athlete={a} onClick={() => setSelected(a)} />)}
        </div>
      )}

      {filtered.length > visibleCount && (
        <button type="button" onClick={() => setVisibleCount(value => value + PAGE_SIZE)} className="w-full rounded-xl border border-border/60 px-4 py-3 text-sm font-bold text-primary">
          Carregar mais atletas ({Math.min(PAGE_SIZE, filtered.length - visibleCount)})
        </button>
      )}

      {selected && <AthleteDetail athlete={selected} followed={followedPlayers.has(selected.id)} onToggleFollow={toggleFollow} onClose={() => setSelected(null)} />}
    </div>
  );
}
