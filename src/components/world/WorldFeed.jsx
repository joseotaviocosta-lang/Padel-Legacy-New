import React, { useEffect, useState } from 'react';
import { Globe, RefreshCw, Flame, Sparkles, Calendar } from 'lucide-react';
import WorldEventCard from '@/components/world/WorldEventCard';
import { FilterPills, EmptyStateCard, GlassCard } from '@/components/padel/ui';
import { ensureWorldEvents, getRecentWorldEvents, EVENT_TYPES, EVENT_TYPE_META, generateWorldEvents } from '@/lib/world';
import { ensureMacroEvents, MACRO_EVENT_TYPES, MACRO_EVENT_META } from '@/lib/worldEvents';

const ALL_FILTERS = [
  { id: 'all', label: 'Todos' },
  ...EVENT_TYPES.map(t => ({ id: t, label: EVENT_TYPE_META[t].label })),
  ...MACRO_EVENT_TYPES.map(t => ({ id: t, label: MACRO_EVENT_META[t].label })),
];

export default function WorldFeed({ profile }) {
  const [events, setEvents] = useState([]);
  const [macroEvents, setMacroEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [generating, setGenerating] = useState(false);
  const careerDate = profile?.career_date || new Date().toISOString().slice(0, 10);

  useEffect(() => {
    (async () => {
      try {
        await ensureWorldEvents(careerDate, 15);
        const [list, macros] = await Promise.all([
          getRecentWorldEvents(40),
          ensureMacroEvents(careerDate, 2),
        ]);
        setEvents(list || []);
        setMacroEvents(macros || []);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [careerDate]);

  async function handleGenerate() {
    setGenerating(true);
    try {
      await generateWorldEvents(careerDate, 3);
      const list = await getRecentWorldEvents(40);
      setEvents(list || []);
    } catch (e) { console.error(e); }
    finally { setGenerating(false); }
  }

  const allEvents = [...macroEvents, ...events];
  const filtered = filter === 'all' ? allEvents : allEvents.filter(e => e.event_type === filter);
  const breakingCount = allEvents.filter(e => e.tier === 'breaking').length;
  const activeMacroCount = macroEvents.filter(e => e.is_active !== false).length;

  return (
    <div className="space-y-4">
      {/* Active macro events banner */}
      {activeMacroCount > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="font-bold text-sm">Eventos do Universo Ativos</h3>
            <span className="text-[10px] text-muted-foreground">({activeMacroCount})</span>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {macroEvents.filter(e => e.is_active !== false).map(e => (
              <WorldEventCard key={e.id} event={e} />
            ))}
          </div>
        </div>
      )}

      {/* Breaking news ticker */}
      {breakingCount > 0 && (
        <GlassCard className="border-red-500/30 bg-red-500/5">
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-red-400 animate-pulse shrink-0" />
            <p className="text-xs text-red-300 font-semibold truncate">
              {allEvents.filter(e => e.tier === 'breaking')[0]?.title}
            </p>
          </div>
        </GlassCard>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" />
          <h2 className="font-bold text-sm">Mundo do Padel</h2>
          <span className="text-[10px] text-muted-foreground">({filtered.length})</span>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${generating ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      {/* Filters */}
      <FilterPills filters={ALL_FILTERS} activeFilter={filter} onFilterChange={setFilter} />

      {/* Feed */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="w-6 h-6 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyStateCard icon={Globe} title="Sem notícias" message="Nenhum evento disponível neste filtro." />
      ) : (
        <div className="grid sm:grid-cols-2 gap-3 animate-stagger">
          {filtered.map(e => <WorldEventCard key={e.id} event={e} />)}
        </div>
      )}
    </div>
  );
}