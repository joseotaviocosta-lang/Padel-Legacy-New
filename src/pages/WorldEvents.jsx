import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Globe, Sparkles, RefreshCw, Flame } from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import { ensureMyProfile } from '@/lib/padel';
import { EmptyStateCard, GlassCard, FilterPills } from '@/components/padel/ui';
import WorldEventCard from '@/components/world/WorldEventCard';
import { ensureWorldEvents, getRecentWorldEvents, EVENT_TYPES, EVENT_TYPE_META, generateWorldEvents } from '@/lib/world';
import { ensureMacroEvents, computeCombinedEffects, MACRO_EVENT_TYPES, MACRO_EVENT_META } from '@/lib/worldEvents';
import { loadModuleTasks } from '@/lib/moduleLoading';
import { Page, PageContent, PageHeader, PageSkeleton, ModalShell } from '@/components/design-system';

const ALL_FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'macro', label: 'Eventos do Universo' },
  ...MACRO_EVENT_TYPES.map(t => ({ id: t, label: MACRO_EVENT_META[t].label })),
  ...EVENT_TYPES.map(t => ({ id: t, label: EVENT_TYPE_META[t].label })),
];

const EFFECT_SUMMARY = [
  { key: 'training_bonus', label: 'Bônus de Treino', icon: 'Brain', color: 'text-primary', fmt: v => `+${v}` },
  { key: 'xp_modifier', label: 'XP', icon: 'Zap', color: 'text-primary', fmt: v => `${v >= 1 ? '+' : ''}${Math.round((v - 1) * 100)}%` },
  { key: 'coin_modifier', label: 'Moedas', icon: 'Coins', color: 'text-yellow-400', fmt: v => `${v >= 1 ? '+' : ''}${Math.round((v - 1) * 100)}%` },
  { key: 'market_modifier', label: 'Mercado', icon: 'TrendingUp', color: 'text-cyan-400', fmt: v => `${v >= 1 ? '+' : ''}${Math.round((v - 1) * 100)}%` },
  { key: 'fan_appeal_bonus', label: 'Torcida', icon: 'Heart', color: 'text-pink-400', fmt: v => `+${v}` },
  { key: 'sponsor_appeal_bonus', label: 'Patrocinadores', icon: 'Award', color: 'text-green-400', fmt: v => `+${v}` },
  { key: 'injury_risk_modifier', label: 'Risco Lesão', icon: 'Shield', color: 'text-red-400', fmt: v => `${v}` },
  { key: 'energy_cost_modifier', label: 'Energia', icon: 'Activity', color: 'text-amber-400', fmt: v => `${v >= 1 ? '+' : ''}${Math.round((v - 1) * 100)}%` },
  { key: 'match_reward_modifier', label: 'Recomp. Partidas', icon: 'Trophy', color: 'text-purple-400', fmt: v => `${v >= 1 ? '+' : ''}${Math.round((v - 1) * 100)}%` },
];

const PAGE_SIZE = 12;

export default function WorldEventsPage() {
  const [searchParams] = useSearchParams();
  const [profile, setProfile] = useState(null);
  const [events, setEvents] = useState([]);
  const [macroEvents, setMacroEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [generating, setGenerating] = useState(false);
  const [initializationError, setInitializationError] = useState('');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const careerDate = profile?.career_date || new Date().toISOString().slice(0, 10);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [filter]);

  useEffect(() => { load(); }, []);

  async function load() {
      setLoading(true);
      setInitializationError('');
      try {
        const user = await localGame.auth.me();
        const p = await ensureMyProfile(user);
        setProfile(p);
        const date = p?.career_date || new Date().toISOString().slice(0, 10);
        await ensureWorldEvents(date, 15);
        const { list, macros } = await loadModuleTasks({
          list: { task: () => getRecentWorldEvents(50), fallback: [], label: 'eventos mundiais recentes' },
          macros: { task: () => ensureMacroEvents(date, 2), fallback: [], label: 'macroeventos' },
        });
        setEvents(list || []);
        setMacroEvents(macros || []);
      } catch (e) {
        console.error('[WorldEvents] falha na inicialização', e);
        setInitializationError(e.message || 'Não foi possível inicializar os eventos mundiais.');
      }
      finally { setLoading(false); }
  }

  async function handleRefresh() {
    setGenerating(true);
    try {
      await generateWorldEvents(careerDate, 3);
      const list = await getRecentWorldEvents(50);
      setEvents(list || []);
    } catch (e) { console.error(e); }
    finally { setGenerating(false); }
  }

  const activeMacros = macroEvents.filter(e => e.is_active !== false);
  const combined = computeCombinedEffects(activeMacros);
  const allEvents = [...activeMacros, ...macroEvents.filter(e => e.is_active === false), ...events];

  useEffect(() => {
    const requestedId = searchParams.get('event');
    if (!requestedId || loading) return;
    const requested = allEvents.find((event) => String(event.id) === requestedId);
    if (requested) setSelectedEvent(requested);
  }, [events, loading, macroEvents, searchParams]);

  let filtered;
  if (filter === 'all') filtered = allEvents;
  else if (filter === 'macro') filtered = macroEvents;
  else filtered = allEvents.filter(e => e.event_type === filter);

  if (loading) return <PageSkeleton variant="grid" rows={6} />;

  const visible = filtered.slice(0, visibleCount);

  return (
    <Page size="default">
    <PageContent>
      <PageHeader
        icon={Globe}
        title="Eventos Mundiais"
        description="O universo do padel em movimento — resultados, mercado e histórias do circuito."
        tone="brand"
        breadcrumb={['Mundo', 'Eventos mundiais']}
        action={(
          <button
            onClick={handleRefresh}
            disabled={generating}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${generating ? 'animate-spin' : ''}`} /> Atualizar
          </button>
        )}
      />

      {initializationError && (
        <GlassCard className="border-red-500/30 bg-red-500/5 flex items-center gap-3">
          <span className="flex-1 text-sm text-red-200">{initializationError}</span>
          <button type="button" onClick={load} className="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">Tentar novamente</button>
        </GlassCard>
      )}

      {/* Active macro events with combined effects */}
      {activeMacros.length > 0 && (
        <GlassCard className="border-primary/30">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="font-bold text-sm">Eventos Ativos no Universo</h2>
            <span className="text-[10px] text-muted-foreground">({activeMacros.length})</span>
          </div>

          {/* Combined effects summary */}
          <div className="flex flex-wrap gap-2 mb-4 p-3 rounded-xl bg-secondary/30">
            {EFFECT_SUMMARY.map(({ key, label, color, fmt }) => {
              const val = combined[key];
              if (val === undefined || val === null) return null;
              if (typeof val === 'number' && val === (key.includes('modifier') ? 1 : 0)) return null;
              return (
                <span key={key} className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg bg-secondary/60 ${color}`}>
                  {fmt(val)} {label}
                </span>
              );
            })}
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            {activeMacros.map(e => <WorldEventCard key={e.id} event={e} profile={profile} />)}
          </div>
        </GlassCard>
      )}

      {/* Breaking news ticker */}
      {allEvents.filter(e => e.tier === 'breaking').length > 0 && (
        <GlassCard className="border-red-500/30 bg-red-500/5">
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-red-400 animate-pulse shrink-0" />
            <p className="text-xs text-red-300 font-semibold truncate">
              {allEvents.filter(e => e.tier === 'breaking')[0]?.title}
            </p>
          </div>
        </GlassCard>
      )}

      {/* Filters */}
      <FilterPills filters={ALL_FILTERS} activeFilter={filter} onFilterChange={setFilter} />

      {/* Feed */}
      {filtered.length === 0 ? (
        <EmptyStateCard icon={Globe} title="Sem eventos" message={filter === 'all' ? 'Nenhuma movimentação recente.' : 'Nenhum evento disponível neste filtro.'} />
      ) : (
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3 animate-stagger">
            {visible.map(e => <WorldEventCard key={e.id} event={e} profile={profile} />)}
          </div>
          {visibleCount < filtered.length && (
            <button
              type="button"
              onClick={() => setVisibleCount((value) => value + PAGE_SIZE)}
              className="w-full rounded-xl border border-border/60 px-4 py-3 text-sm font-bold text-primary"
            >
              Carregar mais
            </button>
          )}
        </div>
      )}
      <ModalShell open={Boolean(selectedEvent)} onClose={() => setSelectedEvent(null)} title={selectedEvent?.title} description="Evento do universo" size="sm">
        {selectedEvent && <WorldEventCard event={selectedEvent} profile={profile} />}
      </ModalShell>
    </PageContent>
    </Page>
  );
}
